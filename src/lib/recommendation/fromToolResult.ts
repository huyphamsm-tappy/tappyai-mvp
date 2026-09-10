import { buildPlaceEntity, buildProductEntity, buildStayEntity, sourceOf, type PlaceRow, type ProductRow, type StayRow } from './buildEntity'
import { buildRecommendations, type Recommendation, type RecommendationReason, type ShortlistEntry } from './recommendation'
import type { CanonicalEntity, EntityDomain } from './entity'
import { applyEligibility } from './eligibility'

// ── The one adapter from a tool result to recommendations ────────────────────
//
// Kept out of the route so the route stays a controller and this stays testable
// without a request. Every function here is pure and total: an unexpected result
// shape yields an empty array, never a throw and never a half-built entity.
//
// 🔑 THE RANKER IS NOT RE-RUN. `_tappy_shortlist` and `_tappy_ranking` are read
// as the decisions they already are. Re-deriving them here would be a second
// ranking system that could disagree with the one the model was shown.

const DOMAINS = new Set<EntityDomain>(['food', 'shopping', 'travel', 'entertainment', 'spa'])

/**
 * The domain the place classifier resolved, carried on the result.
 *
 * `place` — a place query matching none of the three enrichment classes — maps
 * to `food` for action purposes only because that is the default place
 * treatment; no food-specific field is invented for it.
 */
function statedDomainOf(r: Record<string, unknown>): EntityDomain | null {
  const d = r._tappy_place_domain
  return typeof d === 'string' && DOMAINS.has(d as EntityDomain) ? (d as EntityDomain) : null
}

/**
 * 🚨 AN UNKNOWN DOMAIN WAS BEING ANSWERED AS "food".
 *
 * `_tappy_place_domain` is `place` for any query matching none of the enrichment
 * classes, and `place` is not an `EntityDomain` — so the old fallback declared it
 * FOOD and then judged its rows against `OSM_ADMIT.food`. A generic place set
 * therefore entered the food boundary, where a cinema, a mall or a gym counts as
 * a different domain's venue and is REJECTED outright. An unknown domain silently
 * became a wrong one.
 *
 * The two uses are now separated, because they need opposite defaults:
 *
 *   · the ELIGIBILITY BOUNDARY is skipped entirely when the domain is unknown.
 *     `classifyEligibility` already has three outcomes and treats absent evidence
 *     as `unknown` (keep, do not reject); an unknown DOMAIN deserves the same
 *     treatment, and asserting one we do not have is the unsafe direction.
 *
 *   · ENTITY CONSTRUCTION still needs a concrete domain, and `food` remains the
 *     default place treatment it always was. Nothing food-specific is invented
 *     for it — this only labels the entity, and it is what shipped before.
 */
const ENTITY_DOMAIN_DEFAULT: EntityDomain = 'food'

const rows = (r: Record<string, unknown>, key: string): Record<string, unknown>[] => {
  const v = r[key]
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
}

/**
 * The turn's Pick, as the caller already computed it.
 *
 * 🚨 WITHOUT THIS THE PICK NEVER ARRIVED. `withShortlist` read the chosen name
 * off `result._tappy_ranking`, but the route builds that block INSIDE the value
 * it returns to the model (`{ ...result, _tappy_ranking }`) — the object handed
 * to this adapter never carried it. So every recommendation came back with
 * `recommended: false`, and the decision the engine had already made could not
 * be rendered by anything downstream.
 *
 * The fields mirror `buildPickPayload` exactly, from the same `Pick`: the same
 * positive reasons, capped the same way, and the runner-up's genuine advantage
 * as the trade-off. Nothing here re-derives a decision.
 */
export interface PickContext {
  name: string
  reasons?: RecommendationReason[]
  tradeOff?: RecommendationReason | null
}

const shortlistOf = (r: Record<string, unknown>): ShortlistEntry[] => {
  const sl = r._tappy_shortlist
  return Array.isArray(sl) ? (sl as ShortlistEntry[]) : []
}

/**
 * Build the turn's recommendations from a `search_places` result.
 *
 * Returns `[]` for anything unusable, which is how a non-place turn, an errored
 * tool and an empty search all behave — the caller never has to distinguish.
 */
export function placeRecommendations(result: unknown, location?: string, pick?: PickContext): Recommendation[] {
  if (!result || typeof result !== 'object') return []
  const r = result as Record<string, unknown>
  const list = rows(r, 'results')
  if (list.length === 0) return []

  const statedDomain = statedDomainOf(r)
  const domain = statedDomain ?? ENTITY_DOMAIN_DEFAULT
  const source = sourceOf(r as { source?: unknown })

  /**
   * 🚨 THE HARD DOMAIN BOUNDARY — before ranking, not after.
   *
   * Ranking orders things that belong in the list. A candidate whose provider
   * category says it belongs to a different domain is EXCLUDED here; it never
   * reaches the ranker to be scored down and hoped about.
   *
   * `amenity` is read from the row the Overpass query filtered on, and
   * `place_types` from Google's `places.types`. Names are never consulted —
   * "Cây Si" is `amenity=restaurant` and stays eligible.
   */
  // OSM rows carry no per-row tag — the Overpass query filtered the WHOLE set on
  // one `amenity`, and the envelope records it as `amenity_type`. That envelope
  // value therefore applies to every row in the set.
  const envelopeAmenity = typeof r.amenity_type === 'string' ? r.amenity_type : undefined
  // No stated domain ⇒ no boundary to enforce. Keeping every row is the safe
  // direction: the alternative is judging them against a domain nobody claimed.
  const eligible = statedDomain === null ? list : applyEligibility(list, statedDomain, row => ({
    amenity: typeof row.amenity === 'string' ? row.amenity : envelopeAmenity,
    osmCategory: typeof row.tourism === 'string' ? row.tourism : undefined,
    placeTypes: Array.isArray(row.place_types) ? (row.place_types as string[]) : undefined,
  })).eligible

  const entities = eligible
    .map(row => buildPlaceEntity(row as PlaceRow, { domain, source, location }))
    .filter(e => e.identity.name.length > 0)

  return withShortlist(entities, r, e => e.identity.name, pick)
}

/** Build recommendations from a `search_products` result. */
export function productRecommendations(result: unknown): Recommendation[] {
  if (!result || typeof result !== 'object') return []
  const r = result as Record<string, unknown>
  const list = rows(r, 'search_results')
  if (list.length === 0) return []
  const entities = list
    .map(row => buildProductEntity(row as ProductRow))
    .filter(e => e.identity.name.length > 0)
  return withShortlist(entities, r, e => e.identity.name)
}

/** Build recommendations from a `get_hotel_prices` result. */
export function stayRecommendations(result: unknown, pick?: PickContext): Recommendation[] {
  if (!result || typeof result !== 'object') return []
  const r = result as Record<string, unknown>
  const list = [...rows(r, 'search_results'), ...rows(r, 'hotel_list')]
  if (list.length === 0) return []
  const bookingLink = typeof r.booking_link === 'string' ? r.booking_link : undefined
  const agodaLink = typeof r.agoda_link === 'string' ? r.agoda_link : undefined
  const entities = list
    .map(row => buildStayEntity(row as StayRow, { bookingLink, agodaLink }))
    .filter(e => e.identity.name.length > 0)
  return withShortlist(entities, r, e => e.identity.name, pick)
}

/**
 * Join entities to the shortlist the ranker already produced.
 *
 * 🚨 JOINED BY NAME, NOT BY INDEX. `_tappy_shortlist` carries the candidate's
 * name and the normalizer may have skipped a nameless row, so an index join
 * would silently shift — the same defect that made the id-based mapping
 * necessary in `rankForModel`.
 */
function withShortlist(
  entities: CanonicalEntity[],
  r: Record<string, unknown>,
  nameOf: (e: CanonicalEntity) => string,
  pick?: PickContext,
): Recommendation[] {
  const sl = shortlistOf(r)
  const byName = new Map(sl.map(s => [(s.name || '').trim().toLowerCase(), s]))
  const shortlist: ShortlistEntry[] = []
  for (const e of entities) {
    const hit = byName.get(nameOf(e).trim().toLowerCase())
    if (hit) shortlist.push({ ...hit, id: e.id })
  }
  // The caller's Pick first; the result block second, for any caller that still
  // carries it there. Matched by name, like the shortlist above.
  const picked = pick?.name ?? (r._tappy_ranking as { id?: string; name?: string } | undefined)?.name
  const pickedEntity = picked
    ? entities.find(e => nameOf(e).trim().toLowerCase() === picked.trim().toLowerCase())
    : undefined
  return buildRecommendations(entities, {
    rankedIds: entities.map(e => e.id),
    shortlist,
    pickedId: pickedEntity?.id ?? null,
    ...(pickedEntity && pick?.reasons?.length ? { reasons: { [pickedEntity.id]: pick.reasons } } : {}),
    ...(pickedEntity && pick?.tradeOff ? { tradeOffs: { [pickedEntity.id]: pick.tradeOff } } : {}),
  })
}
