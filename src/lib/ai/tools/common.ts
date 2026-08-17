import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { messages } from '@/lib/ai/messages'
import { webSearchCacheKey } from './cacheKeys'

// ===== In-memory cache (theo Vercel instance, giam goi API lap lai cho cung 1 query) =====
type CacheEntry = { data: unknown; expires: number }
const cache = new Map<string, CacheEntry>()

export function getCache(key: string): unknown | null {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.data
  if (hit) cache.delete(key)
  return null
}

export function setCache(key: string, data: unknown, ttlMs: number) {
  if (cache.size > 300) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
  cache.set(key, { data, expires: Date.now() + ttlMs })
}

// ===== GOOGLE PLACES PHOTO — LIVE SOURCE ONLY =====
// Google Maps Platform Terms of Service: Places content (photos) must not be pre-fetched,
// cached, or stored beyond the request — only place_id (indefinitely) and lat/lng (<=30 days)
// are exempt. This function therefore never persists the result; every call hits Google live.
// photoName is the full resource path returned by Places API (New), e.g. "places/ChIJ.../photos/AeZ..."
export async function fetchPlacePhoto(placeId: string, photoName: string): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key || !photoName) {
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'api_skipped', placeId, hasKey: !!key, hasPhotoName: !!photoName }))
    return null
  }
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 3000)
  try {
    // New API resource names (places/ChIJ.../photos/AeZ...) → use Places API (New) media endpoint
    // Legacy photo_reference tokens → use old Maps API endpoint
    const photoApiUrl = photoName.includes('/')
      ? `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&key=${key}`
      : `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoName}&key=${key}`
    const resp = await fetch(photoApiUrl, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(tid)
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'api_result', placeId, status: resp.status, ok: resp.ok, finalUrl: resp.url?.slice(0, 60) || null }))
    if (!resp.ok) return null
    const photoUri = resp.url
    const safe = !!photoUri && !photoUri.includes('maps.googleapis.com')
    if (!photoUri || !safe) return null
    return photoUri
  } catch (e) {
    clearTimeout(tid)
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'api_exception', placeId, error: String(e) }))
    return null
  }
}

// ===== OFFICIAL WEBSITE IMAGE (og:image) — live only, short timeout, never blocks =====
// Highest-priority source: an image the business itself publishes on its own site.
// Bounded read (stops once <head> is seen or MAX_BYTES hit) + hard timeout so a slow/dead
// site can never delay the overall place response — any failure here just falls through.
export async function fetchOfficialWebsiteImage(websiteUri: string): Promise<string | null> {
  if (!websiteUri) return null
  // SSRF guard: only fetch public https hosts. The URL originates from
  // search/Places data (not a fixed host), so a result pointing at an internal
  // address (e.g. cloud metadata) must never be fetched server-side.
  if (!isSafeHttpsUrl(websiteUri)) return null
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 1800)
  try {
    const resp = await fetch(websiteUri, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TappyAI/1.0; +https://tappyai.com)' },
    })
    if (!resp.ok || !resp.body) { clearTimeout(tid); return null }
    const contentType = resp.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) { clearTimeout(tid); return null }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let html = ''
    let bytesRead = 0
    const MAX_BYTES = 100_000
    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.length
      html += decoder.decode(value, { stream: true })
      if (/<\/head>/i.test(html)) break
    }
    reader.cancel().catch(() => {})
    clearTimeout(tid)

    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    const raw = match?.[1]
    if (!raw) return null
    // HTML attribute values commonly escape '&' as '&amp;' (valid HTML) — without decoding,
    // a URL with multiple query params (typical for CDN tracking links) comes out malformed.
    const decoded = raw.replace(/&amp;/g, '&')
    return new URL(decoded, websiteUri).toString()
  } catch (e) {
    clearTimeout(tid)
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'website_image_failed', websiteUri: websiteUri.slice(0, 60), error: String(e).slice(0, 80) }))
    return null
  }
}

// Encode ky tu '(' ')' trong URL de khong vo cu phap markdown link [text](url)
export function sanitizeUrlForMarkdown(link: string): string {
  return link.replace(/\(/g, '%28').replace(/\)/g, '%29')
}

// ===== EMBEDDABLE IMAGE PICKER =====
// Serper image results carry BOTH the original (imageUrl — often on a hotlink-protected
// host such as Instagram/Facebook CDN, which a browser <img> cannot load) AND a Google-hosted
// thumbnail (thumbnailUrl on encrypted-tbn0.gstatic.com — a Google CDN with NO hotlink
// protection, so it always renders in the browser). We prefer the embeddable Google host.
const HOTLINK_BLOCKED_HOSTS = ['lookaside.instagram.com', 'instagram.', 'cdninstagram', 'fbcdn.net', 'fbsbx.com', 'facebook.com', 'pinimg.com']
const EMBEDDABLE_HOSTS = ['gstatic.com', 'googleusercontent.com', 'ggpht.com', 'bing.com', 'bing.net']

function hostOf(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}
function isBlockedHost(url: string): boolean {
  const h = hostOf(url)
  return HOTLINK_BLOCKED_HOSTS.some(b => h.includes(b))
}
function isEmbeddableHost(url: string): boolean {
  const h = hostOf(url)
  return EMBEDDABLE_HOSTS.some(b => h.includes(b))
}

// Simple heuristic (no AI/classification): Serper's Google Images results include plenty of
// logos, icons, and ad banners mixed in with real venue photos. Skip anything small/square-icon
// sized or whose title/domain says "logo"/"icon" outright; keep Serper's own relevance order
// otherwise (it's already ranked by Google Image Search for the query).
const LOGO_ICON_KEYWORDS = ['logo', 'icon', 'favicon']
type SerperImage = { imageUrl?: string; thumbnailUrl?: string; imageWidth?: number; imageHeight?: number; title?: string; domain?: string }

function looksLikeLogoOrIcon(img: SerperImage): boolean {
  const { imageWidth: w, imageHeight: h } = img
  if (w && h && (w < 300 || h < 300)) return true
  const text = `${img.title || ''} ${img.domain || ''}`.toLowerCase()
  return LOGO_ICON_KEYWORDS.some(k => text.includes(k))
}

const FOOD_VENUE_KEYWORDS = [
  'nhà hàng', 'quán ăn', 'quán cafe', 'quán nhậu', 'restaurant', 'cafe', 'coffee',
  'buffet', 'menu', 'món ăn', 'ẩm thực', 'đồ ăn', 'food', 'foody',
  'bếp', 'kitchen', 'grill', 'sushi', 'pizza', 'burger', 'bánh',
  'lẩu', 'nướng', 'phở', 'bún', 'cơm', 'trà sữa',
  'foody.vn', 'shopeefood', 'grabfood', 'loship',
]

function looksLikeFoodVenue(img: SerperImage): boolean {
  const text = `${img.title || ''} ${img.domain || ''}`.toLowerCase()
  return FOOD_VENUE_KEYWORDS.some(k => text.includes(k))
}

// Returns up to `max` distinct embeddable URLs, in the same preference order pickEmbeddableImageUrl
// uses for its single pick (gstatic-hosted thumbnail > non-hotlink-blocked original > any
// thumbnail > last-resort original), just not stopping after the first match.
export type ImageContext = 'shopping' | 'food' | 'travel' | 'default'

export function pickEmbeddableImageUrls(images: SerperImage[] | undefined, max = 3, context: ImageContext = 'default'): string[] {
  if (!images || images.length === 0) return []
  const nonLogoIcon = images.filter(img => !looksLikeLogoOrIcon(img))
  const pool = nonLogoIcon.length > 0 ? nonLogoIcon : images // don't filter down to nothing

  // Shopping must NEVER show food/restaurant images — unlike the logo/icon heuristic above,
  // this filter does not fall back to the unfiltered pool. If every candidate looks like a
  // food venue, return no images at all so the caller falls back to a placeholder instead.
  if (context === 'shopping') {
    const noFood = pool.filter(img => !looksLikeFoodVenue(img))
    if (noFood.length === 0) return []
    return pickFromPool(noFood, max)
  }

  return pickFromPool(pool, max)
}

function pickFromPool(pool: SerperImage[], max: number): string[] {
  const picked: string[] = []
  const seen = new Set<string>()
  const add = (url: string | undefined) => {
    if (picked.length >= max || !url || seen.has(url)) return
    seen.add(url)
    picked.push(url)
  }

  for (const img of pool) if (img.thumbnailUrl && isEmbeddableHost(img.thumbnailUrl)) add(img.thumbnailUrl)
  for (const img of pool) if (img.imageUrl && !isBlockedHost(img.imageUrl)) add(img.imageUrl)
  for (const img of pool) if (img.thumbnailUrl) add(img.thumbnailUrl)
  if (picked.length === 0 && pool[0]?.imageUrl) add(pool[0].imageUrl)

  return picked
}

export function pickEmbeddableImageUrl(images: SerperImage[] | undefined): string | null {
  return pickEmbeddableImageUrls(images, 1)[0] ?? null
}

// ===== FETCH PLACE PHOTO BY NAME via Serper Images — LIVE SOURCE ONLY, no persistence =====
// Serper does not own the images it returns (its own Terms say returned content "remain[s] the
// sole responsibility of those who make it available"), so it is treated the same as Google:
// last-resort fallback, resolved fresh on every call, never written to a database.
export async function fetchPlacePhotosByName(placeId: string, placeName: string, max = 3, context: ImageContext = 'default'): Promise<string[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey || !placeName) {
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_skip', reason: !apiKey ? 'no_key' : 'no_name', placeId }))
    return []
  }
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: placeName, gl: 'vn', hl: 'vi', num: 8 }),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ])
    if (!(resp as Response).ok) {
      console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_not_ok', status: (resp as Response).status, placeId }))
      return []
    }
    const data = await (resp as Response).json()
    const images = data?.images as SerperImage[] | undefined
    const photoUris = pickEmbeddableImageUrls(images, max, context)
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_result', placeId, placeName: placeName.slice(0, 40), imageCount: images?.length ?? 0, pickedCount: photoUris.length, chosenHost: photoUris[0] ? hostOf(photoUris[0]) : null }))
    return photoUris
  } catch (e) {
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_error', placeId, error: String(e).slice(0, 80) }))
    return []
  }
}

// ===== DEFERRED PHOTO RESOLUTION (B7-A) =====
// The whole three-source chain for ONE place. It used to run inside
// searchPlaces for every one of the (up to 8) results, while the injector uses
// at most 3 for prose — measured, 5 of 8 resolutions were discarded, ~15
// billable upstream calls per search. It now runs at injection time, for exactly
// the places the reply named.
//
// Sources are additive, not first-wins, up to `max` photos:
//   1. the business's own site (og:image) — its own content, best quality
//   2. Google Places Photo, via a Details lookup for the reference
//   3. Serper image search — last resort
// All three are live-only and never persisted (Maps Platform + Serper terms).
// Any single source failing is skipped; the caller gets whatever was found.
export async function resolvePlacePhotos(
  place: { place_id?: string; name?: string; website_uri?: string },
  max = 3,
): Promise<string[]> {
  const collected: string[] = []
  const addUnique = (url: string | null | undefined) => {
    if (url && !collected.includes(url)) collected.push(url)
  }

  if (place.website_uri) {
    addUnique(await fetchOfficialWebsiteImage(place.website_uri))
  }

  const key = process.env.GOOGLE_PLACES_API_KEY
  if (collected.length < max && key && place.place_id) {
    try {
      const detailResp = await Promise.race([
        fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=photos&key=${key}`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
      ])
      const detail = await (detailResp as Response).json()
      const photoRef = (detail.result?.photos as Array<{ photo_reference: string }>)?.[0]?.photo_reference
      if (photoRef) addUnique(await fetchPlacePhoto(place.place_id, photoRef))
    } catch { /* skip on timeout or error, fall through to Serper */ }
  }

  if (collected.length < max && place.name) {
    const serperPhotos = await fetchPlacePhotosByName(
      place.place_id || place.name, place.name, max - collected.length,
    )
    serperPhotos.forEach(addUnique)
  }

  return collected.slice(0, max)
}

// Back-compat single-image wrapper for callers not yet migrated to the gallery (photo_urls[]).
export async function fetchPlacePhotoByName(placeId: string, placeName: string): Promise<string | null> {
  const photos = await fetchPlacePhotosByName(placeId, placeName, 1)
  return photos[0] ?? null
}

// ===== SERPER: Google Search API (can SERPER_API_KEY, 2500 query free) =====
export async function serperSearch(query: string): Promise<Array<{ title: string; link: string; snippet: string }> | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 8 })
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const organic = (data?.organic || []) as Array<{ title?: string; link?: string; snippet?: string }>
    const results = organic
      .filter(r => r.title && r.link)
      .slice(0, 6)
      .map(r => ({ title: r.title as string, link: sanitizeUrlForMarkdown(r.link as string), snippet: r.snippet || '' }))
    return results
  } catch {
    return null
  }
}

/**
 * A structured shopping record from Serper's `/shopping` endpoint.
 *
 * `price` is AUTHORITATIVE — the provider returns it as its own field. Nothing
 * here is parsed out of `title`, which is the defect that produced a measured 20%
 * false-accept rate when prices were read from titles (C3-B.8).
 */
export interface ShoppingRecord {
  title: string
  link: string
  /** Merchant/store, e.g. "Shopee", "Tiki". Absent when the provider omits it. */
  source?: string
  /** VND, from the provider's own price field. Absent when not returned. */
  price?: number
  productId?: string
  imageUrl?: string
  rating?: number
  ratingCount?: number
}

/**
 * Serper `/shopping` — structured product candidates.
 *
 * Same client shape as serperSearch above (same key, same timeout, same
 * sanitisation): this is a second ENDPOINT on the provider already in use, not a
 * new provider or a new search service.
 *
 * Returns null when the key is absent or the call fails, so callers keep their
 * existing organic path as fallback rather than losing shopping entirely.
 */
export async function serperShopping(query: string): Promise<ShoppingRecord[] | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 12 })
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const rows = (data?.shopping || []) as Array<Record<string, unknown>>
    return rows
      .filter(r => typeof r.title === 'string' && typeof r.link === 'string')
      .slice(0, 12)
      .map(r => {
        const out: ShoppingRecord = {
          title: r.title as string,
          link: sanitizeUrlForMarkdown(r.link as string),
        }
        // Each field is carried ONLY when the provider actually supplied it.
        // An absent field must stay absent — `undefined` means "no evidence",
        // and defaulting it to 0/'' would turn silence into a false claim.
        if (typeof r.source === 'string' && r.source) out.source = r.source
        const price = parseSerperPriceVnd(r.price)
        if (price !== null) out.price = price
        if (typeof r.productId === 'string' && r.productId) out.productId = r.productId
        if (typeof r.imageUrl === 'string' && r.imageUrl) out.imageUrl = sanitizeUrlForMarkdown(r.imageUrl)
        if (typeof r.rating === 'number' && r.rating >= 0 && r.rating <= 5) out.rating = r.rating
        if (typeof r.ratingCount === 'number' && r.ratingCount >= 0) out.ratingCount = r.ratingCount
        return out
      })
  } catch {
    return null
  }
}

/**
 * Read Serper's `price` field into VND.
 *
 * It arrives either as a number or as a formatted string ("₫6.490.000",
 * "6.490.000 ₫"). Only the provider's OWN price field is ever passed here —
 * never a title or a snippet. Anything that does not parse cleanly returns null
 * rather than a guess.
 */
export function parseSerperPriceVnd(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  if (typeof value !== 'string' || !value.trim()) return null
  // Reject anything carrying a non-VND currency: a USD figure read as VND would
  // be wrong by ~25,000x and would pass every downstream range check.
  if (/US\$|\$|USD|EUR|€|¥|£/i.test(value)) return null
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ===== WEB SEARCH: DuckDuckGo HTML (free, no API key) =====
export async function webSearch(query: string, lang = 'vi') {
  const cacheKey = webSearchCacheKey(query, lang)
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
  let result: unknown

  const serperResults = await serperSearch(query)
  if (serperResults && serperResults.length > 0) {
    result = { query, source: 'Google (Serper)', results: serperResults, search_url: fallbackUrl }
    setCache(cacheKey, result, 5 * 60 * 1000)
    return result
  }

  try {
    const resp = await Promise.race([
      fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://duckduckgo.com/',
          'Origin': 'https://duckduckgo.com',
          'Sec-Fetch-Mode': 'navigate',
        }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const html = await (resp as Response).text()

    const results: Array<{ title: string; link: string; snippet: string }> = []
    const blockRegex = /<a[^>]*class="result__a"[^>]*href="(.*?)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const stripTags = (s: string) => s
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .trim()

    let match: RegExpExecArray | null
    while ((match = blockRegex.exec(html)) && results.length < 6) {
      let link = match[1]
      const uddg = link.match(/uddg=([^&]+)/)
      if (uddg) link = decodeURIComponent(uddg[1])
      else if (link.startsWith('//')) link = 'https:' + link
      const title = stripTags(match[2])
      const snippet = stripTags(match[3])
      if (title && link) results.push({ title, link, snippet })
    }

    result = results.length === 0
      ? { note: messages.webSearch.noAutoResults(lang, query, fallbackUrl), results: [], search_url: fallbackUrl }
      : { query, source: 'DuckDuckGo', results, search_url: fallbackUrl }
  } catch {
    result = { note: messages.webSearch.unavailable(lang, fallbackUrl), results: [], search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 5 * 60 * 1000) // cache 5 phut
  return result
}
