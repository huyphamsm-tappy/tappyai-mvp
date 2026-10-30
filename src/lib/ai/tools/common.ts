import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { withRetrievedAt } from './retrievalClock'
import { serperPost, type SerperPostState } from './serperClient'
import { serperCacheGetMeta, serperCacheSet } from './serperCache'
import { noteRetrieval, withRetrievalClock, type Retrieval } from './retrievalClock'
import { recordSerperCacheHit, recordSerperL1Hit } from './serperMeter'
import {
  currentSerperSignal, withSerperToolScope, markTurnWebTicketSent, searchFallbackGateOn, settleTurnWebTicket, takeTurnWebTicket, turnWebTicketOn,
  type TicketEntry,
} from './serperToolBudget'
import { messages } from '@/lib/ai/messages'
import { logText } from '@/lib/ai/logSafeText'
import { webSearchCacheKey, serperSearchCacheKey, placePhotosCacheKey, cacheKeyPart, type SearchRegion } from './cacheKeys'
import type { ParallelSearchOutcome } from './parallelClient'

// ===== In-memory cache (theo Vercel instance, giam goi API lap lai cho cung 1 query) =====
type CacheEntry = { data: unknown; expires: number; /** when the data was really fetched; null = not known (a row rebuilt from a legacy shared entry) */ at: number | null }
const cache = new Map<string, CacheEntry>()

export function getCache(key: string): unknown | null {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.data
  if (hit) cache.delete(key)
  return null
}

/** The real fetch time of an L1 entry (ms), `null` when unknown or absent. Does not touch expiry. */
export function getCacheAt(key: string): number | null {
  const hit = cache.get(key)
  return hit && hit.expires > Date.now() ? hit.at : null
}

/**
 * In-flight requests, keyed exactly like the cache above.
 *
 * The cache only helps once an answer exists. Two callers who ask the same question a few hundred
 * milliseconds apart both miss it and both pay Google — and with a 100/day SearchText quota, two
 * users typing the same thing at the same time is a real way to lose a call for nothing.
 *
 * Deliberately process-local, exactly like `cache`. Vercel runs several instances, so this cannot
 * deduplicate across them; it is not pretending to. It removes the duplicate work inside one
 * instance, which is where a burst of identical requests actually lands, and it needs no new
 * infrastructure to do it.
 */
const inFlight = new Map<string, Promise<unknown>>()

/**
 * Runs `fn` for `key`, or joins the call already running for it.
 *
 * The entry is removed as soon as the promise settles — success OR failure. A rejected promise
 * left in the map would hand the same error to every later caller for the life of the process,
 * which is a far worse failure than the duplicate call this is trying to avoid.
 */
export async function withSingleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key)
  if (running) {
    // S4 (found by the S4 canary): a cache key holds the query and the location - its length only
    console.log(JSON.stringify({ type: 'tappyai_places_budget', step: 'single_flight_join', key: logText(key, 'tool_arg') }))
    return running as Promise<T>
  }
  const p = (async () => fn())()
  inFlight.set(key, p)
  try {
    return await p
  } finally {
    inFlight.delete(key)
  }
}

/**
 * ONE paid Serper request per effective request, however many callers want it at the same moment (POST-CREDIT cost control). The key
 * must carry EVERY parameter that changes the answer (endpoint, normalised query, count variant, area) — callers build it from the same
 * parts as their cache keys.
 *
 * CANCELLATION IS PER CALLER (post-commit review B). The shared request runs in a scope that carries the FLIGHT's own signal, not the
 * first caller's:
 *   · a caller whose own signal aborts leaves at once with `cancelled` (null / []) — independently of the others;
 *   · the callers still interested keep waiting and receive the real result of the shared request;
 *   · the underlying request is aborted only when NO caller is left (or by its own time limit inside serperPost);
 *   · a caller that arrives after everyone left starts a fresh request instead of joining a cancelled one.
 * The reservation stays with the scope chain that started the request (it is the one that sent it); a follower never spends. The entry
 * is removed the moment the request settles, so an error or a timeout is never handed to later callers.
 */
interface Flight { p: Promise<unknown>; ac: AbortController; waiters: number; /** when the shared request's rows were really fetched; replayed to EVERY caller so each tool result is stamped */ retrieval?: Retrieval }
const flights = new Map<string, Flight>()

export function serperFlight<T>(key: string, fn: () => Promise<T>, cancelled: T): Promise<T> {
  const mine = currentSerperSignal()
  if (mine?.aborted) return Promise.resolve(cancelled) // this caller is already cancelled: it neither starts nor joins a request
  const k = `serper:${key}`
  let f = flights.get(k)
  if (f && f.ac.signal.aborted) f = undefined // the previous interested callers all left: that request is being cancelled, do not join it
  if (!f) {
    const ac = new AbortController()
    const created: Flight = { ac, waiters: 0, p: Promise.resolve() }
    // The request runs in a nested scope that carries the FLIGHT's signal; the caps of the starting scope chain still apply (limit ∞ here).
    created.p = withSerperToolScope(Number.MAX_SAFE_INTEGER, ac.signal, async () => {
      const r = await withRetrievalClock(fn)
      created.retrieval = { retrievedAt: r.retrievedAt, unknown: r.unknown, sources: r.sources }
      return r.value
    })
      .then(r => r.value)
      .finally(() => { if (flights.get(k) === created) flights.delete(k) })
    flights.set(k, created)
    f = created
  } else {
    console.log(JSON.stringify({ type: 'tappyai_serper_single_flight_join', key: k.slice(0, 60) }))
  }
  const flight = f
  flight.waiters++
  return new Promise<T>((resolve, reject) => {
    let left = false
    const leave = () => {
      if (left) return false
      left = true
      mine?.removeEventListener('abort', onAbort)
      flight.waiters--
      if (flight.waiters <= 0) flight.ac.abort() // nobody needs the request any more
      return true
    }
    const onAbort = () => { if (leave()) resolve(cancelled) }
    mine?.addEventListener('abort', onAbort, { once: true })
    const replay = () => { const rt = flight.retrieval; if (!rt) return; if (rt.unknown) noteRetrieval(null); if (rt.retrievedAt) noteRetrieval(rt.retrievedAt) }
    flight.p.then(
      v => { if (leave()) { replay(); resolve(v as T) } },
      err => { if (leave()) reject(err) },
    )
  })
}

/** Test seam: how many requests are in flight. Never used by production code. */
export function inFlightCount(): number {
  return inFlight.size
}

/**
 * Empties the in-memory tool cache.
 *
 * A TEST SEAM, and named so it cannot be mistaken for product behaviour. The
 * cache is module-scoped, so a suite that calls the same tool twice with the
 * same arguments would otherwise read the previous test answer - which is what
 * the photo-step timing tests hit the moment image lookups became memoised.
 * Clearing between tests keeps each one measuring the call it actually makes.
 */
export function __clearToolCache(): void {
  cache.clear()
  shoppingFailures.clear()
}

export function setCache(key: string, data: unknown, ttlMs: number, at: number | null = Date.now()) {
  if (cache.size > 300) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
  cache.set(key, { data, expires: Date.now() + ttlMs, at })
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
    // Gate 2 N1 (S-1, proposal): the resolved og:image is a third party's value — admitted only as a safe https URL.
    const image = new URL(decoded, resp.finalUrl).toString()
    return isSafeHttpsUrl(image) ? image : null
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
    // Gate 2 N1 (S-2, proposal): every pass below goes through here, so one check covers them all.
    if (picked.length >= max || !url || seen.has(url) || !isSafeHttpsUrl(url)) return
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
  /**
   * 🚨 THE SAME VENUE WAS BOUGHT OVER AND OVER.
   *
   * Serper bills per request and this is the highest-volume call in the product:
   * every place a reply names, plus every hotel row, plus every product row.
   * Nothing memoised it, so the same restaurant in the same city cost a request
   * on every turn - and a travel turn fetching 8 hotels re-bought whichever ones
   * the route-level resolver then asked for again by name.
   *
   * ONLY NON-EMPTY RESULTS ARE STORED. Caching a miss would let one timeout
   * suppress a venue images for the whole TTL, which trades cost for quality -
   * the exact trade this optimisation is forbidden to make.
   */
  const photoCacheKey = placePhotosCacheKey(placeName, max, context)
  const cachedPhotos = getCache(photoCacheKey)
  if (Array.isArray(cachedPhotos) && cachedPhotos.length > 0) { recordSerperL1Hit('images'); return cachedPhotos as string[] }
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey || !placeName) {
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_skip', reason: !apiKey ? 'no_key' : 'no_name', placeId }))
    return []
  }
  // One in-flight /images request per (name, count, context). Images stay OUT of the shared L2 cache (owner decision, unchanged).
  return serperFlight(`images:${photoCacheKey}`, async (): Promise<string[]> => {
    try {
      const resp = await serperPost('images', apiKey, { q: placeName, gl: 'vn', hl: 'vi', num: 8 }, 4000)
      if (!resp) return [] // A2: over today's Serper ceiling — no photo, the turn still answers
      if (!(resp as Response).ok) {
        console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_not_ok', status: (resp as Response).status, placeId }))
        return []
      }
      const data = await (resp as Response).json()
      const images = data?.images as SerperImage[] | undefined
      const photoUris = pickEmbeddableImageUrls(images, max, context)
      console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_result', placeId, placeName: placeName.slice(0, 40), imageCount: images?.length ?? 0, pickedCount: photoUris.length, chosenHost: photoUris[0] ? hostOf(photoUris[0]) : null }))
      // 15 minutes, matching the products cache: long enough that a conversation
      // and its follow-ups pay once, short enough that these stay live URLs.
      if (photoUris.length > 0) setCache(photoCacheKey, photoUris, 15 * 60 * 1000)
      return photoUris
    } catch (e) {
      console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'serper_error', placeId, error: String(e).slice(0, 80) }))
      return []
    }
  }, [] as string[])
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
  // `places_detail` and `places_media` were removed with the Google Places photo
  // lookup (Google Places is unavailable for Vietnam). Nothing emits them any more.
  step: 'website' | 'serper'
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

  // Google Places photo lookup removed (2026-09-21): Google Places is not available
  // for Vietnam, so it was legacy code. Serper supplies the place card's photo
  // directly (its /maps thumbnailUrl → photo_url), and the Serper image search
  // below fills the rest of the gallery.
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
type SerperSearchRow = { title: string; link: string; snippet: string; /** The result's own date as Google shows it ("2 giờ trước", "Oct 25, 2026"), when it has one. */ date?: string }
/** What Serper returns beside the organic list, compacted to short text for the model. Absent when the search had none. */
export interface SerperExtras {
  answer_box?: { title?: string; answer?: string; snippet?: string; link?: string }
  knowledge_graph?: { title?: string; type?: string; description?: string; website?: string; attributes?: Record<string, string> }
}
const EXTRA_TEXT_MAX = 400
const KG_ATTRIBUTES_MAX = 8
const clip = (v: unknown, max = EXTRA_TEXT_MAX): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const dropEmpty = <T extends Record<string, unknown>>(o: T): T | undefined => { const e = Object.entries(o).filter(([, v]) => v !== undefined); return e.length > 0 ? Object.fromEntries(e) as T : undefined }
/** Reads Serper's `answerBox` / `knowledgeGraph` into short text fields (nothing is composed; a field the response lacks stays absent). */
export function serperExtrasOf(data: unknown): SerperExtras | undefined {
  const d = (data ?? {}) as { answerBox?: Record<string, unknown>; knowledgeGraph?: Record<string, unknown> }
  const ab = d.answerBox
  const kg = d.knowledgeGraph
  const answer_box = ab && typeof ab === 'object' ? dropEmpty({ title: clip(ab.title, 200), answer: clip(ab.answer), snippet: clip(ab.snippet), link: typeof ab.link === 'string' ? sanitizeUrlForMarkdown(ab.link) : undefined }) : undefined
  const attrs = kg && typeof kg.attributes === 'object' && kg.attributes ? Object.entries(kg.attributes as Record<string, unknown>).filter(([, v]) => typeof v === 'string').slice(0, KG_ATTRIBUTES_MAX).map(([k, v]) => [k.slice(0, 80), String(v).slice(0, 120)] as [string, string]) : []
  const knowledge_graph = kg && typeof kg === 'object' ? dropEmpty({ title: clip(kg.title, 200), type: clip(kg.type, 120), description: clip(kg.description), website: typeof kg.website === 'string' ? sanitizeUrlForMarkdown(kg.website) : undefined, attributes: attrs.length > 0 ? Object.fromEntries(attrs) : undefined }) : undefined
  return answer_box || knowledge_graph ? { ...(answer_box ? { answer_box } : {}), ...(knowledge_graph ? { knowledge_graph } : {}) } : undefined
}
/** Country and language of a search (two letters each; anything else falls back to Vietnam / Vietnamese, the way every search was sent before). */
export function searchRegionOf(opts?: { gl?: unknown; hl?: unknown }): SearchRegion {
  const two = (v: unknown, dflt: string): string => (typeof v === 'string' && /^[a-zA-Z]{2}$/.test(v) ? v.toLowerCase() : dflt)
  return { gl: two(opts?.gl, 'vn'), hl: two(opts?.hl, 'vi') }
}
const isDefaultRegion = (r: SearchRegion): boolean => r.gl === 'vn' && r.hl === 'vi'
/**
 * How a Serper /search call ended (TURN_WEB_TICKET / SEARCH_FALLBACK_GATE read it; see serperToolBudget.ts for the meanings).
 * 'cache' = answered from a cache, nothing sent. A FOLLOWER of a single-flight receives the leader's state (the request was sent by someone).
 */
export type SerperSearchState = 'cache' | 'not_sent' | 'ticket_denied' | 'sent_success' | 'sent_empty' | 'sent_error'
export interface SerperSearchOutcome { rows: SerperSearchRow[] | null; state: SerperSearchState; extras?: SerperExtras }
export interface SerperSearchOpts {
  /** 'W' = web research: shares the turn's one-request web ticket (TURN_WEB_TICKET). Absent = a vertical's own search (not limited by it). */
  purpose?: 'W'
  /** Country and language the model asked for (validated by `searchRegionOf`). Absent = Vietnam / Vietnamese. */
  gl?: string
  hl?: string
}
const NOT_SENT: SerperSearchOutcome = Object.freeze({ rows: null, state: 'not_sent' as const })

export async function serperSearch(query: string, opts?: SerperSearchOpts): Promise<SerperSearchRow[] | null> {
  return (await serperSearchEx(query, opts)).rows
}

/** `serperSearch` plus how the call ended. Same requests, same caches, same single-flight. */
export async function serperSearchEx(query: string, opts?: SerperSearchOpts): Promise<SerperSearchOutcome> {
  /**
   * 🚨 `webSearch` CACHED; ITS SIBLINGS DID NOT.
   *
   * Every direct caller - the food price/order/TikTok queries, travel four
   * hotel queries, shopping three organic queries - went straight out to a
   * billed endpoint with no memoisation, so an identical query on the next turn
   * was paid for again. Same rule as the photo cache: only a non-empty result is
   * stored, so a timeout never becomes a 5-minute hole in the data.
   */
  const region = searchRegionOf(opts)
  const searchCacheKey = serperSearchCacheKey(query, region)
  const cachedSearch = getCache(searchCacheKey)
  if (Array.isArray(cachedSearch) && cachedSearch.length > 0) {
    recordSerperL1Hit('search')
    noteRetrieval(getCacheAt(searchCacheKey))
    const extras = getCache(`${searchCacheKey}:extras`) as SerperExtras | null
    return { rows: cachedSearch as SerperSearchRow[], state: 'cache', ...(extras ? { extras } : {}) }
  }
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return NOT_SENT
  const lead = { led: false }
  const out = await serperFlight<SerperSearchOutcome>(`search:${searchCacheKey}`, () => { lead.led = true; return serperSearchPaid(query, searchCacheKey, apiKey, opts?.purpose, region) }, NOT_SENT)
  if (out.state !== 'ticket_denied' || lead.led) return out
  // A FOLLOWER (a W or a V caller, this turn or another) of a flight whose LEADER was refused by the leader's own spent ticket sent nothing and
  // spent nothing: it is not refused for that. It asks once more under a flight key of its own, so it is certain to lead (never joins another
  // refused flight): its own purpose and its own ticket decide. Followers never take a ticket; only a leader does.
  return serperFlight<SerperSearchOutcome>(`search:${searchCacheKey}:re${++retrySeq}`, () => serperSearchPaid(query, searchCacheKey, apiKey, opts?.purpose, region), NOT_SENT)
}
let retrySeq = 0

async function serperSearchPaid(query: string, searchCacheKey: string, apiKey: string, purpose?: 'W', region: SearchRegion = { gl: 'vn', hl: 'vi' }): Promise<SerperSearchOutcome> {
  // L2: the shared 24 h cache (serperCache.ts). Fails open — a miss or a store outage falls
  // through to the paid call below. It is keyed on the query alone, so only the default region (Vietnam / Vietnamese) reads or writes it;
  // the answer box and knowledge graph are not kept in it either (a hit from it has the rows only).
  const defaultRegion = isDefaultRegion(region)
  const shared = defaultRegion ? await serperCacheGetMeta<{ title: string; link: string; snippet: string }>('search', query, null) : null
  if (shared) {
    recordSerperCacheHit('search')
    const sharedAt = shared.at ? Date.parse(shared.at) : null
    setCache(searchCacheKey, shared.rows, 5 * 60 * 1000, sharedAt)
    noteRetrieval(sharedAt)
    return { rows: shared.rows, state: 'cache' }
  }
  // What serperPost says about this request (the state is never guessed from the shape of the result).
  const post: { state: SerperPostState; entry?: TicketEntry } = { state: 'not_sent' }
  try {
    const resp = await serperPost('search', apiKey, { q: query, gl: region.gl, hl: region.hl, num: 8 }, 6000, { ...(purpose ? { purpose } : {}), report: (s, e) => { post.state = s; post.entry = e } })
    if (!resp) return post.state === 'ticket_denied' ? { rows: null, state: 'ticket_denied' } : NOT_SENT // A2: over today's Serper ceiling
    if (!(resp as Response).ok) return { rows: null, state: 'sent_error' }
    const data = await (resp as Response).json()
    const organic = (data?.organic || []) as Array<{ title?: string; link?: string; snippet?: string; date?: unknown }>
    const results: SerperSearchRow[] = organic
      .filter(r => r.title && r.link)
      .slice(0, 6)
      .map(r => ({ title: r.title as string, link: sanitizeUrlForMarkdown(r.link as string), snippet: r.snippet || '', ...(clip(r.date, 60) ? { date: clip(r.date, 60) } : {}) }))
    const extras = serperExtrasOf(data)
    if (post.entry) settleTurnWebTicket(post.entry, results.length > 0 ? 'sent_success' : 'sent_empty')
    // 5 minutes, matching webSearch's own TTL for the same upstream endpoint.
    if (results.length > 0) {
      setCache(searchCacheKey, results, 5 * 60 * 1000)
      if (extras) setCache(`${searchCacheKey}:extras`, extras, 5 * 60 * 1000)
      if (defaultRegion) await serperCacheSet('search', query, null, results)
    }
    noteRetrieval(Date.now())
    return { rows: results, state: results.length > 0 ? 'sent_success' : 'sent_empty', ...(extras ? { extras } : {}) }
  } catch {
    // After fetch was called (a timeout, a network error, an unreadable body) the request counts as SENT; only a body that could not even be
    // built is not_sent (serperPost reports which).
    return post.state === 'not_sent' ? NOT_SENT : { rows: null, state: 'sent_error' }
  }
}

/** The result a W caller gets when the turn's one web request is already spent: nothing was sent, nothing is invented. */
function searchBudgetUsed(lang: string): { error: 'search_budget_used'; note: string } {
  console.log(JSON.stringify({ type: 'tappyai_web_ticket', step: 'blocked', tool: 'web_search' }))
  return {
    error: 'search_budget_used',
    note: lang === 'en'
      ? 'No more web searches this turn. Answer from what you already have; if current information is needed, say it could not be checked right now instead of guessing.'
      : 'Hết lượt tìm web của lượt này. Trả lời từ dữ liệu đã có; nếu cần thông tin mới thì nói rõ là chưa kiểm tra được, đừng đoán.',
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
  const key = `shopping:n${num}:${cacheKeyPart(query)}`
  // Serper review finding D: an identical request that just TIMED OUT / was cancelled may already be processed and billed — sending it
  // again (searchProducts' structured path and its organic fallback both ask num=20) only doubled the credits and the wait.
  const failedAt = shoppingFailures.get(key)
  if (failedAt !== undefined && Date.now() - failedAt < SHOPPING_RESEND_BLOCK_MS) {
    console.log(JSON.stringify({ type: 'tappyai_serper_resend_blocked', endpoint: 'shopping', ageMs: Date.now() - failedAt }))
    return null
  }
  return serperFlight(key, () => serperShoppingPaid(query, num, apiKey, key), null)
}

/** Identical /shopping requests that failed by timeout / abort / network error → when (process-local, 30 s). A fast HTTP error is not recorded. */
const SHOPPING_RESEND_BLOCK_MS = 30_000
const shoppingFailures = new Map<string, number>()

async function serperShoppingPaid(query: string, num: number, apiKey: string, failureKey: string): Promise<ShoppingRecord[] | null> {
  // Shared 24 h cache (serperCache.ts), keyed on the query AND `num` — a 12-row answer must not
  // serve a caller that paid for 20. Fails open.
  const variant = `n${num}`
  const shared = await serperCacheGetMeta<ShoppingRecord>('shopping', query, null, variant)
  if (shared) {
    recordSerperCacheHit('shopping')
    noteRetrieval(shared.at)
    return shared.rows
  }
  try {
    // `num` is a parameter (D3) rather than the old hardcoded 12: the consultative path asks
    // for 20 so the ranker has a real field to choose from, and the fallback path keeps the
    // default. The timeout goes to D3's 8s for the same reason — a 20-row request is slower,
    // and 6s was measured cutting it off.
    const resp = await serperPost('shopping', apiKey, { q: query, gl: 'vn', hl: 'vi', num }, 8000)
    if (!resp) return null // A2: over today's Serper ceiling
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const rows = (data?.shopping || []) as Array<Record<string, unknown>>
    const records = rows
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
        // Gate 2 N1 (S-3, proposal): a listing photo is carried only as a safe https URL.
        if (typeof r.imageUrl === 'string' && r.imageUrl && isSafeHttpsUrl(r.imageUrl)) out.imageUrl = sanitizeUrlForMarkdown(r.imageUrl)
        if (typeof r.rating === 'number' && r.rating >= 0 && r.rating <= 5) out.rating = r.rating
        if (typeof r.ratingCount === 'number' && r.ratingCount >= 0) out.ratingCount = r.ratingCount
        if (typeof r.position === 'number') out.position = r.position
        return out
      })
    // Only a non-empty, successful answer is shared (serperCacheSet also enforces it).
    if (records.length > 0) await serperCacheSet('shopping', query, null, records, variant)
    noteRetrieval(Date.now())
    return records
  } catch {
    // serperPost THROWS only for a timeout, a cancellation or a network error (a non-2xx answer returns a Response): the request may have
    // been processed, so the identical one is not re-sent for a while.
    if (shoppingFailures.size > 200) shoppingFailures.clear()
    shoppingFailures.set(failureKey, Date.now())
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
/** `vertical: true` = a vertical's own fallback search (the legacy hotel fallback in travel.ts): a "V" request that does not take the turn's web ticket (Plan B). */
/**
 * `parallelSearch` (CONSULT_PARALLEL, parallelClient.ts): when Serper gives no rows (refused, failed, or empty), the model's query goes to Parallel
 * once; its rows become the result (`source: 'Parallel'`). The caller binds it to the turn's Parallel budget. Absent: HEAD.
 */
async function webSearchImpl(query: string, lang = 'vi', opts: { vertical?: boolean; gl?: unknown; hl?: unknown; parallelSearch?: (q: string) => Promise<ParallelSearchOutcome> } = {}) {
  const region = searchRegionOf(opts)
  const cacheKey = webSearchCacheKey(query, lang, region)
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
  let result: unknown

  const serperEx = await serperSearchEx(query, { ...(opts.vertical ? {} : { purpose: 'W' as const }), gl: region.gl, hl: region.hl })
  const serperResults = serperEx.rows
  if (serperResults && serperResults.length > 0) {
    // answer_box / knowledge_graph: what Google itself put above the list (a figure, a definition); absent when the search had none
    result = { query, source: 'Google (Serper)', results: serperResults, ...(serperEx.extras ?? {}), search_url: fallbackUrl }
    setCache(cacheKey, result, 5 * 60 * 1000)
    return result
  }

  // CONSULT_PARALLEL: no Serper rows -> Parallel once (its own per-turn and daily budget, bound by the caller); nothing found -> on as before
  if (opts.parallelSearch) {
    const p = await opts.parallelSearch(query)
    if (p.ok && p.rows.length > 0) {
      result = { query, source: 'Parallel', results: p.rows, search_url: fallbackUrl }
      setCache(cacheKey, result, 5 * 60 * 1000)
      return result
    }
  }

  // TURN_WEB_TICKET / SEARCH_FALLBACK_GATE (both default OFF, read now; the flag matrix is in serperToolBudget.ts). With both OFF nothing below changes.
  //   · the turn's web ticket was spent before this call: nothing was sent and nothing is invented;
  //   · gate: a Serper request that was SENT (by this call or by the flight it followed) is not followed by a second provider;
  //   · ticket: DuckDuckGo is a W request too — it takes the ticket right before fetch; a spent ticket refuses it.
  const ticketOn = turnWebTicketOn() && !opts.vertical // a V search (the hotel fallback) and its DuckDuckGo step never touch the ticket
  const serperSent = serperEx.state === 'sent_success' || serperEx.state === 'sent_empty' || serperEx.state === 'sent_error'
  if (ticketOn && serperEx.state === 'ticket_denied') return searchBudgetUsed(lang)
  let ddgBlocked = false
  /** DuckDuckGo refused because THIS turn's ticket is spent (not because of the gate): the answer says nothing about the query, so it is not cached for other turns. */
  let blockedByTicket = false
  let ddgEntry: TicketEntry | undefined
  if (searchFallbackGateOn() && serperSent) ddgBlocked = true
  else if (ticketOn) {
    const t = takeTurnWebTicket('duckduckgo')
    if (t === 'exhausted') {
      // Serper was sent (the ticket was spent by it or earlier): the answer is the honest "searched, nothing usable" below. Serper was not
      // sent: this call never searched, the ticket was spent elsewhere → say so.
      if (!serperSent) return searchBudgetUsed(lang)
      ddgBlocked = true
      blockedByTicket = true
    } else if (t) ddgEntry = t
  }
  if (ddgBlocked) {
    result = serperResults === null
      ? { note: messages.webSearch.unavailable(lang, fallbackUrl), results: [], search_url: fallbackUrl, provider_status: 'error' }
      : { note: messages.webSearch.noAutoResults(lang, query, fallbackUrl), results: [], search_url: fallbackUrl }
  } else try {
    if (ddgEntry) markTurnWebTicketSent(ddgEntry) // SENT = the next statement calls fetch
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

    if (ddgEntry) settleTurnWebTicket(ddgEntry, !(resp as Response).ok ? 'sent_error' : results.length === 0 ? 'sent_empty' : 'sent_success')
    result = results.length === 0
      ? { note: messages.webSearch.noAutoResults(lang, query, fallbackUrl), results: [], search_url: fallbackUrl, ...(serperResults === null ? { provider_status: 'error' } : {}) }
      : { query, source: 'DuckDuckGo', results, search_url: fallbackUrl }
  } catch {
    result = { note: messages.webSearch.unavailable(lang, fallbackUrl), results: [], search_url: fallbackUrl, provider_status: 'error' }
  }
  // WS2 final: a provider FAILURE (Serper non-OK / over its ceiling / no key, and no fallback rows) is said as such — never an empty
  // answer that reads like "nothing exists" (measured: an exhausted Serper account surfaced as EMPTY). A failure is not cached.
  if ((result as { provider_status?: string }).provider_status !== 'error' && !blockedByTicket) setCache(cacheKey, result, 5 * 60 * 1000) // cache 5 phut
  return result
}

/** Stamps `retrieved_at` (the oldest real fetch time of the rows used) on the result — see retrievalClock.ts. */
export function webSearch(...args: Parameters<typeof webSearchImpl>): ReturnType<typeof webSearchImpl> { return withRetrievedAt(() => webSearchImpl(...args)) }
