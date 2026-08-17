import { isSpecificOtaHotelPage } from '../tools/travel'

// ── The common Candidate (Phase 2 §4 "Input") ───────────────────────────────
//
// One shape, one ranker. Domain adapters normalize; they never rank. There is no
// rankPlaces()/rankHotels()/rankShopping() — a second engine per domain is the
// duplicated-recommendation-logic failure the whole architecture exists to avoid.
//
// THE RULE these adapters exist to enforce:
//
//   A field absent from the tool result is `undefined` — never defaulted to 0 or
//   false, never inferred, never parsed out of a title or a snippet.
//
// `undefined` means "no evidence"; `false` means "evidence of absence". The
// ranker treats those very differently, and collapsing them is what turns a
// missing data point into a false factual claim.

export interface CandidateAttrs {
  /** 0–5. Google's numeric rating, read back from our own formatted string. */
  rating?: number
  reviewCount?: number
  distanceKm?: number
  /** Only ever set from a STRUCTURED price field. Never from a title or snippet. */
  priceVnd?: number
  /** Hotel star rating, 1–5. */
  stars?: number
  cuisine?: string[]
  openingHours?: string
  wifi?: boolean
  vegetarian?: boolean
  outdoorSeating?: boolean
  /** Hotel: the link is a specific hotel page rather than a search/list page. */
  directPage?: boolean
}

export interface Candidate {
  /** Stable identity: place_id, link, or name. Used for tie-breaking and dedup. */
  id: string
  name: string
  domain: 'places' | 'hotel' | 'shopping' | 'transport'
  attrs: CandidateAttrs
  /** The real provider link. Never synthesised. */
  link: string | null
  /** The original record, carried through so links/photos can never detach. */
  raw: unknown
}

/** Assigns only when the value is real — the single guard behind the whole rule. */
function put<K extends keyof CandidateAttrs>(
  attrs: CandidateAttrs, key: K, value: CandidateAttrs[K] | null | undefined,
): void {
  if (value === null || value === undefined) return
  if (typeof value === 'number' && !Number.isFinite(value)) return
  attrs[key] = value
}

/**
 * Reads the numeric rating back out of `google_rating`.
 *
 * That string is built by `messages.places.googleRating()` from the Places API's
 * numeric `rating` and `userRatingCount` — it IS the authoritative field, merely
 * formatted for display, in one of two known shapes:
 *
 *   vi: "4.5⭐ (2.847 đánh giá Google Maps)"
 *   en: "4.2⭐ (1,203 Google Maps reviews)"
 *
 * This is NOT the free-text parsing §13 forbids: the input is our own output, and
 * anything that does not match exactly yields `undefined` rather than a guess.
 */
export function parseGoogleRating(s: unknown): { rating?: number; reviewCount?: number } {
  if (typeof s !== 'string' || !s) return {}
  const out: { rating?: number; reviewCount?: number } = {}
  const r = s.match(/^\s*(\d(?:\.\d+)?)\s*⭐/)
  if (r) {
    const n = parseFloat(r[1])
    if (n >= 0 && n <= 5) out.rating = n
  }
  // vi-VN groups with '.', en-US with ',' — strip both, then require digits only.
  const c = s.match(/\(([\d.,\s]+?)\s/)
  if (c) {
    const digits = c[1].replace(/[.,\s]/g, '')
    if (/^\d+$/.test(digits)) out.reviewCount = parseInt(digits, 10)
  }
  return out
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Normalizes a `search_places` result — both shapes it can return.
 *
 * Google Maps: place_id, name, address, google_rating (formatted), maps_link, website_uri
 * OpenStreetMap: name, address, maps_link, cuisine, opening_hours, vegetarian,
 *                wifi, outdoor_seating, stars, distance_km
 *
 * Neither carries a product price, so `priceVnd` is never set here. Places DO
 * return `price_search_results`, but those are menu/service prices for the venue
 * found by a separate web search — not a structured field on the venue itself.
 */
export function normalizePlaces(toolResult: unknown): Candidate[] {
  const root = (toolResult && typeof toolResult === 'object') ? toolResult as Record<string, unknown> : {}
  const out: Candidate[] = []

  for (const item of asArray(root.results)) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = str(r.name).trim()
    if (!name) continue // a nameless candidate cannot be recommended or linked

    const attrs: CandidateAttrs = {}

    // Google shape
    const { rating, reviewCount } = parseGoogleRating(r.google_rating)
    put(attrs, 'rating', rating)
    put(attrs, 'reviewCount', reviewCount)

    // OSM shape — every one of these is present ONLY when the tag existed
    put(attrs, 'distanceKm', typeof r.distance_km === 'number' ? r.distance_km : undefined)
    put(attrs, 'openingHours', str(r.opening_hours) || undefined)
    put(attrs, 'wifi', typeof r.wifi === 'boolean' ? r.wifi : undefined)
    put(attrs, 'vegetarian', typeof r.vegetarian === 'boolean' ? r.vegetarian : undefined)
    put(attrs, 'outdoorSeating', typeof r.outdoor_seating === 'boolean' ? r.outdoor_seating : undefined)

    const starsRaw = str(r.stars).trim()
    if (/^[1-5]$/.test(starsRaw)) put(attrs, 'stars', parseInt(starsRaw, 10))

    const cuisineRaw = str(r.cuisine).trim()
    if (cuisineRaw) {
      const list = cuisineRaw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
      if (list.length) put(attrs, 'cuisine', list)
    }

    out.push({
      id: str(r.place_id) || str(r.maps_link) || name,
      name,
      domain: 'places',
      attrs,
      link: str(r.maps_link) || null,
      raw: r,
    })
  }

  return out
}

/**
 * Normalizes a `search_products` result into common candidates.
 *
 * Reads ONLY `shopping_results` — the structured records from Serper's
 * `/shopping` endpoint, where `price`, `source` and `productId` are the
 * provider's own fields. The organic `search_results` array is deliberately NOT
 * normalized: it carries title/link/snippet only, and C3-B.9 measured that shape
 * returning phone cases and news articles for an iPhone-vs-Samsung comparison.
 * Ranking it would be provider order dressed up as a score.
 *
 * When only organic results exist this returns [], the ranker reports
 * `rankable:false`, and the turn behaves exactly as it does today.
 */
export function normalizeShopping(toolResult: unknown): Candidate[] {
  const root = (toolResult && typeof toolResult === 'object') ? toolResult as Record<string, unknown> : {}
  const out: Candidate[] = []
  const seen = new Set<string>()

  for (const item of asArray(root.shopping_results)) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = str(r.title).trim()
    const link = str(r.link)
    if (!name) continue
    if (link && seen.has(link)) continue
    if (link) seen.add(link)

    const attrs: CandidateAttrs = {}
    // `price` here is the provider's structured field, carried through by
    // serperShopping — never parsed from the title.
    put(attrs, 'priceVnd', typeof r.price === 'number' ? r.price : undefined)
    put(attrs, 'rating', typeof r.rating === 'number' ? r.rating : undefined)
    put(attrs, 'reviewCount', typeof r.ratingCount === 'number' ? r.ratingCount : undefined)

    out.push({
      id: str(r.productId) || link || name,
      name,
      domain: 'shopping',
      attrs,
      link: link || null,
      raw: r,
    })
  }

  return out
}

/**
 * Normalizes a `get_hotel_prices` result.
 *
 * Two sources with very different evidence quality:
 *   `search_results` — Serper web results (title/link/snippet). The ONLY structured
 *      signal is whether the link is a specific hotel page, derived from the URL.
 *   `hotel_list` — OSM nodes, which do carry stars and distance.
 *
 * The room price is visible in snippet text ("Từ 393.582 VND/đêm") and is
 * deliberately NOT read. `applyBudgetFilter` already uses snippet text for the
 * shipped HARD budget filter and that stays exactly where it is — but a number
 * scraped from marketing copy is not a rate for the user's dates, so it must not
 * become a ranking score or a quotable claim.
 */
export function normalizeHotels(toolResult: unknown): Candidate[] {
  const root = (toolResult && typeof toolResult === 'object') ? toolResult as Record<string, unknown> : {}
  const out: Candidate[] = []
  const seen = new Set<string>()

  for (const item of asArray(root.search_results)) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = str(r.title).trim()
    const link = str(r.link)
    if (!name) continue
    if (link && seen.has(link)) continue
    if (link) seen.add(link)

    const attrs: CandidateAttrs = {}
    // Derived from the URL, not from prose — and from the ONE shipped definition.
    put(attrs, 'directPage', link ? isSpecificOtaHotelPage(link) : false)

    out.push({ id: link || name, name, domain: 'hotel', attrs, link: link || null, raw: r })
  }

  for (const item of asArray(root.hotel_list)) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = str(r.name).trim()
    if (!name) continue

    const attrs: CandidateAttrs = {}
    put(attrs, 'distanceKm', typeof r.distance_km === 'number' ? r.distance_km : undefined)
    const starsRaw = str(r.stars).trim()
    if (/^[1-5]$/.test(starsRaw)) put(attrs, 'stars', parseInt(starsRaw, 10))

    out.push({
      id: str(r.maps_link) || name,
      name,
      domain: 'hotel',
      attrs,
      link: str(r.maps_link) || null,
      raw: r,
    })
  }

  return out
}
