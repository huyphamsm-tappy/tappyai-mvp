import { provenancedClaim, type SourceId } from '@/lib/ai/consultative/evidenceProvenance'
import { cleanOtaTitle } from '@/lib/links/otaTitle'
import { buildActions, type ActionSource } from './actions'
import { capabilitiesOf } from './capabilities'
import {
  unknownClaim,
  type CanonicalEntity,
  type EntityAttributes,
  type EntityDomain,
  type EntityImages,
  type ImageRef,
  type ShoppingOffer,
  type SourceRef,
} from './entity'

// ── THE ONLY WAY A CanonicalEntity IS CREATED ────────────────────────────────
//
// Three builders, one per `kind` — not five, one per domain. A cafe, a cinema
// and a spa are the same `place` and differ only in `domain`, which decides the
// action priority and the extension.
//
// 🔑 ACQUISITION STRATEGY IS ISOLATED HERE. This is what let the whole Google +
// OSM merge be cancelled in architecture rev 2 without touching anything else:
// callers ask for an entity, not for a provider.
//
// 🚨 NOTHING IN THIS FILE INFERS. A field the source did not state becomes
// UNKNOWN, `null` or an absent key. There is no default, no fallback value and
// no "reasonable guess" anywhere below.

/** A place row as `searchPlaces` emits it, from either the Google or the OSM branch. */
export interface PlaceRow extends ActionSource {
  place_id?: string
  name?: string
  address?: string
  google_rating?: string | null
  rating_value?: number
  rating_count?: number
  tappy_rating?: string
  lat?: number
  lng?: number
  distance_km?: number
  opening_hours?: string
  open_now?: boolean
  phone?: string
  price_level?: number
  price_range?: { low?: number; high?: number; currency: string }
  place_types?: string[]
  cuisine?: string
  wifi?: boolean
  vegetarian?: boolean
  outdoor_seating?: boolean
  stars?: string | number
  photo_url?: string
  photo_urls?: string[]
  photo_names?: string[]
  price_search_results?: unknown[]
  /** Serper `/maps` — the provider's own band, verbatim ("1-100.000 ₫"). */
  price_range_text?: string
  /** Serper `/maps` — the full published week, for the card's hours detail. */
  opening_hours_week?: Record<string, string>
  /** Serper `/maps` — OTA links the provider itself attached to this venue. */
  booking_links?: string[]
}

/**
 * Which provider produced this row.
 *
 * Read from the result envelope's own `source`, not guessed from which fields
 * happen to be present — the two branches overlap on name and address, so a
 * shape-sniffing heuristic would mislabel exactly the rows that matter.
 */
export const SERPER_PLACES_SOURCE = 'Serper Maps' as const

export function sourceOf(envelope: { source?: unknown }): SourceId {
  if (envelope?.source === 'OpenStreetMap') return 'osm'
  // Named explicitly rather than sniffed: `/maps` rows and Google Places rows
  // overlap on nearly every field, so a shape heuristic would mislabel exactly
  // the rows whose provenance matters — and `open_now` means different things on
  // the two (asserted vs derived).
  if (envelope?.source === SERPER_PLACES_SOURCE) return 'serper_places'
  return 'google_places'
}

/**
 * Stable id.
 *
 * Google supplies one. OSM does not emit an element id, so an OSM row is keyed
 * by rounded coordinates when it has them and by its normalized name when it
 * does not — stable within a turn, which is all the recommendation layer needs,
 * and never presented as a durable external identifier.
 */
function placeId(row: PlaceRow, src: SourceId): string {
  if (src === 'google_places' && row.place_id) return `place:google:${row.place_id}`
  if (typeof row.lat === 'number' && typeof row.lng === 'number') {
    return `place:osm:${row.lat.toFixed(5)},${row.lng.toFixed(5)}`
  }
  return `place:name:${(row.name || '').trim().toLowerCase()}`
}

const stabilityOf = (source: ImageRef['source']): ImageRef['stability'] =>
  source === 'provider' ? 'stable' : 'volatile'

/**
 * Normalize whatever photo fields a row carries into the canonical shape.
 *
 * `photo_names` are Google RESOURCE NAMES, not URLs — they are the resolver's
 * input, never an image the client could load — so they are counted as evidence
 * that a photo exists but never emitted as one.
 */
export function buildImages(
  row: { photo_url?: string; photo_urls?: string[] },
  source: ImageRef['source'],
): EntityImages {
  const urls: string[] = []
  const push = (u: string | undefined) => {
    const v = (u ?? '').trim()
    if (v.startsWith('http') && !urls.includes(v)) urls.push(v)
  }
  push(row.photo_url)
  for (const u of row.photo_urls ?? []) push(u)

  // Stable-first: a provider CDN image outlives a redirect or a hotlink, so it
  // is the one that should be the primary if both are present.
  const refs: ImageRef[] = urls.map(url => ({ url, source, stability: stabilityOf(source) }))
  refs.sort((a, b) => (a.stability === b.stability ? 0 : a.stability === 'stable' ? -1 : 1))
  return { primary: refs[0] ?? null, gallery: refs }
}

/** `"4.7⭐ (12 đánh giá trên TappyAI)"` → `{avg: 4.7, count: 12}`. Our own output, parsed back. */
function readTappyRating(s: string | undefined): { avg: number; count: number } | null {
  if (!s) return null
  const avg = /(\d+(?:[.,]\d+)?)\s*⭐/.exec(s)
  const count = /\((\d[\d.,]*)/.exec(s)
  if (!avg) return null
  const a = Number(avg[1].replace(',', '.'))
  const c = count ? Number(count[1].replace(/[.,]/g, '')) : 0
  return Number.isFinite(a) ? { avg: a, count: Number.isFinite(c) ? c : 0 } : null
}

function placeAttributes(row: PlaceRow): EntityAttributes {
  const categories = [
    ...(row.place_types ?? []),
    ...((row.cuisine ?? '').split(',').map(c => c.trim()).filter(Boolean)),
  ]
  return {
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.wifi === true ? { wifi: true as const } : {}),
    ...(row.outdoor_seating === true ? { outdoorSeating: true as const } : {}),
    ...(row.vegetarian === true ? { vegetarian: true as const } : {}),
    ...(categories.length > 0 ? { categories } : {}),
  }
}

/**
 * Build a place entity — food, entertainment, spa, and travel attractions.
 *
 * `domain` comes from the tool result's `_tappy_place_domain`, computed by the
 * one classifier that already decided which enrichment to run. It is passed in
 * rather than re-derived so a second classifier cannot disagree with the first.
 */
export function buildPlaceEntity(
  row: PlaceRow,
  opts: {
    domain: EntityDomain
    source: SourceId
    location?: string
    imageSource?: ImageRef['source']
    /**
     * The domain the ACTION list is built for — 'place' when the stated domain is unknown, so a
     * generic place (an attraction) is never handed food order links (live UAT 14 Sep 2026: a
     * bridge in Đà Nẵng carried "Tìm trên GrabFood"). Defaults to `domain`.
     */
    actionDomain?: string
  },
): CanonicalEntity {
  const { domain, source } = opts
  const actionDomain = opts.actionDomain ?? domain
  const sourceRefs: SourceRef[] = []
  if (row.place_id) sourceRefs.push({ src: source, ref: row.place_id })

  const caps = capabilitiesOf(row)
  const priceSignal = Array.isArray(row.price_search_results) && row.price_search_results.length > 0

  const provenance: Record<string, SourceId> = {}
  const mark = (path: string, present: unknown) => { if (present !== undefined && present !== null) provenance[path] = source }
  mark('identity.name', row.name)
  mark('location.address', row.address)
  mark('location.coordinates', row.lat)
  mark('quality.rating', row.rating_value)
  mark('availability.openingHours', row.opening_hours)
  mark('attributes.phone', row.phone)
  if (row.tappy_rating) provenance['quality.tappyRating'] = 'tappy_reviews'
  if (typeof row.distance_km === 'number') provenance['location.distanceKm'] = 'computed'
  if (priceSignal) provenance['pricing.priceSignal'] = 'serper_search'
  if (row.price_range_text) provenance['pricing.priceRangeText'] = source
  /**
   * 🚨 `open_now` FROM A SERPER ROW IS OURS, NOT THE PROVIDER'S.
   *
   * Google Places asserts `currentOpeningHours.openNow` itself, so on that source
   * the value is the provider's. Serper `/maps` publishes only a weekly SCHEDULE —
   * `serperPlaceToRow` derives "open now" from it against Vietnam local time. That
   * derivation is an inference we performed, and recording it as `computed` is what
   * stops anything downstream presenting it with provider authority.
   */
  if (typeof row.open_now === 'boolean') {
    provenance['availability.openNow'] = source === 'serper_places' ? 'computed' : source
  }

  const stars = typeof row.stars === 'string' ? Number(row.stars) : row.stars

  return {
    v: 1,
    id: placeId(row, source),
    domain,
    kind: 'place',
    identity: { name: (row.name || '').trim(), sourceRefs },
    images: buildImages(row, opts.imageSource ?? 'serper_images'),
    location: {
      address: row.address ?? unknownClaim<string>().value,
      coordinates: typeof row.lat === 'number' && typeof row.lng === 'number' ? { lat: row.lat, lng: row.lng } : null,
      distanceKm: typeof row.distance_km === 'number' ? row.distance_km : null,
    },
    quality: {
      // 🔑 The NUMBER, from the widened field mask — not the rating re-parsed out
      // of our own formatted string, which is what `candidate.ts` still has to do.
      rating: provenancedClaim(row.rating_value ?? null, 'structured_provider', source),
      ratingCount: provenancedClaim(row.rating_count ?? null, 'structured_provider', source),
      tappyRating: readTappyRating(row.tappy_rating),
      stars: Number.isFinite(stars) ? (stars as number) : null,
    },
    pricing: {
      price: unknownClaim<number>(),
      priceRange: row.price_range
        ? { low: row.price_range.low ?? null, high: row.price_range.high ?? null, currency: row.price_range.currency }
        : null,
      priceLevel: typeof row.price_level === 'number' ? row.price_level : null,
      // 🚨 Snippet prices are REVIEW_SUPPORTED, never FACT, however confident the
      // text reads. The claim exists so the model must qualify it; the value
      // itself stays in `price_search_results` where the guards can see it.
      priceSignal: priceSignal
        ? provenancedClaim('price_search_results', 'search_snippet', 'serper_search')
        : unknownClaim<string>(),
      // The provider's own band. `structured_provider` ⇒ FACT, unlike the snippet
      // price above it — different sources, different strength, same object.
      priceRangeText: row.price_range_text
        ? provenancedClaim(row.price_range_text, 'structured_provider', source)
        : unknownClaim<string>(),
    },
    availability: {
      openingHours: provenancedClaim(row.opening_hours ?? null, 'structured_provider', source),
      openNow: typeof row.open_now === 'boolean' ? row.open_now : null,
    },
    attributes: placeAttributes(row),
    reviews: {
      actions: buildActions(row, actionDomain, opts.location).filter(a => a.kind === 'review'),
      availability: caps.has_reviews ?? 'none',
    },
    actions: buildActions(row, actionDomain, opts.location),
    provenance,
    // The published WEEK is domain-independent — a cinema's hours matter as much
    // as a restaurant's — so it sits beside the per-domain extension rather than
    // inside the food branch. Carried whole because the card shows the whole week.
    ext: {
      ...(domain === 'food' && row.cuisine
        ? { cuisine: row.cuisine.split(',').map(c => c.trim()).filter(Boolean) }
        : {}),
      ...(row.opening_hours_week && Object.keys(row.opening_hours_week).length > 0
        ? { openingHoursWeek: row.opening_hours_week }
        : {}),
    },
  }
}

/** A Serper `/shopping` row as `searchProducts` emits it. */
export interface ProductRow extends ActionSource {
  title?: string
  link?: string
  price?: string
  price_vnd?: number
  source?: string
  rating?: number
  rating_count?: number
  product_id?: string
  photo_url?: string
  photo_urls?: string[]
  [spec: string]: unknown
}

const SPEC_KEYS = ['ramGb', 'storageGb', 'model', 'size', 'condition'] as const

export function buildProductEntity(row: ProductRow): CanonicalEntity {
  const name = (row.title || '').trim()
  const offers: ShoppingOffer[] = [{
    seller: row.source ?? unknownClaim<string>().value,
    url: row.link ?? unknownClaim<string>().value,
    price: row.price_vnd ?? unknownClaim<number>().value,
    currency: row.price_vnd !== undefined ? 'VND' : unknownClaim<string>().value,
    condition: unknownClaim<string>().value,
  }]

  const specs: Record<string, string | number> = {}
  for (const k of SPEC_KEYS) {
    const v = row[k]
    if (typeof v === 'string' || typeof v === 'number') specs[k] = v
  }

  const provenance: Record<string, SourceId> = {}
  if (name) provenance['identity.name'] = 'serper_shopping'
  if (row.price_vnd !== undefined) provenance['pricing.price'] = 'serper_shopping'
  if (row.rating !== undefined) provenance['quality.rating'] = 'serper_shopping'
  if (row.photo_url) provenance['images.primary'] = 'serper_shopping'

  return {
    v: 1,
    id: `product:serper:${row.product_id || row.link || name}`,
    domain: 'shopping',
    kind: 'product',
    identity: { name, sourceRefs: row.product_id ? [{ src: 'serper_shopping', ref: row.product_id }] : [] },
    // 'provider' — the seller's own CDN image, the most stable class in the system.
    images: buildImages(row, 'provider'),
    location: { address: unknownClaim<string>().value, coordinates: null, distanceKm: null },
    quality: {
      rating: provenancedClaim(row.rating ?? null, 'structured_provider', 'serper_shopping'),
      ratingCount: provenancedClaim(row.rating_count ?? null, 'structured_provider', 'serper_shopping'),
      tappyRating: null,
      stars: null,
    },
    pricing: {
      // The one FACT-grade price in the system: a structured provider field.
      price: provenancedClaim(row.price_vnd ?? null, 'structured_provider', 'serper_shopping'),
      priceRange: null,
      priceLevel: null,
      priceSignal: unknownClaim<string>(),
      priceRangeText: unknownClaim<string>(),
    },
    availability: { openingHours: unknownClaim<string>(), openNow: null },
    attributes: {},
    reviews: { actions: [], availability: 'none' },
    actions: buildActions(row, 'shopping'),
    provenance,
    ext: { offers, ...(Object.keys(specs).length > 0 ? { specs } : {}) },
  }
}

/** A hotel row from `get_hotel_prices` — either a Serper snippet or an OSM hotel. */
export interface StayRow extends ActionSource {
  title?: string
  name?: string
  photo_url?: string
  photo_urls?: string[]
  stars?: string | number
  address?: string
  lat?: number
  lng?: number
  distance_km?: number
  // Serper `/maps` gives hotels the same structured fields it gives restaurants.
  // They used to have nowhere to go on a stay, so they were dropped at the door.
  rating_value?: number
  rating_count?: number
  phone?: string
  opening_hours?: string
  opening_hours_week?: Record<string, string>
  price_range_text?: string
  place_types?: string[]
}

export function buildStayEntity(row: StayRow, opts: { bookingLink?: string; agodaLink?: string } = {}): CanonicalEntity {
  // Snippet titles read "Hotel Name - City - Booking.com"; the name is the part
  // before the first " - ", the same rule the stream filter already applies — and,
  // since CCP Phase 8 (owner-like UAT R1, P2-11), without the OTA decorations Google
  // serves in whatever locale it chose ("Book Oc Tien Sa Hotel Danang i Da Nang på
  // Agoda.com" → "Oc Tien Sa Hotel Danang"). The raw title stays on the row.
  const name = (row.name || cleanOtaTitle(String(row.title ?? '')) || String(row.title ?? '').split(' - ')[0] || '').trim()
  const stars = typeof row.stars === 'string' ? Number(row.stars) : row.stars
  const withLinks: ActionSource = { ...row, name, booking_link: opts.bookingLink, agoda_link: opts.agodaLink }

  /**
   * 🚨 A STAY'S PROVENANCE DEPENDS ON WHERE THE ROW CAME FROM.
   *
   * A `search_results` snippet is a web page title — `serper_search`, and that is
   * what every stay used to be. A `/maps` row is a structured provider record and
   * carries `serper_places`, the same strength a restaurant's rating carries.
   * Labelling both `serper_search` would understate real structured data;
   * labelling both `serper_places` would let a page title inherit authority.
   * The distinguishing signal is the one the provider itself supplies: a
   * structured record has a rating or coordinates, a page title has neither.
   */
  const structured = typeof row.rating_value === 'number' || typeof row.lat === 'number'
  const staySource: SourceId = structured ? 'serper_places' : 'serper_search'

  const provenance: Record<string, SourceId> = {}
  if (name) provenance['identity.name'] = staySource
  if (row.photo_url) provenance['images.primary'] = structured ? 'serper_places' : 'serper_images'
  if (typeof row.lat === 'number') provenance['location.coordinates'] = staySource
  if (typeof row.rating_value === 'number') provenance['quality.rating'] = staySource
  if (row.phone) provenance['attributes.phone'] = staySource
  if (row.opening_hours) provenance['availability.openingHours'] = staySource
  if (row.price_range_text) provenance['pricing.priceRangeText'] = staySource

  return {
    v: 1,
    id: `stay:${row.lat && row.lng ? `${row.lat.toFixed(5)},${row.lng.toFixed(5)}` : name.toLowerCase()}`,
    domain: 'travel',
    kind: 'stay',
    identity: { name, sourceRefs: [] },
    images: buildImages(row, 'serper_images'),
    location: {
      address: row.address ?? unknownClaim<string>().value,
      coordinates: typeof row.lat === 'number' && typeof row.lng === 'number' ? { lat: row.lat, lng: row.lng } : null,
      distanceKm: typeof row.distance_km === 'number' ? row.distance_km : null,
    },
    quality: {
      // 🔑 A REAL GUEST RATING, WHEN THE PROVIDER GAVE ONE. Booking/Agoda scores
      // inside a web SNIPPET are still not extracted — claiming one from prose
      // would be inventing it, and that comment stood for the snippet path. A
      // `/maps` record states `rating`/`ratingCount` as its own fields, so a
      // hotel is no longer the one place kind forced to render without a score.
      rating: provenancedClaim(row.rating_value ?? null, 'structured_provider', staySource),
      ratingCount: provenancedClaim(row.rating_count ?? null, 'structured_provider', staySource),
      tappyRating: null,
      stars: Number.isFinite(stars) ? (stars as number) : null,
    },
    pricing: {
      price: unknownClaim<number>(),
      priceRange: null,
      priceLevel: null,
      priceSignal: unknownClaim<string>(),
      priceRangeText: row.price_range_text
        ? provenancedClaim(row.price_range_text, 'structured_provider', staySource)
        : unknownClaim<string>(),
    },
    availability: {
      openingHours: provenancedClaim(row.opening_hours ?? null, 'structured_provider', staySource),
      openNow: null,
    },
    attributes: {
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.place_types && row.place_types.length > 0 ? { categories: row.place_types } : {}),
    },
    reviews: { actions: [], availability: 'none' },
    actions: buildActions(withLinks, 'travel'),
    provenance,
    ext: {
      ...(Number.isFinite(stars) ? { stars: stars as number } : {}),
      ...(row.opening_hours_week && Object.keys(row.opening_hours_week).length > 0
        ? { openingHoursWeek: row.opening_hours_week }
        : {}),
    },
  }
}
