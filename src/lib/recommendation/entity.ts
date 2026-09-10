import { UNKNOWN, type Known } from '@/lib/ai/consultative/normalizedEvidence'
import type { ProvenancedClaim, SourceId } from '@/lib/ai/consultative/evidenceProvenance'
import type { Action } from './actions'

// ── THE CANONICAL ENTITY ─────────────────────────────────────────────────────
//
// One shape for all five domains, with a `kind` discriminant and a narrow
// per-domain extension. NOT five schemas: a cafe, a cinema and a spa are the
// same `place` and differ only in which actions and extension fields exist.
//
// 🚨 EVERY FACTUAL FIELD HAS A DETERMINISTIC SOURCE. There is no field on this
// object that a language model may fill. Absence is modelled with the existing
// `UNKNOWN` sentinel rather than a second absence convention — the codebase is
// explicit that there is one, and "we have no hours" must stay distinguishable
// from "closed".
//
// 🔑 WHAT IS DELIBERATELY MISSING: `description`. No approved source produces
// one. Google's `editorialSummary` exists, but at Enterprise + Atmosphere, which
// was priced and NOT approved (architecture rev 2 §4.5). Leaving the field out
// entirely is the point — a slot named `description` is an invitation for
// model prose to be stored as though it were sourced data.

/** Which of the five product domains this entity belongs to. */
export type EntityDomain = 'food' | 'shopping' | 'travel' | 'entertainment' | 'spa'

/** The SHAPE, as opposed to the topic. A hotel and a cafe are both places. */
export type EntityKind = 'place' | 'product' | 'stay'

export interface SourceRef {
  src: SourceId
  ref: string
}

export interface ImageRef {
  url: string
  source: 'website' | 'google_photo' | 'serper_images' | 'provider'
  /**
   * Derived from `source`, never measured. A provider's own CDN image outlives a
   * Google Photo redirect or a hotlinked website hero, and ordering stable-first
   * is a one-line policy that reduces broken images with no new infrastructure.
   */
  stability: 'stable' | 'volatile'
}

export interface EntityImages {
  primary: ImageRef | null
  gallery: ImageRef[]
}

export interface EntityLocation {
  address: Known<string>
  coordinates: { lat: number; lng: number } | null
  /** Request-scoped: depends on the user's GPS, so it is never persisted. */
  distanceKm: number | null
}

export interface EntityQuality {
  rating: ProvenancedClaim<number>
  ratingCount: ProvenancedClaim<number>
  /** TappyAI's own community rating. Numbers, not the localized string the tool layer emits. */
  tappyRating: { avg: number; count: number } | null
  /** Hotel class 1–5. */
  stars: number | null
}

export interface EntityPricing {
  /** A single authoritative price. Shopping only today, and only ever `FACT`. */
  price: ProvenancedClaim<number>
  /** A band: a provider price range, or the spread across a product's offers. */
  priceRange: { low: number | null; high: number | null; currency: string } | null
  /** Google's 0–4 band. Structured, but coarse. */
  priceLevel: number | null
  /** A price seen in a search snippet. Always REVIEW_SUPPORTED — must be qualified. */
  priceSignal: ProvenancedClaim<string>
}

export interface EntityAvailability {
  openingHours: ProvenancedClaim<string>
  /** `null` means unknown — deliberately not `false`, which would read as "closed". */
  openNow: boolean | null
}

/** Sparse by nature. A missing key means "not stated", never "no". */
export interface EntityAttributes {
  phone?: string
  wifi?: true
  outdoorSeating?: true
  vegetarian?: true
  /** Google `types` / OSM `cuisine`, normalized to a flat list. */
  categories?: string[]
}

export interface EntityReviews {
  /** Where to read reviews. Content itself is never copied — see §9 of the architecture. */
  actions: Action[]
  /** 'verified' when attributed content exists, 'search' when only a search URL does. */
  availability: 'verified' | 'search' | 'none'
}

// ── Domain extensions — thin, and two of them deliberately empty ─────────────

export interface FoodExt { cuisine?: string[] }

export interface ShoppingOffer {
  seller: Known<string>
  url: Known<string>
  price: Known<number>
  currency: Known<string>
  condition: Known<string>
}
export interface ShoppingExt {
  offers: ShoppingOffer[]
  /** Only what the listing title literally stated. Never inferred from the model. */
  specs?: Record<string, string | number>
}

export interface TravelExt { stars?: number }

/**
 * 🚨 EMPTY ON PURPOSE, BOTH OF THEM.
 *
 * Entertainment has no event, showtime or ticket source, and Spa has no service
 * catalogue or appointment source. Declaring the types now keeps the union
 * closed so a future integration slots in without touching the core — and, more
 * importantly, means nobody can ship a ticket button before there is ticket
 * data, because there is nowhere to put it.
 */
export type EntertainmentExt = Record<string, never>
export type SpaExt = Record<string, never>

export type EntityExt = FoodExt | ShoppingExt | TravelExt | EntertainmentExt | SpaExt

export interface CanonicalEntity {
  /** Schema version. Precedent: `NormalizedEvidence.v`. A persisted entity outlives its writer. */
  v: 1
  /** Stable within a turn: `place:google:<id>`, `place:osm:<lat,lng>`, `product:serper:<id>`. */
  id: string
  domain: EntityDomain
  kind: EntityKind
  identity: { name: string; sourceRefs: SourceRef[] }
  images: EntityImages
  location: EntityLocation
  quality: EntityQuality
  pricing: EntityPricing
  availability: EntityAvailability
  attributes: EntityAttributes
  reviews: EntityReviews
  /** The ONLY place URLs live. Built by the application; see actions.ts. */
  actions: Action[]
  /** Which provider produced each field, keyed by dotted path. */
  provenance: Record<string, SourceId>
  ext: EntityExt
}

/** A claim with nothing behind it. Used wherever a source did not state a value. */
export const unknownClaim = <T>(): ProvenancedClaim<T> => ({
  value: UNKNOWN as Known<T>,
  evidence_type: 'UNKNOWN',
  source_type: 'none',
})

/** True when a claim actually carries a value. The one absence check callers need. */
export const isKnown = <T>(c: ProvenancedClaim<T>): boolean =>
  c.value !== UNKNOWN && c.evidence_type !== 'UNKNOWN'
