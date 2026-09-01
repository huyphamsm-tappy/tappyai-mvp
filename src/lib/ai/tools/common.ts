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
    // 🚨 BUG-010. This used to be `fetch(websiteUri, { redirect: 'follow' })`, and the guard above
    // was the only thing in front of it. Both halves were wrong for the same reason: the guard
    // reads a STRING, and `websiteUri` is whatever a business owner typed into their Google
    // listing. `https://looks-fine.example/` passes it and can resolve to `169.254.169.254`; and
    // even a genuinely public host could answer `302 Location: http://10.0.0.5/`, which
    // `redirect: 'follow'` obeys inside the HTTP client where no code of ours ever sees it.
    //
    // Anyone with a Google Business Profile could point it at their own domain and then simply
    // ask TappyAI about their own place — the og:image we extract comes back to them, so this was
    // a read primitive and not merely a blind request.
    //
    // `safeGetText` resolves once, refuses any address that points inward, connects to exactly
    // what it validated, and walks redirects one validated hop at a time. Same primitive as Scam
    // Shield uses; see `lib/security/safeFetch.ts`.
    const { safeGetText } = await import('@/lib/security/safeFetch')
    const resp = await safeGetText(websiteUri, controller.signal, {
      maxBytes: 100_000,
      stopAt: /<\/head>/i,
    })
    clearTimeout(tid)
    if (!resp.contentType.includes('text/html')) return null
    const html = resp.text

    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    const raw = match?.[1]
    if (!raw) return null
    // HTML attribute values commonly escape '&' as '&amp;' (valid HTML) — without decoding,
    // a URL with multiple query params (typical for CDN tracking links) comes out malformed.
    const decoded = raw.replace(/&amp;/g, '&')
    // Resolved against the url the body actually came FROM, not the one we asked for. A site that
    // redirects `example.com` → `www.example.com/en/` publishes relative og:image paths that mean
    // nothing against the original; the old code could not tell the difference because the HTTP
    // client swallowed the redirect chain.
    return new URL(decoded, resp.finalUrl).toString()
  } catch (e) {
    clearTimeout(tid)
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'website_image_failed', websiteUri: websiteUri.slice(0, 60), error: String(e).slice(0, 80) }))
    return null
  }
}

// ── P3-S4: retrieved URLs are DATA and may never change rendered structure ──
//
// A URL from a merchant's og:image, a Serper image result or a web-search link
// is third-party text. Interpolated raw into `![alt](url)` it can close the
// markdown early and turn the remainder into attacker-authored markup in the
// user's reply — with the model never involved.
//
// Every character below can terminate a markdown link or the line that holds
// it, and every one of them is legal to percent-encode in a URL, so the target
// still resolves: the URL is preserved, only its ability to act as syntax is
// removed. `%` is deliberately NOT encoded, so already-encoded URLs stay intact.
//
//   ( )        close the link/image
//   space tab  start a markdown "title" inside the parentheses
//   LF CR      end the line entirely, letting arbitrary prose follow
//   < >        autolink delimiters
//   [ ]        would leave the surrounding token ambiguous to a parser
const MARKDOWN_UNSAFE_IN_URL: ReadonlyArray<[RegExp, string]> = [
  [/\(/g, '%28'], [/\)/g, '%29'],
  [/ /g, '%20'], [/\t/g, '%09'],
  [/\n/g, '%0A'], [/\r/g, '%0D'],
  [/</g, '%3C'], [/>/g, '%3E'],
  [/\[/g, '%5B'], [/\]/g, '%5D'],
]

export function sanitizeUrlForMarkdown(link: string): string {
  let out = String(link ?? '')
  for (const [pattern, replacement] of MARKDOWN_UNSAFE_IN_URL) out = out.replace(pattern, replacement)
  return out
}

/**
 * A link LABEL sits inside `[...]`, where text that closes the brackets could
 * open a link of its own.
 *
 * The structural characters are REMOVED rather than backslash-escaped on
 * purpose. Escaping only holds if the renderer honours markdown escapes, and
 * the client renderer is not verified (P3 audit F7 — still open). Removal is
 * renderer-agnostic: no parser, strict or naive, can rebuild a token out of
 * characters that are not there.
 *
 * Lossless in practice: labels come from the deterministic platform-link
 * builders ("ShopeeFood", "Google Maps", "Website"), none of which contain
 * brackets, parentheses or backslashes.
 */
export function escapeMarkdownLabel(label: string): string {
  return String(label ?? '')
    .replace(/[[\]()\\]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
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
/**
 * One step of the photo fallback chain, timed. Diagnostic only — nothing reads
 * these to decide anything, and emitting them cannot change what is fetched.
 */
export interface PhotoStepTiming {
  step: 'website' | 'places_detail' | 'places_media' | 'serper'
  ms: number
  /** The step produced at least one usable URL. */
  hit: boolean
  /** The step ended on its own timeout/abort rather than on a result. */
  timedOut: boolean
}

export async function resolvePlacePhotos(
  place: { place_id?: string; name?: string; website_uri?: string },
  max = 3,
  /**
   * Per-step timing sink (Phase 2 instrumentation).
   *
   * The enrichment tail measured 1,490 ms median on production and this chain is
   * its only network work, but the chain is four conditional steps with four
   * different timeouts (1,800 / 2,500 / 3,000 / 4,000 ms) — so "the tail is slow"
   * says nothing about WHICH step to look at. Passing a sink is the only way to
   * see that from outside without changing what runs.
   *
   * Deliberately a callback, not a return value: the return type is the photo
   * list every caller already depends on, and timing must not ride on it.
   */
  onStep?: (t: PhotoStepTiming) => void,
): Promise<string[]> {
  const collected: string[] = []
  const addUnique = (url: string | null | undefined) => {
    if (url && !collected.includes(url)) collected.push(url)
  }
  // Marks a step without altering it: same call, same order, same result. `hit`
  // is measured as "did `collected` grow", so it reports what the step actually
  // contributed rather than whether it merely returned.
  const mark = (step: PhotoStepTiming['step'], startedAt: number, before: number, timedOut = false) =>
    onStep?.({ step, ms: Date.now() - startedAt, hit: collected.length > before, timedOut })

  if (place.website_uri) {
    const t = Date.now(); const before = collected.length
    addUnique(await fetchOfficialWebsiteImage(place.website_uri))
    mark('website', t, before)
  }

  const key = process.env.GOOGLE_PLACES_API_KEY
  if (collected.length < max && key && place.place_id) {
    const tDetail = Date.now(); const beforeDetail = collected.length
    let detailTimedOut = false
    try {
      const detailResp = await Promise.race([
        fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=photos&key=${key}`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
      ])
      const detail = await (detailResp as Response).json()
      const photoRef = (detail.result?.photos as Array<{ photo_reference: string }>)?.[0]?.photo_reference
      mark('places_detail', tDetail, beforeDetail)
      if (photoRef) {
        const tMedia = Date.now(); const beforeMedia = collected.length
        addUnique(await fetchPlacePhoto(place.place_id, photoRef))
        mark('places_media', tMedia, beforeMedia)
      }
    } catch (e) {
      // Unchanged behaviour: skip on timeout or error, fall through to Serper.
      // The mark is emitted from the catch too, because a step that BURNED its
      // timeout is exactly the one worth seeing — reporting only the successes
      // would hide the slowest case there is.
      detailTimedOut = e instanceof Error && e.message === 'timeout'
      mark('places_detail', tDetail, beforeDetail, detailTimedOut)
    }
  }

  if (collected.length < max && place.name) {
    const t = Date.now(); const before = collected.length
    const serperPhotos = await fetchPlacePhotosByName(
      place.place_id || place.name, place.name, max - collected.length,
    )
    serperPhotos.forEach(addUnique)
    mark('serper', t, before)
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
 *
 * ============================================================================
 * INTEGRATION NOTE — WHY THIS SHAPE AND NOT D3's
 * ============================================================================
 * The D3 branch defined a competing `SerperShoppingRow` carrying `price` as the raw provider
 * STRING. It predates the money-guard work that landed on the release branch, and taking it would
 * have removed `parseSerperPriceVnd` and with it MIN_PLAUSIBLE_PRICE_VND — the guard that exists
 * because a real live response listed `1 ₫ | Mac24h | ThinkPad T14 Gen 7`, the "contact for price"
 * convention. That row parses as a genuine 1 VND price and scores MAXIMUM on the price term, so a
 * "ưu tiên giá rẻ" turn would have made a placeholder Tappy's Pick.
 *
 * So the guarded numeric field stays, and D3's need is met by carrying the provider's own display
 * string ALONGSIDE it rather than instead of it. Both call sites get what they need and neither
 * side's evidence is discarded.
 */
export interface ShoppingRecord {
  title: string
  link: string
  /** Merchant/store, e.g. "Shopee", "Tiki". Absent when the provider omits it. */
  source?: string
  /** VND, from the provider's own price field, and only when it passes the plausibility guard. */
  price?: number
  /**
   * The price EXACTLY as the seller listed it ("₫6.490.000"), for display.
   *
   * 🚨 Never for arithmetic, comparison or ranking — that is what [price] is for. This is
   * deliberately carried separately so that a placeholder like `1 ₫`, which [price] rejects, can
   * still be shown verbatim if a caller wants to show what the listing says, without ever
   * entering a numeric comparison as if it were a real price.
   */
  priceText?: string
  productId?: string
  imageUrl?: string
  rating?: number
  ratingCount?: number
  /** The provider's own ordering, when supplied. */
  position?: number
}

/**
 * Serper `/shopping` — structured product candidates.
 *
 * Separate from `serperSearch` because it is a different product: /search returns web pages
 * (title, link, snippet), /shopping returns LISTINGS with a seller and a price. Product
 * consultation needs the second — measured against the live endpoint, /search for
 * "macbook pro m1 32gb 512gb cũ" returned a YouTube video and a market-research report, while
 * /shopping returned 40 rows each carrying title, source, link and price.
 *
 * Contract verified against the provider on 2026-08-18: POST, X-API-KEY header, {q, gl, hl, num};
 * response {searchParameters, shopping[], credits}; title, source, link, price, imageUrl,
 * productId, position on every row; rating and ratingCount on some. No spec fields — those live
 * in the title (see productSpecs.ts). Bad auth returns 403 {message, statusCode}.
 *
 * Returns null when the key is absent or the call fails, so callers keep their existing organic
 * path as fallback rather than losing shopping entirely.
 */
export async function serperShopping(query: string, num = 20): Promise<ShoppingRecord[] | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        // `num` is a parameter (D3) rather than the old hardcoded 12: the consultative path asks
        // for 20 so the ranker has a real field to choose from, and the fallback path keeps the
        // default. The timeout goes to D3's 8s for the same reason — a 20-row request is slower,
        // and 6s was measured cutting it off.
        body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num }),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const rows = (data?.shopping || []) as Array<Record<string, unknown>>
    return rows
      // The `.slice(0, 12)` cap is gone: `num` now bounds the request itself, so slicing here
      // would silently discard rows the caller paid for and asked for.
      .filter(r => typeof r.title === 'string' && typeof r.link === 'string')
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
        // Kept even when the numeric guard rejected the value, so a caller can show what the
        // listing SAYS without ever ranking on it. See the note on ShoppingRecord.priceText.
        if (typeof r.price === 'string' && r.price) out.priceText = r.price
        if (typeof r.productId === 'string' && r.productId) out.productId = r.productId
        if (typeof r.imageUrl === 'string' && r.imageUrl) out.imageUrl = sanitizeUrlForMarkdown(r.imageUrl)
        if (typeof r.rating === 'number' && r.rating >= 0 && r.rating <= 5) out.rating = r.rating
        if (typeof r.ratingCount === 'number' && r.ratingCount >= 0) out.ratingCount = r.ratingCount
        if (typeof r.position === 'number') out.position = r.position
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
/**
 * Below this, a "price" is a placeholder rather than a price.
 *
 * Found by live verification 2026-08-17: a real /shopping response listed
 * `1 ₫ | Mac24h | ThinkPad T14 Gen 7` — the "contact for price" convention. It
 * parsed as a genuine 1 VND price and, because it scores MAXIMUM on the price
 * term, a "ưu tiên giá rẻ" turn would have made it Tappy's Pick.
 *
 * 1,000 VND is deliberately far below any real Vietnamese marketplace listing
 * (the cheapest real accessories sit in the tens of thousands), so this removes
 * placeholders without rejecting a single genuine price.
 */
const MIN_PLAUSIBLE_PRICE_VND = 1_000

export function parseSerperPriceVnd(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= MIN_PLAUSIBLE_PRICE_VND ? Math.round(value) : null
  }
  if (typeof value !== 'string' || !value.trim()) return null
  // Reject anything carrying a non-VND currency: a USD figure read as VND would
  // be wrong by ~25,000x and would pass every downstream range check.
  if (/US\$|\$|USD|EUR|€|¥|£/i.test(value)) return null
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) && n >= MIN_PLAUSIBLE_PRICE_VND ? n : null
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
