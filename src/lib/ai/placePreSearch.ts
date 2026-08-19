import type { ConsultationDelta } from './consultationDelta'
import type { ConversationState } from './conversationState'
import { normalizeVN } from './intent'

/**
 * The place path's pre-search gate — the sibling of `shouldPreSearchProducts`.
 *
 * WHY THIS EXISTS. The product path was moved off the LLM tool path because an
 * empty search could reach free-form generation and invent a machine, a price,
 * and a spec. The place path was left on the tool path, and it turns out to have
 * the SAME failure with the search working: measured 2026-08-19, the tool
 * returned ten real venues and the reply presented "The Workshop Coffee" and
 * "Soo Kafe", neither of which the tool returned. The authoritative list was in
 * front of the model; being in front of it is not the same as governing it.
 *
 * Searching first is what closes the gap. It is not a new mechanism: when the
 * candidates exist BEFORE the prompt is built, the initial turn is generated
 * under the same grounded-facts regime (`buildGroundedFactsBlock`) that already
 * governs every follow-up turn, instead of reading raw tool output mid-stream
 * with nothing said about it.
 *
 * It is also cheaper. A tool turn costs two model requests — one to call the
 * tool, one to answer. Pre-searching costs one.
 */
export function shouldPreSearchPlaces(opts: {
  delta: ConsultationDelta | null
  forcedTool: string | null
  state: ConversationState | null
  /** True when this turn is asking about somewhere to GO. */
  locationIntent: boolean
  /** Planning turns run a multi-step itinerary and keep their tools. */
  planningIntent: boolean
  hasImage: boolean
}): boolean {
  const { delta, forcedTool, state, locationIntent, planningIntent, hasImage } = opts
  if (!state || !delta) return false

  // Same single authority as the product gate: this turn genuinely needs new
  // evidence. Reuse, refinement over held candidates and decision turns all
  // report false, and none of them should spend a search.
  if (delta.searchImpact.required !== true) return false

  // A place turn, and only a place turn.
  if (!locationIntent) return false
  if (state.candidates.some(c => c.type === 'product')) return false
  // An explicit signal for a different tool wins: asking for the weather in the
  // middle of a cafe consultation is not a place search.
  if (forcedTool && forcedTool !== 'search_places') return false

  // Turns that legitimately need multi-step tool use keep the tool path. An
  // itinerary calls search_places several times with different queries, and a
  // photo turn has to look at the image before it knows what to search for.
  if (planningIntent || hasImage) return false
  return true
}

/**
 * Did the place search produce something to reason about?
 *
 * Mirrors `classifyProductResult`, against the place tool's own shape: results
 * live on `results`, and the tool reports transport failure as `error` rather
 * than throwing.
 */
export function classifyPlaceResult(result: unknown): 'ok' | 'empty' | 'failed' {
  if (!result || typeof result !== 'object') return 'failed'
  const r = result as { error?: unknown; results?: unknown[] }
  if (r.error) return 'failed'
  return Array.isArray(r.results) && r.results.length > 0 ? 'ok' : 'empty'
}

/** The places the enrichment filter would have read off the `a:` frame. */
export function placeRecordsFrom(result: unknown): Array<Record<string, unknown>> {
  if (!result || typeof result !== 'object') return []
  const rs = (result as { results?: unknown[] }).results
  return Array.isArray(rs) ? (rs as Array<Record<string, unknown>>) : []
}

/**
 * What to search for.
 *
 * The user's own words carry the intent ("cafe yên tĩnh"); the accumulated
 * location carries the where. Nothing is inferred beyond joining the two —
 * inventing a category here would be the same fabrication one layer down.
 */
export function buildPlaceQuery(state: ConversationState, lastText: string): {
  query: string
  location?: string
} {
  const query = (state.goal || lastText).replace(/\s+/g, ' ').trim().slice(0, 120)
  return { query, location: locationHintFrom(state, lastText) }
}

/**
 * City tokens the place tool's geocoder recognises directly.
 *
 * WHY THIS MATTERS. The tool geocodes the `location` argument, not the query.
 * Measured: the model passed "Quận 1, TP HCM" and got ten venues; this gate
 * passed the state's stored "quan 1", which matches no city, fell through to
 * slow generic geocoding and returned NOTHING. A district with no city is not
 * a location — the pre-search has to hand over at least as much as the model
 * would have.
 */
const CITY_TOKENS = [
  'ha noi', 'hanoi', 'hn', 'ho chi minh', 'hcm', 'saigon', 'sai gon',
  'da nang', 'danang', 'hue', 'can tho', 'hai phong', 'nha trang',
  'da lat', 'vung tau', 'hoi an',
]

function namesACity(s: string): boolean {
  // Same normaliser the place tool's own geocoder uses, so this predicate and
  // the lookup it is predicting can never disagree.
  const k = normalizeVN(s.toLowerCase())
  return CITY_TOKENS.some(t => k.includes(t))
}

/**
 * The richest location string available: the stored one when it actually names
 * a city, otherwise the user's own sentence, which is where they said it.
 */
export function locationHintFrom(state: ConversationState, lastText: string): string | undefined {
  const stored = state.location?.trim()
  if (stored && namesACity(stored)) return stored
  if (namesACity(lastText)) return lastText.replace(/\s+/g, ' ').trim().slice(0, 120)
  return stored || undefined
}
