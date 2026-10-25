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
import { cityInText, VIETNAM_CITY_ENTRIES } from '@/lib/ai/tools/vietnamCities'
import { maskStreetNames, streetOrDishRuns } from '@/lib/ai/streetNames'
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
  /** The user's last message names a city AS A PLACE (cityStatedAsPlace: street / dish / person names masked, a locative cue or a place request around it). */
  statedCity?: boolean
  /** Wave 2G: the message uses a street / dish name that carries a city word AS a place (streetNameUsedAsPlace). Only decides whether an `area` that is just such a name counts. */
  statedStreet?: boolean
}

// "Near me" is where the user IS. Wave 2F (C-F5): the old test folded the diacritics first, so "gần chợ Bến Thành" and "gần nhà thờ Đức Bà" matched the "gan cho" / "gan nha" of "gần chỗ" / "gần nhà" and a landmark
// stopped counting as a stated place. An area is "near me" ONLY when every word of it belongs to the closed class of near-me grammar - the locative word, the deictic ("đây"), a pronoun, a particle - and at
// least one of them is the locative anchor. Anything else in it (a proper noun, a venue, a district number, a city) makes it a place. Diacritics are kept (chợ ≠ chỗ, nhà thờ ≠ nhà); the unaccented spellings
// of the same words are listed beside them, since people type both. No list of places or names.
const NEAR_ME_ANCHORS: ReadonlySet<string> = new Set(['gần', 'gan', 'quanh', 'xung', 'near', 'nearby', 'around'])
const NEAR_ME_WORDS: ReadonlySet<string> = new Set([
  ...NEAR_ME_ANCHORS, 'đây', 'day', 'chỗ', 'cho', 'nhà', 'nha', 'công', 'cong', 'ty', 'bạn', 'ban', 'tôi', 'toi', 'tui', 'mình', 'minh', 'em', 'anh', 'chị', 'của', 'cua', 'ở', 'o', 'khu', 'vực', 'vuc',
  'nhé', 'nhe', 'với', 'voi', 'thôi', 'thoi', 'ạ', 'nhỉ', 'đi', 'di', 'me', 'my', 'here', 'location',
])

/** True when an area string says only "near me" and names no place (a landmark, a venue, a district or a city in it makes it a place). */
export function isNearMeOnly(area: string): boolean {
  const words = area.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.length > 0 && words.every(w => NEAR_ME_WORDS.has(w)) && words.some(w => NEAR_ME_ANCHORS.has(w))
}

// Wave 2F (C-F3): a city word is not always a place. "Nguyễn Huệ" (a king, a street), "Hồ Chí Minh" (a person), "Bún bò Huế" (a dish) carry a city alias and were read as "the user stated a city", which switched the gate
// off for exactly the knowledge questions it exists for. The reader is the one areaAsk.ts and the need profile already use - the city table with street / dish names masked (streetNames.ts) - plus ONE structural
// condition: the city has to be used AS a place. That is (a) a locative word right before it ("ở Huế", "đến Hà Nội", "quanh Đà Nẵng", "thành phố Hồ Chí Minh" - the closed class of Vietnamese / English locative
// words, not a list of places), or (b) the rules router (a reader independent of the intent layer) read the message as a request for a place ("quán phở Hà Nội": a noun phrase with the city at its end). A city
// that is neither - the subject of a question about it or part of a name - is not a stated place. Ambiguous shapes keep the earlier behaviour (the city counts), see the tests.
const LOCATIVE_BEFORE_CITY: ReadonlySet<string> = new Set(['o', 'tai', 'quanh', 'gan', 'den', 've', 'ra', 'vao', 'tren', 'toi', 'di', 'in', 'at', 'to', 'near', 'around', 'tp', 'tinh', 'city'])
const CITY_ALIAS_TOKENS: ReadonlyArray<readonly string[]> = VIETNAM_CITY_ENTRIES.map(([alias]) => alias.split(' ')).sort((a, b) => b.length - a.length)

/**
 * Did the rules router read the message as a request for a PLACE? Sure, not a chat turn, and a venue domain (food / entertainment / spa). `travel` is deliberately NOT counted HERE: the rules read a bare city
 * word as travel ("Hồ Chí Minh sinh năm nào?" → ask [travel]), so for the question "is this city a place?" that reading is the city word again, not independent evidence. A trip / lodging request is recognised
 * separately, with the city word taken OUT of the message first (`readWithoutCity` of `cityStatedAsPlace`, Wave 2G).
 */
export function rulesReadVenueRequest(routed: { decision: { turn: ConsultTurn; domains: readonly string[] }; confidence: 'rule' | 'unsure' } | null | undefined): boolean {
  return !!routed && routed.confidence === 'rule' && routed.decision.turn !== 'chat' && routed.decision.domains.some(d => d === 'food' || d === 'entertainment' || d === 'spa')
}

/**
 * Wave 2G (C-F2): the same router reading, for a message with its city words removed. A trip / lodging / tour request ("đi du lịch ___ 3 ngày nên làm gì", "khách sạn ___ giá tốt") is still a sure, non-chat
 * `travel` (or venue) reading without the city, because the words that make it one ("du lịch", "khách sạn", "tour") are not the city; "___ sinh năm nào?" is not. This is the counterfactual that breaks the
 * circle: only evidence that survives taking the city out counts. Sure and not a chat turn, as for a venue request.
 */
export function rulesReadPlaceOrTripRequest(routed: { decision: { turn: ConsultTurn; domains: readonly string[] }; confidence: 'rule' | 'unsure' } | null | undefined): boolean {
  return !!routed && routed.confidence === 'rule' && routed.decision.turn !== 'chat' && routed.decision.domains.some(d => d === 'food' || d === 'entertainment' || d === 'spa' || d === 'travel')
}

/** Diacritic-folded text as plain tokens with every city alias taken out (whole tokens, longest alias first). Token scan on purpose: no RegExp built from a constant (feedback: constant-template RegExp failed in the production bundle). */
export function maskCityWords(folded: string): string {
  const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean)
  const kept: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const alias = CITY_ALIAS_TOKENS.find(a => a.every((t, k) => tokens[i + k] === t))
    if (alias) { i += alias.length - 1; continue }
    kept.push(tokens[i])
  }
  return kept.join(' ')
}

/**
 * `readWithoutCity`: reads a message that has its city words taken out and says whether it is still a sure place / trip request (the route passes the rules router; this module stays free of it). Called only when
 * no other evidence decided and a city is present.
 */
export function cityStatedAsPlace(text: string, rulesPlaceRequest: boolean, readWithoutCity?: (cityFreeText: string) => boolean): boolean {
  const masked = maskStreetNames(normalizeVN((text || '').toLowerCase()))
  if (!cityInText(masked)) return false
  if (rulesPlaceRequest) return true
  // Wave 2G: a message that is nothing but a city ("Đà Nẵng", "thành phố Hồ Chí Minh") is a place - the answer to "which area?" - not a question about the city; with no sentence around it there is no knowledge question to protect.
  if (maskCityWords(masked).split(/[^a-z0-9]+/).every(t => !t || AREA_CITY_FILLER.has(t))) return true
  const tokens = masked.split(/[^a-z0-9]+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const alias = CITY_ALIAS_TOKENS.find(a => a.every((t, k) => tokens[i + k] === t))
    if (!alias) continue
    if (alias[0] === 'tp') return true // "tp hcm": the alias itself carries the "city" designator
    const before = tokens[i - 1], twoBefore = tokens[i - 2]
    if (before !== undefined && (LOCATIVE_BEFORE_CITY.has(before) || (before === 'pho' && twoBefore === 'thanh'))) return true
    i += alias.length - 1
  }
  if (readWithoutCity) { try { if (readWithoutCity(maskCityWords(masked).replace(/\s+/g, ' ').trim())) return true } catch { /* an unreadable message is not evidence */ } }
  return false
}

// Wave 2G (C-F1): the intent layer's `area` is not always something the user said. When Luna writes an `area` the user's words do not contain, luna.ts replaces it with the city the CODE reads in the message
// (cityInText on the raw text: no street / dish mask), so "Nguyễn Huệ là vua nào?", "Hồ Chí Minh đọc tuyên ngôn ở đâu?" or "Sa Pa có tuyết không?" arrive as `area = Huế / Hồ Chí Minh / Sa Pa` and switched
// the gate off again, past the F3 test above. An `area` that is only a city name carries no evidence beyond the message itself, which `statedCity` (cityStatedAsPlace) has already judged with the structural test;
// so a city-only `area` is not a second opinion and does not count. The same holds for an `area` that is only a street / dish name carrying a city word ("Nguyễn Huệ": the code reads it as the walking street)
// unless the message uses that name as a place (`statedStreet`: after "ở" / "tại", or as "đường ..."). An `area` that names more than that (a district number, a landmark, a venue) is unchanged.
const AREA_CITY_FILLER: ReadonlySet<string> = new Set([...LOCATIVE_BEFORE_CITY, 'thanh', 'pho', 'khu', 'vuc', 'vung'])
/** True when an area string is nothing but a city word (with its designators: "thành phố", "tỉnh", "ở", "tại"...) or a street / dish name that carries one. A district, a landmark or a venue in it makes it more than that. */
export function areaIsCityWordOnly(area: string): boolean {
  const folded = normalizeVN((area || '').toLowerCase())
  if (!cityInText(folded)) return false
  return maskCityWords(maskStreetNames(folded)).split(/[^a-z0-9]+/).filter(t => t && !AREA_CITY_FILLER.has(t)).length === 0
}

/**
 * Is a street / dish name that carries a city word USED as a place in this message? Yes when the name is itself "đường X" / "phố đi bộ X" / "ngõ X" (a designator inside the run) or sits right after a
 * locative word ("ở Nguyễn Huệ", "tại ...", "quanh ..."): the same closed class `cityStatedAsPlace` reads before a city. "Nguyễn Huệ là vua nào" is neither.
 */
export function streetNameUsedAsPlace(text: string): boolean {
  const folded = normalizeVN((text || '').toLowerCase())
  for (const run of streetOrDishRuns(folded)) {
    if (/^(?:duong|pho di bo|street|dai lo|ngo|hem)\s/.test(run.text)) return true
    const before = folded.slice(0, run.index).split(/[^a-z0-9]+/).filter(Boolean).pop()
    if (before !== undefined && (LOCATIVE_BEFORE_CITY.has(before) || STREET_DESIGNATOR_BEFORE.has(before))) return true
  }
  return false
}
const STREET_DESIGNATOR_BEFORE: ReadonlySet<string> = new Set(['duong', 'pho', 'ngo', 'hem', 'street', 'bo', 'lo']) // "đường", "phố", "ngõ", "hẻm", "đi bộ", "đại lộ": the designator words that sit right before a street's name

export type GateAreaKind = 'none' | 'near_me' | 'place'
export type GateAreaSource = 'none' | 'luna_raw' | 'code' | 'rules' | 'other'
const areaKind = (a: string | null | undefined): GateAreaKind => (!a || !a.trim() ? 'none' : isNearMeOnly(a) ? 'near_me' : 'place')
const sameArea = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Wave 2G (M6, F-5): where the area the gate saw came from, as LABELS only (never the text). `mergedAreaKind` is the area the route ended with (rules, the intent layer and code merged);
 * `lunaAreaRawKind` is what the intent layer itself wrote before the code checked it against the user's words (a corrected or dropped area shows up in `check` as "area <raw>→<coded>" / "area <raw>");
 * `areaSource` says who the merged area is from: `luna_raw` (the intent layer's own string passed the check), `code` (the check replaced it with a city the code read), `rules` (the rules router's area),
 * `other` (none of those match), `none`.
 */
export function gateAreaFacts(i: { mergedArea: string | null | undefined; lunaDecisionArea: string | null | undefined; lunaCheck: { dropped: readonly string[]; corrected: readonly string[] } | null | undefined; rulesArea: string | null | undefined }): { mergedAreaKind: GateAreaKind; lunaAreaRawKind: GateAreaKind; areaSource: GateAreaSource } {
  const entry = (list: readonly string[] | undefined): string | null => { const e = (list ?? []).find(x => x.startsWith('area ')); return e ? e.slice(5).split('→')[0] : null }
  const corrected = entry(i.lunaCheck?.corrected), dropped = entry(i.lunaCheck?.dropped)
  const raw = corrected ?? dropped ?? i.lunaDecisionArea ?? null
  const mergedAreaKind = areaKind(i.mergedArea)
  let areaSource: GateAreaSource = 'none'
  if (mergedAreaKind !== 'none') {
    if (corrected !== null && sameArea(i.lunaDecisionArea, i.mergedArea)) areaSource = 'code'
    else if (corrected === null && dropped === null && sameArea(i.lunaDecisionArea, i.mergedArea)) areaSource = 'luna_raw'
    else if (sameArea(i.rulesArea, i.mergedArea)) areaSource = 'rules'
    else areaSource = 'other'
  }
  return { mergedAreaKind, lunaAreaRawKind: areaKind(raw), areaSource }
}

export function searchNowIntentGate(input: SearchNowGateInput): SearchNowGate {
  const c = input.consult
  if (!c) return { blocked: false, reason: 'no_consult_decision', consultTurn: null, statedPlaceFrom: null }
  if (c.turn !== 'chat') return { blocked: false, reason: 'consult_turn', consultTurn: c.turn, statedPlaceFrom: null }
  const area = c.area?.trim() ?? ''
  const from: SearchNowGate['statedPlaceFrom'] = input.statedArea?.trim() ? 'user_area' : input.statedCity ? 'user_city' : area && !isNearMeOnly(area) && (!areaIsCityWordOnly(area) || input.statedStreet) ? 'consult_area' : null
  if (from) return { blocked: false, reason: 'stated_place', consultTurn: c.turn, statedPlaceFrom: from }
  return { blocked: true, reason: 'chat_turn_no_stated_place', consultTurn: c.turn, statedPlaceFrom: null }
}

/** The search-now plan after the gate: a blocked gate drops a plan that would run the place tool, and nothing else. */
export function applySearchNowGate(gate: SearchNowGate | null, searchNow: SearchNow | null): SearchNow | null {
  if (!gate?.blocked || !searchNow) return searchNow
  return PLACE_TYPES.has(searchNow.type) ? null : searchNow
}
