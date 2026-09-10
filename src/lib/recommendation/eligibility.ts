import type { EntityDomain } from './entity'

// ── BUG 4 — a hard domain boundary between retrieval and ranking ─────────────
//
//   RETRIEVAL → DOMAIN ELIGIBILITY → RANKING → SHORTLIST → RECOMMENDATION
//
// 🔑 A RELEVANCE SCORE MUST NOT COMPENSATE FOR A DOMAIN MISMATCH. Ranking orders
// things that belong in the list; it is not a filter, and hoping a furniture
// shop sorts to the bottom of a restaurant list is not a boundary. This stage
// EXCLUDES; it never re-scores.
//
// 🚨 WHAT THIS IS *NOT* FOR — AND THE CASE THAT PROVED IT. "Cây Si" was reported
// as a tree recommended for dining. It is not: OSM node 446043425 is tagged
// `amenity=restaurant`. It is a restaurant named after a banyan tree, which is
// an ordinary Vietnamese naming convention, and it MUST stay eligible. This
// layer reads provider CATEGORY METADATA and never the venue's name — a filter
// that judged names would have thrown out a real restaurant, which is precisely
// the failure it would claim to prevent.
//
// 🚨 WHY IT IS NEEDED ANYWAY. Today OSM's `amenity` filter already enforces the
// domain at retrieval, so exposure is low. The moment the Google path is
// unblocked that stops being true: `places:searchText` is a TEXT search, and
// `includedType` is only sent when the model supplies a type — so "buffet Hà
// Nội" can return a hotel or a shop. `places.types` is in the approved field
// mask precisely so this stage has something deterministic to read.

/** Verdict for one candidate. `unknown` is deliberately distinct from `reject`. */
export type EligibilityVerdict = 'admit' | 'reject' | 'unknown'

/**
 * Google `types` values that clearly belong to each domain.
 *
 * Membership admits. Non-membership does NOT reject — see `UNRELATED`.
 */
const GOOGLE_ADMIT: Record<EntityDomain, readonly string[]> = {
  food: ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'meal_delivery', 'food', 'coffee_shop',
    'ice_cream_shop', 'sandwich_shop', 'pizza_restaurant', 'fast_food_restaurant', 'buffet_restaurant',
    'vegetarian_restaurant', 'vegan_restaurant', 'seafood_restaurant', 'breakfast_restaurant', 'brunch_restaurant'],
  shopping: ['store', 'shopping_mall', 'clothing_store', 'department_store', 'electronics_store',
    'furniture_store', 'supermarket', 'grocery_store', 'book_store', 'jewelry_store', 'shoe_store'],
  travel: ['lodging', 'hotel', 'motel', 'resort_hotel', 'guest_house', 'hostel', 'tourist_attraction',
    'museum', 'campground', 'bed_and_breakfast'],
  entertainment: ['movie_theater', 'night_club', 'amusement_park', 'bowling_alley', 'casino', 'stadium',
    'concert_hall', 'performing_arts_theater', 'tourist_attraction', 'amusement_center', 'karaoke',
    'video_arcade', 'park', 'zoo', 'aquarium', 'gym', 'fitness_center', 'bar'],
  spa: ['spa', 'beauty_salon', 'hair_salon', 'nail_salon', 'massage', 'wellness_center', 'sauna',
    'skin_care_clinic', 'barber_shop'],
}

/**
 * Types that are CLEARLY incompatible with a domain — the reject list.
 *
 * 🔑 DELIBERATELY SHORT AND OBVIOUS. The task is to stop cross-domain
 * contamination, not to maximise precision: an aggressive list would destroy
 * recall on the long tail of sparsely-typed venues. Anything not named here and
 * not on the admit list is `unknown`, which is admitted.
 */
const UNRELATED: Record<EntityDomain, readonly string[]> = {
  food: ['lodging', 'hotel', 'clothing_store', 'furniture_store', 'shoe_store', 'jewelry_store',
    'car_repair', 'car_dealer', 'gas_station', 'bank', 'atm', 'hospital', 'pharmacy', 'school',
    'university', 'church', 'cemetery', 'park', 'natural_feature', 'real_estate_agency', 'insurance_agency'],
  shopping: ['restaurant', 'cafe', 'bar', 'lodging', 'hotel', 'hospital', 'school', 'cemetery',
    'gas_station', 'church', 'natural_feature'],
  travel: ['car_repair', 'gas_station', 'bank', 'atm', 'hospital', 'pharmacy', 'cemetery',
    'clothing_store', 'furniture_store', 'school'],
  entertainment: ['lodging', 'hotel', 'hospital', 'pharmacy', 'bank', 'atm', 'cemetery', 'school',
    'gas_station', 'car_repair', 'furniture_store'],
  spa: ['restaurant', 'cafe', 'bar', 'lodging', 'hotel', 'gas_station', 'car_repair', 'bank', 'atm',
    'cemetery', 'school', 'furniture_store'],
}

/** OSM `amenity` / `tourism` / `shop` values that belong to each domain. */
const OSM_ADMIT: Record<EntityDomain, readonly string[]> = {
  food: ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'bakery', 'biergarten'],
  shopping: ['marketplace', 'mall', 'supermarket', 'department_store', 'convenience', 'clothes', 'shoes'],
  travel: ['hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'resort', 'attraction', 'museum',
    'viewpoint', 'theme_park', 'zoo', 'gallery'],
  entertainment: ['cinema', 'theatre', 'nightclub', 'casino', 'bar', 'pub', 'gym', 'fitness_centre',
    'community_centre', 'arts_centre', 'attraction', 'theme_park', 'zoo', 'karaoke_box'],
  spa: ['spa', 'beauty', 'massage', 'hairdresser', 'sauna', 'wellness'],
}

/** The category evidence a candidate carries, from either provider. */
export interface EligibilityInput {
  /** Google `places.types`. */
  placeTypes?: string[]
  /** OSM `amenity` — the tag the Overpass query filtered on. */
  amenity?: string
  /** OSM `tourism` / `shop`, when present. */
  osmCategory?: string
}

const has = (list: readonly string[], values: string[]) =>
  values.some(v => list.includes(v))

/**
 * Is this candidate eligible for the domain?
 *
 * 🚨 THREE OUTCOMES, NOT TWO. `unknown` exists because provider metadata is
 * incomplete far more often than it is wrong: an OSM row with only a name, or a
 * Google row whose `types` did not come back, has not been shown to be a
 * mismatch. Collapsing `unknown` into `reject` would delete legitimate venues —
 * a worse failure than the contamination this prevents.
 */
export function classifyEligibility(input: EligibilityInput, domain: EntityDomain): EligibilityVerdict {
  const osm = [input.amenity, input.osmCategory].filter((v): v is string => !!v).map(v => v.toLowerCase())
  const google = (input.placeTypes ?? []).map(t => t.toLowerCase())

  // OSM first: the Overpass query filtered on this tag, so it is the strongest
  // evidence available and it is exact rather than a list of loose labels.
  if (osm.length > 0) {
    if (has(OSM_ADMIT[domain], osm)) return 'admit'
    // A tag that belongs to a DIFFERENT domain's admit list is a real mismatch.
    for (const d of Object.keys(OSM_ADMIT) as EntityDomain[]) {
      if (d !== domain && has(OSM_ADMIT[d], osm)) return 'reject'
    }
    // Anything else with a category tag that is not a venue category at all.
    return 'unknown'
  }

  if (google.length > 0) {
    if (has(GOOGLE_ADMIT[domain], google)) return 'admit'
    if (has(UNRELATED[domain], google)) return 'reject'
    return 'unknown'
  }

  // No category evidence at all. Not a mismatch — just unproven.
  return 'unknown'
}

/**
 * The hard boundary. Keeps `admit` and `unknown`; drops `reject`.
 *
 * Returns the excluded rows too, so the caller can report what the boundary
 * removed instead of a candidate silently disappearing.
 */
export function applyEligibility<T>(
  rows: readonly T[],
  domain: EntityDomain,
  read: (row: T) => EligibilityInput,
): { eligible: T[]; excluded: T[] } {
  const eligible: T[] = []
  const excluded: T[] = []
  for (const r of rows) {
    if (classifyEligibility(read(r), domain) === 'reject') excluded.push(r)
    else eligible.push(r)
  }
  return { eligible, excluded }
}
