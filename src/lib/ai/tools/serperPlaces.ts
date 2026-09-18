import { getCache, setCache, sanitizeUrlForMarkdown } from './common'
import { serperPlacesCacheKey } from './cacheKeys'

// ── SERPER /maps — THE STRUCTURED PLACE SOURCE ───────────────────────────────
//
// 🚨 WHY THIS EXISTS, MEASURED 2026-09-10.
//
// Every Vietnamese place turn was enriched through `/search` — organic WEB PAGES
// — and then paid a separate `/images` request per venue for a photo. Measured
// cost and yield for one food turn:
//
//     2 × /search + 3 × /images = 5 credits
//     → 0 rating, 0 review count, 0 price, 3/6 photos, 3/6 addresses,
//       1/6 phone, 1/6 opening hours
//
// The same question asked of `/maps` costs THREE credits and returns TWENTY
// venues, each carrying rating, ratingCount, priceLevel, phoneNumber, a full
// week of openingHours, website, category, coordinates and a thumbnail:
//
//     1 × /maps = 3 credits
//     → 20 entities, ~11 fields each, photos included
//
// Cheaper AND richer. The old gate was never an economy — it was the wrong
// endpoint. `/search` returns no local pack at all for these queries (verified:
// both "quán bún bò ngon ở TP.HCM" and the price-suffixed form come back with
// `organic` only), so the structured data was not being discarded — it was never
// requested.
//
// 🔑 THIS IS `serperShopping`'S PATTERN, NOT A NEW ONE. Same reasoning that
// separated `/shopping` from `/search`: a different Serper product returning
// records rather than pages, consumed field-by-field, with each field carried
// ONLY when the provider actually supplied it.
//
// ⚠️ LIVE-ONLY, LIKE EVERY OTHER MAPS-DERIVED VALUE. `/maps` returns Google Maps
// content (`cid`, `placeId`, `googleusercontent` thumbnails). The approved policy
// for Serper imagery already forbids persistence, and it applies here unchanged:
// this is a retrieval improvement, NOT a route around the Places storage terms.
// Nothing here may be written to a database or cached beyond the existing
// request-scoped TTL.

/**
 * One structured place, exactly as `/maps` returned it.
 *
 * Every field optional: the provider omits them freely, and an absent field must
 * stay absent. `undefined` means "no evidence" — defaulting it to 0 or '' would
 * turn silence into a claim, which is the defect this whole layer exists to
 * prevent.
 */
export interface SerperPlaceRecord {
  title: string
  address?: string
  latitude?: number
  longitude?: number
  rating?: number
  ratingCount?: number
  /** The provider's own band, a DISPLAY STRING like "1-100.000 ₫" — never a number. */
  priceLevel?: string
  /** Primary category ("Nhà hàng"), and the full list when supplied. */
  type?: string
  types?: string[]
  phoneNumber?: string
  /** Keyed by day name in the response language: { "Thứ Hai": "06:00–20:00", … }. */
  openingHours?: Record<string, string>
  website?: string
  thumbnailUrl?: string
  bookingLinks?: string[]
  cid?: string
  placeId?: string
  position?: number
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/**
 * Serper `/maps` — structured place candidates.
 *
 * Contract verified against the live provider on 2026-09-10: POST, `X-API-KEY`,
 * `{q, ll, gl, hl}`; response `{searchParameters, places[], ll, credits}`;
 * `credits: 3` for 20 rows. Field union observed across those rows:
 * address, bookingLinks, cid, fid, latitude, longitude, openingHours,
 * phoneNumber, placeId, position, priceLevel, rating, ratingCount, thumbnailUrl,
 * title, type, types, website.
 *
 * 🚨 `ll` IS THE ONLY TARGETING THAT WORKS. The documented `location` string was
 * measured returning ZERO results for `'Ho Chi Minh City, Vietnam'`, while
 * `ll: '@16.0544,108.2022,14z'` returned 20/20 rows genuinely in Đà Nẵng. Callers
 * pass coordinates they already resolved — which is also what keeps a Đà Nẵng
 * question from being answered with Saigon venues (BUG-011, at the source).
 *
 * Returns `null` when the key is absent or the call fails, so every caller keeps
 * its existing fallback rather than losing the turn.
 */
export async function serperPlaces(
  query: string,
  ll?: { lat: number; lng: number; zoom?: number } | null,
): Promise<SerperPlaceRecord[] | null> {
  const cacheKey = serperPlacesCacheKey(query, ll ?? null)
  const cached = getCache(cacheKey)
  if (Array.isArray(cached) && cached.length > 0) return cached as SerperPlaceRecord[]

  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey || !query.trim()) return null

  const body: Record<string, unknown> = { q: query, gl: 'vn', hl: 'vi' }
  if (ll) body.ll = `@${ll.lat},${ll.lng},${ll.zoom ?? 14}z`

  // 🚨 `priceLevel` IS NON-DETERMINISTIC UPSTREAM. Measured 2026-09-18 on the audit env: the
  // IDENTICAL request ("quán ăn tối ngon Ho Chi Minh City", same ll) answered 19/20 rows with
  // `priceLevel`, then 0/20, then 19/20, then 0/20 — alternating, seconds apart, same rows,
  // same ratings. The string form is not the cause (owner's first hypothesis; see
  // serperLocation.ts, kept for its own sake). So when an answer carries NO band on ANY row,
  // the same request is made ONCE more and the answer WITH bands wins; both answers are the
  // same venues, so nothing else changes. One extra credit only in the empty case, never a
  // third call. Owner-approved exception ("so priceLevel is returned consistently").
  let out = await fetchSerperMaps(apiKey, body)
  if (out && out.length > 0 && !out.some(r => r.priceLevel)) {
    const again = await fetchSerperMaps(apiKey, body)
    if (again && again.length > 0 && again.some(r => r.priceLevel)) {
      console.log(JSON.stringify({ type: 'tappyai_places_debug', provider: 'serper_maps', step: 'price_level_retry', won: true }))
      out = again
    } else {
      console.log(JSON.stringify({ type: 'tappyai_places_debug', provider: 'serper_maps', step: 'price_level_retry', won: false }))
    }
  }
  if (out === null) return null
  // Only a non-empty result is stored, so a timeout never becomes a hole in the
  // data — the same rule every other Serper cache here follows. TTL matches the
  // existing place cache; nothing is persisted beyond it (Maps/Serper terms).
  if (out.length > 0) setCache(cacheKey, out, 30 * 60 * 1000)
  return out
}

/** One `/maps` request → parsed records, or null on a failed/timed-out call. */
async function fetchSerperMaps(apiKey: string, body: Record<string, unknown>): Promise<SerperPlaceRecord[] | null> {
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/maps', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      // 8s, matching `/shopping`: a 20-row response is measurably slower than
      // `/search`'s 8 organic rows, and 6s was cutting it off.
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const rows = (data?.places || []) as Array<Record<string, unknown>>

    const out = rows
      .filter(r => typeof r.title === 'string' && (r.title as string).trim())
      .map(r => {
        const rec: SerperPlaceRecord = { title: (r.title as string).trim() }
        const set = <K extends keyof SerperPlaceRecord>(k: K, v: SerperPlaceRecord[K]) => {
          if (v !== undefined) rec[k] = v
        }
        set('address', str(r.address))
        set('latitude', num(r.latitude))
        set('longitude', num(r.longitude))
        // A rating outside 0–5 is not a rating. Same guard `/shopping` applies.
        const rating = num(r.rating)
        if (rating !== undefined && rating >= 0 && rating <= 5) rec.rating = rating
        const count = num(r.ratingCount)
        if (count !== undefined && count >= 0) rec.ratingCount = count
        set('priceLevel', str(r.priceLevel))
        set('type', str(r.type))
        if (Array.isArray(r.types)) {
          const types = (r.types as unknown[]).filter((t): t is string => typeof t === 'string' && !!t.trim())
          if (types.length > 0) rec.types = types
        }
        set('phoneNumber', str(r.phoneNumber))
        if (r.openingHours && typeof r.openingHours === 'object' && !Array.isArray(r.openingHours)) {
          const hours: Record<string, string> = {}
          for (const [day, val] of Object.entries(r.openingHours as Record<string, unknown>)) {
            const v = str(val)
            if (v) hours[day] = v
          }
          if (Object.keys(hours).length > 0) rec.openingHours = hours
        }
        const website = str(r.website)
        if (website) rec.website = sanitizeUrlForMarkdown(website)
        const thumb = str(r.thumbnailUrl)
        if (thumb) rec.thumbnailUrl = sanitizeUrlForMarkdown(thumb)
        if (Array.isArray(r.bookingLinks)) {
          const links = (r.bookingLinks as unknown[])
            .map(l => (typeof l === 'string' ? l : (l as { link?: string })?.link))
            .filter((l): l is string => typeof l === 'string' && l.startsWith('http'))
            .map(sanitizeUrlForMarkdown)
          if (links.length > 0) rec.bookingLinks = links
        }
        set('cid', str(r.cid))
        set('placeId', str(r.placeId))
        set('position', num(r.position))
        return rec
      })
    return out
  } catch {
    return null
  }
}

// ── OPENING HOURS ────────────────────────────────────────────────────────────

/**
 * Day-of-week keys as `/maps` spells them, indexed the way `Date.getDay()` does
 * (0 = Sunday). Both response languages are handled because `hl` is a parameter,
 * and a caller changing it must not silently disable opening-hours support.
 */
const DAY_KEYS: readonly string[][] = [
  ['chủ nhật', 'sunday', 'cn'],
  ['thứ hai', 'monday', 't2'],
  ['thứ ba', 'tuesday', 't3'],
  ['thứ tư', 'wednesday', 't4'],
  ['thứ năm', 'thursday', 't5'],
  ['thứ sáu', 'friday', 't6'],
  ['thứ bảy', 'saturday', 't7'],
]

/** Vietnam is UTC+7 with no DST, so the offset is a constant rather than a lookup. */
const VN_OFFSET_MINUTES = 7 * 60

/** `{ day, minutes }` in Vietnam local time, from any instant. */
export function vietnamNow(at: Date = new Date()): { day: number; minutes: number } {
  const shifted = new Date(at.getTime() + (VN_OFFSET_MINUTES + at.getTimezoneOffset()) * 60_000)
  return { day: shifted.getDay(), minutes: shifted.getHours() * 60 + shifted.getMinutes() }
}

/** Today's published hours, or undefined when the provider did not state them. */
export function hoursForDay(hours: Record<string, string> | undefined, day: number): string | undefined {
  if (!hours) return undefined
  const wanted = DAY_KEYS[day] ?? []
  for (const [key, value] of Object.entries(hours)) {
    const k = key.trim().toLowerCase()
    if (wanted.some(w => k === w || k.startsWith(w))) return value
  }
  return undefined
}

/**
 * Is the venue open right now?
 *
 * 🚨 THIS IS AN INFERENCE, AND IT MUST STAY LABELLED AS ONE. `/maps` publishes a
 * weekly SCHEDULE, not a live open/closed state — unlike Google Places, whose
 * `currentOpeningHours.openNow` is the provider's own assertion. Deriving it here
 * is legitimate and useful, but the derivation is OURS: callers record it under
 * the `computed` source so nothing downstream can present it as a provider FACT.
 *
 * Returns `null` for anything it cannot decide — closed-all-day, an unparseable
 * string, or a day the provider did not publish. "I cannot tell" must never
 * collapse into "closed", which is a claim.
 */
export function isOpenNow(hoursText: string | undefined, now: { minutes: number }): boolean | null {
  if (!hoursText) return null
  const t = hoursText.trim().toLowerCase()
  if (/đóng cửa|closed/.test(t)) return false
  if (/24|cả ngày|open 24 hours/.test(t) && !/[:h]/.test(t.replace(/24/g, ''))) return true

  // "06:00–20:00", "06:00 - 20:00", and the multi-range "06:00–11:00, 17:00–21:00".
  const ranges = [...t.matchAll(/(\d{1,2})[:h](\d{2})\s*[–—\-−]\s*(\d{1,2})[:h](\d{2})/g)]
  if (ranges.length === 0) return null

  for (const m of ranges) {
    const open = Number(m[1]) * 60 + Number(m[2])
    const close = Number(m[3]) * 60 + Number(m[4])
    // A close time at or before the open time crosses midnight ("18:00–02:00").
    const spansMidnight = close <= open
    const inRange = spansMidnight
      ? now.minutes >= open || now.minutes < close
      : now.minutes >= open && now.minutes < close
    if (inRange) return true
  }
  return false
}

// ── /maps RECORD → TOOL-RESULT ROW ───────────────────────────────────────────
//
// 🔑 THE ROW SHAPE IS NOT NEW. `buildPlaceEntity` already reads `rating_value`,
// `rating_count`, `opening_hours`, `open_now`, `phone`, `price_range`,
// `place_types`, `website_uri`, `photo_url`, `lat`/`lng` — the widened Google
// field mask put them there. Mapping onto the SAME keys is what lets a
// `/maps` row travel the entire existing pipeline — eligibility, ranking,
// entity, projection, card — without one downstream branch knowing it changed.
//
// 🚨 NOTHING IS INVENTED AND NOTHING IS DROPPED. Every key below is emitted only
// when the provider supplied the value, and every value the provider supplied
// has a key. That is the no-information-loss contract at the retrieval boundary.

export interface SerperRowOptions {
  /** Formats the "4.4⭐ (589 đánh giá)" display string every existing reader expects. */
  ratingText: (rating: number, count: number | undefined) => string
  /** The user's position, when the search was actually centred on them (BUG-011 D2). */
  userAt?: { lat: number; lng: number } | null
  /** Same haversine every other branch uses; passed in to avoid a second copy. */
  distanceKm?: (aLat: number, aLng: number, bLat: number, bLng: number) => number
  /** Injectable for tests; defaults to real time in Vietnam. */
  now?: Date
}

/**
 * Project one `/maps` record onto the tool-result row shape.
 *
 * `open_now` is DERIVED here from the published weekly schedule and is the one
 * value on the row that is not the provider's own assertion — callers mark it
 * `computed` in the entity's provenance so it can never be read as a FACT. See
 * `isOpenNow`.
 */
export function serperPlaceToRow(rec: SerperPlaceRecord, opts: SerperRowOptions): Record<string, unknown> {
  const row: Record<string, unknown> = { name: rec.title }
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') row[k] = v }

  put('address', rec.address)
  put('lat', rec.latitude)
  put('lng', rec.longitude)
  put('phone', rec.phoneNumber)
  put('website_uri', rec.website)
  put('place_id', rec.placeId ?? rec.cid)

  if (rec.rating !== undefined) {
    row.rating_value = rec.rating
    row.google_rating = opts.ratingText(rec.rating, rec.ratingCount)
  }
  put('rating_count', rec.ratingCount)

  // The provider's own band, verbatim. NOT parsed into {low, high}: "1-100.000 ₫"
  // parses to a low of 1, and a 1 VND price is the documented placeholder the
  // shopping money-guard exists to reject. The string is what Google publishes
  // and what the card shows; nothing ranks or compares on it.
  put('price_range_text', rec.priceLevel)

  const types = rec.types ?? (rec.type ? [rec.type] : undefined)
  if (types && types.length > 0) row.place_types = types

  // `cid` IS a Google Maps destination — the canonical short form for a place.
  if (rec.cid) row.maps_link = `https://maps.google.com/?cid=${rec.cid}`
  else if (rec.placeId) row.maps_link = `https://www.google.com/maps/place/?q=place_id:${rec.placeId}`

  // A thumbnail that arrived WITH the record: no separate /images request, and no
  // `photo_names` round trip. This is why the endpoint switch pays for itself.
  if (rec.thumbnailUrl) {
    row.photo_url = rec.thumbnailUrl
    row.photo_urls = [rec.thumbnailUrl]
  }
  if (rec.bookingLinks && rec.bookingLinks.length > 0) row.booking_links = rec.bookingLinks

  if (rec.openingHours) {
    const now = vietnamNow(opts.now)
    const today = hoursForDay(rec.openingHours, now.day)
    put('opening_hours', today)
    // Absent stays absent: `isOpenNow` returns null for anything it cannot
    // decide, and "cannot tell" must never become "closed".
    const open = isOpenNow(today, now)
    if (open !== null) row.open_now = open
    row.opening_hours_week = rec.openingHours
  }

  // BUG-011 (D2): distance means how far from YOU, so it exists only when the
  // search was centred on the user.
  if (opts.userAt && opts.distanceKm && rec.latitude !== undefined && rec.longitude !== undefined) {
    row.distance_km = Math.round(opts.distanceKm(opts.userAt.lat, opts.userAt.lng, rec.latitude, rec.longitude) * 10) / 10
  }

  return row
}
