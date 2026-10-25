// ── CONSULT_SEARCH_NOW_INTENT_GATE (Wave 2D · C, corrected in Wave 2E): a place lookup needs a place request ────────────────────────────
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
//   · a "chat" turn with a place stated by the user → NOT blocked (the old behaviour). A place is: a district / a city the CODE read from the user's own words, or an area the intent layer
//     wrote that names a place. "gần đây" / "gần bạn" / "near me" is where the user IS, not a place they stated: an intent-layer area that says only that does not count (Wave 2E);
//   · a "chat" turn with no stated place → BLOCKED: no code-side place lookup starts and `forcedTool = search_places` no longer counts. Unsure and no evidence → no place lookup (the model keeps
//     its tools and may still look a place up itself if it truly needs one - when it does, and there is no location, the user is asked for the area exactly as before).
//
// Known and accepted limit (Wave 2E, F-C1): a REAL place request ("tìm quán phở bò ngon cho 2 người dưới 100k") that the intent layer misreads as `chat`, with a GPS fix and no district, is blocked
// too - the code pre-search does not run; the model still has the place tool and the fix. Nothing independent of the intent layer separates it from a knowledge question that carries a food word and
// "gần đây" (the rules misread those the same way, a GPS fix is present on nearly every phone, and `known` slots appear on chat turns), so any extra evidence would reopen the failure this gate closes.
// The gate event reports `hasValidGps` and the rules' reading so the frequency can be measured.
// Web search is untouched: this gate never reads or changes `web_search` / `get_news`.

import type { ConsultTurn } from './consultBrain'
import type { SearchNow } from './searchNow'
import { PLACE_TYPES } from './presearch'
import { cityInText } from '@/lib/ai/tools/vietnamCities'
import { statedDistrict } from '@/lib/ai/districts'
import { normalizeVN } from '@/lib/ai/intent'

export type SearchNowGateReason = 'no_consult_decision' | 'consult_turn' | 'stated_place' | 'chat_turn_no_stated_place'

export interface SearchNowGate {
  blocked: boolean
  reason: SearchNowGateReason
  consultTurn: ConsultTurn | null
  /** Where the stated place came from, when there is one (never its text). */
  statedPlaceFrom: 'user_area' | 'user_city' | 'consult_area' | null
}

export interface SearchNowGateInput {
  // `known` slots are deliberately NOT read: with a location in hand the rules fill `khu_vuc` for a near-me word ("gần đây" = "recently" in a knowledge question), so a slot is not proof of a stated place.
  consult: { turn: ConsultTurn; area?: string | null } | null
  /** A district / city the USER named in this subject (the route's `statedArea` label). */
  statedArea: string | null
  /** The user's last message names a city the code knows (cityInText). */
  statedCity?: boolean
}

/** "Near me" in the user's words or the intent layer's: where the user IS. Folded, whole words. */
const NEAR_ME = /\b(?:gan day|gan ban|gan toi|gan minh|gan nha|gan cho|gan em|quanh day|xung quanh|near me|nearby|around here)\b/

/** True when an area string says only "near me" and names no place (a city or district in it makes it a place). */
export function isNearMeOnly(area: string): boolean {
  return NEAR_ME.test(normalizeVN(area.toLowerCase())) && !cityInText(area) && statedDistrict(area) === null
}

export function searchNowIntentGate(input: SearchNowGateInput): SearchNowGate {
  const c = input.consult
  if (!c) return { blocked: false, reason: 'no_consult_decision', consultTurn: null, statedPlaceFrom: null }
  if (c.turn !== 'chat') return { blocked: false, reason: 'consult_turn', consultTurn: c.turn, statedPlaceFrom: null }
  const area = c.area?.trim() ?? ''
  const from: SearchNowGate['statedPlaceFrom'] = input.statedArea?.trim() ? 'user_area' : input.statedCity ? 'user_city' : area && !isNearMeOnly(area) ? 'consult_area' : null
  if (from) return { blocked: false, reason: 'stated_place', consultTurn: c.turn, statedPlaceFrom: from }
  return { blocked: true, reason: 'chat_turn_no_stated_place', consultTurn: c.turn, statedPlaceFrom: null }
}

/** The search-now plan after the gate: a blocked gate drops a plan that would run the place tool, and nothing else. */
export function applySearchNowGate(gate: SearchNowGate | null, searchNow: SearchNow | null): SearchNow | null {
  if (!gate?.blocked || !searchNow) return searchNow
  return PLACE_TYPES.has(searchNow.type) ? null : searchNow
}
