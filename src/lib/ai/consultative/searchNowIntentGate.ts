// ── CONSULT_SEARCH_NOW_INTENT_GATE (Wave 2D · C): a place lookup needs a place request ──────────────────────────────────────────────────
//
// Measured (third paid run, trace ON): a plain knowledge question ("what is the strongest evidence of life beyond Earth", "summarise this writer's career",
// "which club does this footballer play for") ran `search_places` BY CODE before the model, failed with `no_current_location`, and the code then appended the area question
// ("Bạn muốn mình tìm ở đâu?") to an answer that never needed a place. Two independent code paths started it:
//   1. searchNow.ts "E3": any run of two capitalised words is a NAMED VENUE → an exact `attraction` search (the shape of a name says nothing about what the user asked);
//   2. intent.ts detectForcedTool: a word like "gần đây" ("recently") reads as "near me" → `forcedTool = search_places` → the search-now directive / the decision-domain frame.
// The lexical readers around those paths (need profile domain "places", frame goal "recommend", `placeDecision`, the near-me flag) are fooled by the same words, so none of them can
// tell a place request from a knowledge question. What CAN: the turn type the intent layer decided (rules + Luna merged — Luna's prompt defines `chat` as greeting / thanks / a knowledge
// question, and it still names a domain for it, so a domain is NOT evidence), and a place the user STATED (a district / city read from the user's own words by code).
//
// The contract (pure; the route calls it only with the flag ON):
//   · no consult decision, or a turn that is not "chat" (ask / pick / more / reject / followup / compare / plan) → NOT blocked: those flows already decided what the turn is;
//   · a "chat" turn with a place stated by the user → NOT blocked (the old behaviour);
//   · a "chat" turn with no stated place → BLOCKED: no code-side place lookup starts, `forcedTool = search_places` no longer counts, and a place lookup that fails for want of a
//     location is not turned into the area question. Unsure and no evidence → no place lookup (the model keeps its tools and may still look a place up itself if it truly needs one).
// Web search is untouched: this gate never reads or changes `web_search` / `get_news`.

import type { ConsultTurn } from './consultBrain'
import type { SearchNow } from './searchNow'

/** The `searchNow` types that run the place tool (presearch.ts PLACE_TYPES). `hotel`, `product` and `flight` have their own tools and are never gated. */
const PLACE_TOOL_TYPES: ReadonlySet<string> = new Set(['shop', 'restaurant', 'cafe', 'spa', 'bar', 'attraction', 'cinema'])

export type SearchNowGateReason = 'no_consult_decision' | 'consult_turn' | 'stated_place' | 'chat_turn_no_stated_place'

export interface SearchNowGate {
  blocked: boolean
  reason: SearchNowGateReason
  consultTurn: ConsultTurn | null
  /** Where the stated place came from, when there is one (never its text). */
  statedPlaceFrom: 'user_area' | 'consult_area' | null
}

export interface SearchNowGateInput {
  // `known` slots are deliberately NOT read: with a location in hand the rules fill `khu_vuc` for a near-me word ("gần đây" = "recently" in a knowledge question), so a slot is not proof of a stated place.
  consult: { turn: ConsultTurn; area?: string | null } | null
  /** A district / city the USER named in this subject (the route's `statedArea` label). */
  statedArea: string | null
}

export function searchNowIntentGate(input: SearchNowGateInput): SearchNowGate {
  const c = input.consult
  if (!c) return { blocked: false, reason: 'no_consult_decision', consultTurn: null, statedPlaceFrom: null }
  if (c.turn !== 'chat') return { blocked: false, reason: 'consult_turn', consultTurn: c.turn, statedPlaceFrom: null }
  const from: SearchNowGate['statedPlaceFrom'] = input.statedArea?.trim() ? 'user_area' : c.area?.trim() ? 'consult_area' : null
  if (from) return { blocked: false, reason: 'stated_place', consultTurn: c.turn, statedPlaceFrom: from }
  return { blocked: true, reason: 'chat_turn_no_stated_place', consultTurn: c.turn, statedPlaceFrom: null }
}

/** The search-now plan after the gate: a blocked gate drops a plan that would run the place tool, and nothing else. */
export function applySearchNowGate(gate: SearchNowGate | null, searchNow: SearchNow | null): SearchNow | null {
  if (!gate?.blocked || !searchNow) return searchNow
  return PLACE_TOOL_TYPES.has(searchNow.type) ? null : searchNow
}
