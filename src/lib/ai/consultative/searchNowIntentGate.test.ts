import { describe, it, expect } from 'vitest'
import { applySearchNowGate, areaIsCityWordOnly, cityStatedAsPlace, gateAreaFacts, isNearMeOnly, maskCityWords, rulesReadPlaceOrTripRequest, rulesReadVenueRequest, searchNowIntentGate, streetNameUsedAsPlace } from './searchNowIntentGate'
import { PLACE_TYPES } from './presearch'
import { streetOrDishRuns } from '@/lib/ai/streetNames'
import { normalizeVN } from '@/lib/ai/intent'
import { consultSearchNowIntentGateOn } from '@/lib/config/consultFlags'
import type { ConsultTurn } from './consultBrain'
import type { SearchNow, SearchNowType } from './searchNow'

const TURNS: ConsultTurn[] = ['ask', 'pick', 'followup', 'compare', 'more', 'reject', 'plan', 'chat']

describe('Wave 2F · isNearMeOnly: a landmark is a place, "near me" grammar is not (diacritics kept: chợ ≠ chỗ, nhà thờ ≠ nhà)', () => {
  it('near-me only: the locative anchor + deictic / pronoun / particle words and nothing else', () => {
    for (const a of ['gần đây', 'Gần bạn', 'gần chỗ mình', 'gần nhà tui', 'gần nhà', 'gần chỗ', 'quanh đây', 'xung quanh', 'xung quanh đây', 'gần công ty tôi', 'gần đây nhé', 'near me', 'nearby', 'around here', 'gan day', 'gan cho minh']) expect(isNearMeOnly(a), a).toBe(true)
  })
  it('a landmark, venue, district or city in the area makes it a place (the review\'s list, both spellings of the near-me word)', () => {
    for (const a of ['gần chợ Bến Thành', 'gần chợ Tân Định', 'gần nhà thờ Đức Bà', 'xung quanh Nhà hát lớn', 'gần chùa Một Cột', 'gần Hồ Gươm', 'gần nhà ga Hà Nội', 'gần Quận 1', 'gần đây ở Huế', 'quanh Đà Nẵng', 'Quận 3', 'Hà Nội', 'gan cho ben thanh', 'gan nha tho duc ba']) expect(isNearMeOnly(a), a).toBe(false)
  })
  it('no anchor, or nothing at all, is not "near me"', () => {
    for (const a of ['', '   ', 'đây', 'mình', 'ở nhà']) expect(isNearMeOnly(a), JSON.stringify(a)).toBe(false)
  })
  it('the gate follows: a chat turn whose intent-layer area is a landmark is NOT blocked; "near me" is', () => {
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'gần Nhà Thờ Đức Bà' }, statedArea: null })).toMatchObject({ blocked: false, statedPlaceFrom: 'consult_area' })
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'gần chợ Bến Thành' }, statedArea: null }).blocked).toBe(false)
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'gần chỗ mình' }, statedArea: null }).blocked).toBe(true)
  })
})

describe('Wave 2F · cityStatedAsPlace: a city word counts as a stated place only when it is used AS a place', () => {
  it('(b) person / street / dish names that carry a city alias are not places (no rules venue reading)', () => {
    for (const t of ['Cho mình biết vua Quang Trung Nguyễn Huệ lên ngôi năm nào?', 'Chủ tịch Hồ Chí Minh sinh năm nào?', 'Hồ Chí Minh sinh năm nào và quê ở đâu?', 'Cho mình hỏi Bún bò Huế có nguồn gốc từ đâu?', 'Sa Pa có tuyết rơi vào tháng mấy?', 'Hải Phòng có phải thành phố cảng không', 'Nha Trang nổi tiếng vì gì trong lịch sử', 'Đà Lạt có lạnh không', 'Cơm hến Huế là món gì', 'Marie Curie là ai']) expect(cityStatedAsPlace(t, false), t).toBe(false)
  })
  it('(a) a locative word right before the city, or a venue request around it, is a stated place', () => {
    for (const t of ['khách sạn ở Đà Lạt cuối tuần này', 'ăn gì ở Huế hôm nay', 'đi chơi ở Hà Nội', 'bay đến Hà Nội', 'quán cà phê quanh Đà Nẵng', 'ra Hà Nội thăm bạn', 'tại Sài Gòn có gì vui', 'thành phố Hồ Chí Minh có quán nào ngon', 'tp hcm có rạp nào', 'near Da Nang', 'in Hanoi']) expect(cityStatedAsPlace(t, false), t).toBe(true)
    for (const t of ['quán phở Hà Nội', 'Hà Nội có quán phở nào ngon', 'karaoke Sài Gòn']) expect(cityStatedAsPlace(t, true), t).toBe(true)
  })
  it('a street / dish name is masked even when the message also carries a locative word', () => {
    expect(cityStatedAsPlace('dạo phố đi bộ Nguyễn Huệ tối nay', false)).toBe(false)
    expect(cityStatedAsPlace('ở Nguyễn Huệ có quán nào', false)).toBe(false)
    expect(cityStatedAsPlace('bún bò Huế ở Huế', false)).toBe(true) // the second "Huế" is a place
    // even when the rules read a venue request, a dish / street name is not the city
    expect(cityStatedAsPlace('quán bún bò Huế ngon', true)).toBe(false)
    expect(cityStatedAsPlace('quán cà phê trên đường Nguyễn Huệ', true)).toBe(false)
  })
  it('KNOWN LIMIT (characterisation): a knowledge question that uses a city after a locative word keeps counting it as a place - the earlier F-C3 behaviour for an ambiguous shape', () => {
    expect(cityStatedAsPlace('Ông Hồ Chí Minh đã đến Hà Nội năm nào?', false)).toBe(true)
  })
  it('no city at all is never a stated place, whatever the rules read', () => {
    expect(cityStatedAsPlace('quán phở bò ngon cho 2 người', true)).toBe(false)
    expect(cityStatedAsPlace('', true)).toBe(false)
  })
  it('rulesReadVenueRequest: a sure, non-chat reading of a venue domain; "travel" is not independent evidence for a city word', () => {
    const r = (turn: ConsultTurn, domains: string[], confidence: 'rule' | 'unsure' = 'rule') => ({ decision: { turn, domains }, confidence })
    expect(rulesReadVenueRequest(r('pick', ['food']))).toBe(true)
    expect(rulesReadVenueRequest(r('ask', ['entertainment']))).toBe(true)
    expect(rulesReadVenueRequest(r('ask', ['spa']))).toBe(true)
    expect(rulesReadVenueRequest(r('ask', ['travel']))).toBe(false)
    expect(rulesReadVenueRequest(r('ask', ['shopping']))).toBe(false)
    expect(rulesReadVenueRequest(r('chat', ['food']))).toBe(false)
    expect(rulesReadVenueRequest(r('pick', ['food'], 'unsure'))).toBe(false)
    expect(rulesReadVenueRequest(null)).toBe(false)
  })
})

describe('searchNowIntentGate (pure)', () => {
  it('no consult decision: not blocked (nothing to read the turn from; the old behaviour)', () => {
    expect(searchNowIntentGate({ consult: null, statedArea: null })).toMatchObject({ blocked: false, reason: 'no_consult_decision' })
    expect(searchNowIntentGate({ consult: null, statedArea: 'Quận 3' }).blocked).toBe(false)
  })
  it('every turn that is not "chat" is left alone, whatever else is true', () => {
    for (const turn of TURNS.filter(t => t !== 'chat')) {
      expect(searchNowIntentGate({ consult: { turn }, statedArea: null }), turn).toMatchObject({ blocked: false, reason: 'consult_turn', consultTurn: turn })
    }
  })
  it('"chat" with nothing stated is blocked; the domain is NOT evidence (the intent layer names one for knowledge questions)', () => {
    const g = searchNowIntentGate({ consult: { turn: 'chat' }, statedArea: null })
    expect(g).toMatchObject({ blocked: true, reason: 'chat_turn_no_stated_place', statedPlaceFrom: null })
    // a consult object that also carries other fields the gate must not read changes nothing
    const noisy = { turn: 'chat' as const, domains: ['food'], known: { mon: 'phở', khu_vuc: 'gần đây' } }
    expect(searchNowIntentGate({ consult: noisy as never, statedArea: null }).blocked).toBe(true)
  })
  it('"chat" with a place the user stated (a district the code read, or an area the intent layer checked) is not blocked', () => {
    expect(searchNowIntentGate({ consult: { turn: 'chat' }, statedArea: 'Quận 3' })).toMatchObject({ blocked: false, reason: 'stated_place', statedPlaceFrom: 'user_area' })
    // Wave 2G (F-1): an area that is only a city ("Đà Nẵng") is no longer a stated place by itself - it is what the code read in the message, which `statedCity` has already judged (see the F-1 block below)
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'Quận 3' }, statedArea: null })).toMatchObject({ blocked: false, reason: 'stated_place', statedPlaceFrom: 'consult_area' })
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'Đà Nẵng' }, statedArea: null })).toMatchObject({ blocked: true, reason: 'chat_turn_no_stated_place' })
    for (const empty of ['', '   ', null, undefined]) expect(searchNowIntentGate({ consult: { turn: 'chat', area: empty as never }, statedArea: empty as never }).blocked, JSON.stringify(empty)).toBe(true)
  })
  it('Wave 2E (C3): an area that says only "near me" is not a stated place; a city the code read from the user\'s words is', () => {
    for (const nearMe of ['gần đây', 'Gần bạn', 'gần chỗ mình', 'quanh đây', 'xung quanh', 'near me', 'nearby', 'around here']) {
      expect(searchNowIntentGate({ consult: { turn: 'chat', area: nearMe }, statedArea: null }), nearMe).toMatchObject({ blocked: true, reason: 'chat_turn_no_stated_place' })
    }
    // a place inside the near-me phrase is a place
    for (const placed of ['gần Hồ Gươm, Hà Nội', 'gần đây ở Quận 3', 'Quận 7']) {
      expect(searchNowIntentGate({ consult: { turn: 'chat', area: placed }, statedArea: null }), placed).toMatchObject({ blocked: false, statedPlaceFrom: 'consult_area' })
    }
    expect(searchNowIntentGate({ consult: { turn: 'chat' }, statedArea: null, statedCity: true })).toMatchObject({ blocked: false, reason: 'stated_place', statedPlaceFrom: 'user_city' })
    expect(searchNowIntentGate({ consult: { turn: 'chat' }, statedArea: null, statedCity: false }).blocked).toBe(true)
    expect(isNearMeOnly('gần đây')).toBe(true); expect(isNearMeOnly('gần đây ở Huế')).toBe(false); expect(isNearMeOnly('Quận 1')).toBe(false)
  })
  it('applySearchNowGate drops only a plan that runs the PLACE tool, and only when the gate blocks - exactly the types presearch.ts runs through the place tool (one shared list)', () => {
    const mk = (type: SearchNowType): SearchNow => ({ query: 'q', type, exact: true })
    const blocked = searchNowIntentGate({ consult: { turn: 'chat' }, statedArea: null })
    const open = searchNowIntentGate({ consult: { turn: 'pick' }, statedArea: null })
    expect([...PLACE_TYPES].sort()).toEqual(['attraction', 'bar', 'cafe', 'cinema', 'restaurant', 'shop', 'spa'])
    for (const t of ['shop', 'restaurant', 'cafe', 'spa', 'bar', 'attraction', 'cinema'] as const) {
      expect(applySearchNowGate(blocked, mk(t)), t).toBeNull()
      expect(applySearchNowGate(open, mk(t)), t).toEqual(mk(t))
      expect(applySearchNowGate(null, mk(t)), t).toEqual(mk(t)) // flag OFF: the route passes a null gate
    }
    for (const t of ['hotel', 'product', 'flight'] as const) expect(applySearchNowGate(blocked, mk(t)), t).toEqual(mk(t))
    expect(applySearchNowGate(blocked, null)).toBeNull()
  })
})

describe('CONSULT_SEARCH_NOW_INTENT_GATE flag: ON only for the exact "1" outside a production runtime', () => {
  const on = (v: string | undefined, extra: Record<string, string | undefined> = {}) => consultSearchNowIntentGateOn({ CONSULT_SEARCH_NOW_INTENT_GATE: v, ...extra })
  it('exact "1" is ON; unset, empty, "0", "true", "on", " 1", "1 ", "yes", "2" are OFF', () => {
    expect(on('1')).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes', '2', 'TRUE', 'On']) expect(on(v), JSON.stringify(v)).toBe(false)
  })
  it('a production runtime reads it as OFF even when it is "1" (NODE_ENV or VERCEL_ENV)', () => {
    expect(on('1', { NODE_ENV: 'production' })).toBe(false)
    expect(on('1', { VERCEL_ENV: 'production' })).toBe(false)
    expect(on('1', { NODE_ENV: 'test' })).toBe(true)
    expect(on('1', { VERCEL_ENV: 'preview', NODE_ENV: 'development' })).toBe(true)
  })
  it('look-alike names do not turn it on', () => {
    for (const k of ['CONSULT_SEARCH_NOW_INTENT_GAT', 'CONSULT_SEARCH_NOW_INTENT_GATES', 'CONSULT_SEARCH_NOW_INTENT_GATE_ON', 'CONSULT_SEARCH_NOW_GATE']) expect(consultSearchNowIntentGateOn({ [k]: '1' }), k).toBe(false)
  })
})

describe('Wave 2G · F-1: an `area` that is only a city word is not a second opinion (luna.ts replaces an area the user did not say with the city the code reads, unmasked)', () => {
  it('areaIsCityWordOnly: a city (with its designators), or a street / dish name that carries a city word, is nothing more - a district, a landmark or a venue in it is more', () => {
    for (const a of ['Huế', 'Hồ Chí Minh', 'TP.HCM', 'Sa Pa', 'thành phố Đà Nẵng', 'tại Hà Nội', 'tp Hà Nội', 'Nguyễn Huệ', 'bún bò Huế']) expect(areaIsCityWordOnly(a), a).toBe(true)
    for (const a of ['Quận 1', 'Quận 3, Hồ Chí Minh', 'gần Hồ Gươm, Hà Nội', 'đường Nguyễn Huệ', 'gần chợ Bến Thành', 'Landmark 81', 'Hà Nội, quận Cầu Giấy', '', '   ']) expect(areaIsCityWordOnly(a), a).toBe(false)
  })
  it('the gate: a city-only area does not count as a stated place - the same area with a district, a landmark, a stated city or a stated street does', () => {
    for (const a of ['Huế', 'Hồ Chí Minh', 'Sa Pa', 'TP.HCM', 'Nguyễn Huệ', 'thành phố Đà Nẵng']) expect(searchNowIntentGate({ consult: { turn: 'chat', area: a }, statedArea: null }), a).toMatchObject({ blocked: true, reason: 'chat_turn_no_stated_place' })
    for (const a of ['Quận 1', 'gần Nhà Thờ Đức Bà', 'Quận 3, Hồ Chí Minh', 'đường Nguyễn Huệ']) expect(searchNowIntentGate({ consult: { turn: 'chat', area: a }, statedArea: null }), a).toMatchObject({ blocked: false, statedPlaceFrom: 'consult_area' })
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'Huế' }, statedArea: null, statedCity: true })).toMatchObject({ blocked: false, statedPlaceFrom: 'user_city' }) // the user used the city as a place: that is what counts, not the area
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'Nguyễn Huệ' }, statedArea: null, statedStreet: true })).toMatchObject({ blocked: false, statedPlaceFrom: 'consult_area' })
  })
  it('streetNameUsedAsPlace: a street / dish name that carries a city word is a place after a locative or a street designator, not as the subject of a question', () => {
    for (const t of ['quán cà phê ở Nguyễn Huệ', 'ăn gì trên đường Nguyễn Huệ', 'dạo phố đi bộ Nguyễn Huệ tối nay', 'tại Nguyễn Huệ có gì vui', 'quanh Nguyễn Huệ có quán nào']) expect(streetNameUsedAsPlace(t), t).toBe(true)
    for (const t of ['Cho mình hỏi Nguyễn Huệ là vị vua như thế nào?', 'Bún bò Huế có nguồn gốc từ đâu?', 'Hồ Chí Minh sinh năm nào?', '']) expect(streetNameUsedAsPlace(t), t).toBe(false)
  })
  it('a message that is only a city is a place (the answer to "which area?"); a question about the city is not', () => {
    for (const t of ['Đà Nẵng', 'thành phố Hồ Chí Minh', 'ở Hà Nội', 'Huế']) expect(cityStatedAsPlace(t, false), t).toBe(true)
    for (const t of ['Hồ Chí Minh sinh năm nào?', 'Sa Pa có tuyết không?', 'Nguyễn Huệ là vua nào', 'Huế từng là kinh đô của triều đại nào']) expect(cityStatedAsPlace(t, false), t).toBe(false)
  })
})

describe('Wave 2G · F-2: a trip / lodging request keeps its meaning when the city word is taken out of it (the counterfactual that breaks the "travel" circle)', () => {
  const r = (turn: ConsultTurn, domains: string[], confidence: 'rule' | 'unsure' = 'rule') => ({ decision: { turn, domains }, confidence })
  it('maskCityWords takes the city out and nothing else (whole tokens, longest alias first)', () => {
    expect(maskCityWords('di du lich da lat 3 ngay')).toBe('di du lich 3 ngay')
    expect(maskCityWords('thanh pho ho chi minh co gi vui')).not.toMatch(/ho chi minh/)
    expect(maskCityWords('')).toBe('')
  })
  it('rulesReadPlaceOrTripRequest: a sure, non-chat reading of a venue OR travel domain; chat, unsure and other domains are not', () => {
    expect(rulesReadPlaceOrTripRequest(r('ask', ['travel']))).toBe(true)
    expect(rulesReadPlaceOrTripRequest(r('pick', ['food']))).toBe(true)
    expect(rulesReadPlaceOrTripRequest(r('chat', ['travel']))).toBe(false)
    expect(rulesReadPlaceOrTripRequest(r('ask', ['travel'], 'unsure'))).toBe(false)
    expect(rulesReadPlaceOrTripRequest(r('ask', ['shopping']))).toBe(false)
    expect(rulesReadPlaceOrTripRequest(null)).toBe(false)
  })
  it('cityStatedAsPlace asks the injected reader with the city taken out, only when nothing else decided and a city is there; a reader that throws is no evidence', () => {
    const seen: string[] = []
    const reader = (answer: boolean) => (t: string) => { seen.push(t); return answer }
    expect(cityStatedAsPlace('đi du lịch Đà Lạt 3 ngày nên làm gì', false, reader(true))).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('du lich'); expect(seen[0]).not.toContain('da lat')
    expect(cityStatedAsPlace('đi du lịch Đà Lạt 3 ngày nên làm gì', false, reader(false))).toBe(false)
    expect(cityStatedAsPlace('Hồ Chí Minh sinh năm nào?', false, reader(false))).toBe(false)
    seen.length = 0
    expect(cityStatedAsPlace('khách sạn ở Đà Lạt', false, reader(false))).toBe(true) // a locative decided: the reader is not asked
    expect(cityStatedAsPlace('quán phở Hà Nội', true, reader(false))).toBe(true) // the rules decided
    expect(cityStatedAsPlace('quán phở bò ngon', false, reader(true))).toBe(false) // no city at all
    expect(seen).toEqual([])
    expect(cityStatedAsPlace('tour Hà Nội 3 ngày', false, () => { throw new Error('boom') })).toBe(false)
  })
})

describe('Wave 2G · F-5: where the area the gate saw came from (labels only)', () => {
  const facts = (o: Partial<Parameters<typeof gateAreaFacts>[0]>) => gateAreaFacts({ mergedArea: null, lunaDecisionArea: null, lunaCheck: null, rulesArea: null, ...o })
  it('no area anywhere', () => { expect(facts({})).toEqual({ mergedAreaKind: 'none', lunaAreaRawKind: 'none', areaSource: 'none' }) })
  it('the intent layer\'s own string passed the check: luna_raw, with its kind', () => {
    expect(facts({ mergedArea: 'gần Nhà Thờ Đức Bà', lunaDecisionArea: 'gần Nhà Thờ Đức Bà', lunaCheck: { dropped: [], corrected: [] } })).toEqual({ mergedAreaKind: 'place', lunaAreaRawKind: 'place', areaSource: 'luna_raw' })
    expect(facts({ mergedArea: 'gần đây', lunaDecisionArea: 'gần đây', lunaCheck: { dropped: [], corrected: [] } })).toEqual({ mergedAreaKind: 'near_me', lunaAreaRawKind: 'near_me', areaSource: 'luna_raw' })
  })
  it('the check replaced what the intent layer wrote with a city the code read: the RAW kind is what it wrote, the merged one is a place, the source is code', () => {
    expect(facts({ mergedArea: 'TP.HCM', lunaDecisionArea: 'TP.HCM', lunaCheck: { dropped: [], corrected: ['area gần đây→TP.HCM'] } })).toEqual({ mergedAreaKind: 'place', lunaAreaRawKind: 'near_me', areaSource: 'code' })
  })
  it('the check dropped it: no merged area from the intent layer, the raw kind is still what it wrote; a rules area is "rules"; anything else "other"', () => {
    expect(facts({ mergedArea: null, lunaDecisionArea: null, lunaCheck: { dropped: ['area vị trí hiện tại'], corrected: [] } })).toEqual({ mergedAreaKind: 'none', lunaAreaRawKind: 'place', areaSource: 'none' })
    expect(facts({ mergedArea: 'Quận 3', lunaDecisionArea: null, lunaCheck: { dropped: [], corrected: [] }, rulesArea: 'quận 3' })).toMatchObject({ areaSource: 'rules', lunaAreaRawKind: 'none' })
    expect(facts({ mergedArea: 'Quận 3', rulesArea: 'Quận 7' })).toMatchObject({ areaSource: 'other' })
  })
  it('the output carries labels only - never the area text', () => {
    const out = facts({ mergedArea: 'bí mật Quận 9', lunaDecisionArea: 'bí mật Quận 9', lunaCheck: { dropped: [], corrected: [] } })
    expect(JSON.stringify(out)).not.toMatch(/bí mật|Quận/)
  })
})

// ── Wave 2H (F4-2): streetNameUsedAsPlace read the text BEFORE every street-name hit again (slice + split per hit) - quadratic; one pass over the tokens now ──────────────────────────────────────────────────────
// `legacyStreetNameUsedAsPlace` is the implementation of Wave 2G, kept here ONLY as the reference of the equivalence test (same sets, same per-hit slice + split).
const LEGACY_LOCATIVE = new Set(['o', 'tai', 'quanh', 'gan', 'den', 've', 'ra', 'vao', 'tren', 'toi', 'di', 'in', 'at', 'to', 'near', 'around', 'tp', 'tinh', 'city'])
const LEGACY_DESIGNATOR = new Set(['duong', 'pho', 'ngo', 'hem', 'street', 'bo', 'lo'])
function legacyStreetNameUsedAsPlace(text: string): boolean {
  const folded = normalizeVN((text || '').toLowerCase())
  for (const run of streetOrDishRuns(folded)) {
    if (/^(?:duong|pho di bo|street|dai lo|ngo|hem)\s/.test(run.text)) return true
    const before = folded.slice(0, run.index).split(/[^a-z0-9]+/).filter(Boolean).pop()
    if (before !== undefined && (LEGACY_LOCATIVE.has(before) || LEGACY_DESIGNATOR.has(before))) return true
  }
  return false
}
const best = (f: () => void, rounds = 5): number => { f(); let m = Infinity; for (let i = 0; i < rounds; i++) { const t0 = performance.now(); f(); m = Math.min(m, performance.now() - t0) } return m }

describe('Wave 2H · F4-2: streetNameUsedAsPlace is linear and classifies exactly as before', () => {
  it('same answer as the Wave 2G implementation on seeded random inputs (street names after / not after a locative, a designator, noise, Unicode) and on the sentences of the earlier tests', () => {
    const pieces = ['nguyễn huệ', 'Nguyễn Huệ', 'bún bò Huế', 'cơm hến huế', 'đường Hà Nội', 'phố đi bộ Nguyễn Huệ', 'ngõ Sài Gòn', 'ở', 'tại', 'quanh', 'gần', 'đến', 'đường', 'phố', 'đi bộ', 'đại lộ', 'hẻm', 'là', 'vua', 'quán', 'phở', 'Quận 1', '1', 'Nguyễn Thái Bình', 'street Da Nang', '😀', '‍', '\n', '-', ',', '?', 'huế', 'ế', 'đ']
    let seed = 20261026
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const fixed = ['quán cà phê ở Nguyễn Huệ', 'ăn gì trên đường Nguyễn Huệ', 'dạo phố đi bộ Nguyễn Huệ tối nay', 'tại Nguyễn Huệ có gì vui', 'quanh Nguyễn Huệ có quán nào', 'Cho mình hỏi Nguyễn Huệ là vị vua như thế nào?', 'Bún bò Huế có nguồn gốc từ đâu?', 'Hồ Chí Minh sinh năm nào?', '', 'nguyễn huệ', 'ở nguyễn huệ', 'bún bò huế bún bò huế ở bún bò huế']
    let mismatch = 0, trues = 0
    for (let i = 0; i < 5000; i++) {
      let t = ''
      const n = Math.floor(rnd() * 14)
      for (let k = 0; k < n; k++) t += pieces[Math.floor(rnd() * pieces.length)] + (rnd() < 0.8 ? ' ' : '')
      const a = streetNameUsedAsPlace(t), b = legacyStreetNameUsedAsPlace(t)
      if (a !== b) mismatch++
      if (a) trues++
    }
    for (const t of fixed) expect(streetNameUsedAsPlace(t), t).toBe(legacyStreetNameUsedAsPlace(t))
    expect(mismatch).toBe(0)
    expect(trues).toBeGreaterThan(500) // the comparison sees both answers often enough to mean something
  })
  it('time grows about linearly with the length of the message: four times the text costs well under the sixteen times a quadratic pass would (best-of-five, wide tolerance)', () => {
    const small = 'nguyễn huệ '.repeat(2400), large = 'nguyễn huệ '.repeat(9600) // ~26.000 and ~105.000 characters, a street name every 11 characters, nothing true
    expect(streetNameUsedAsPlace(small)).toBe(false); expect(streetNameUsedAsPlace(large)).toBe(false)
    const ts = best(() => streetNameUsedAsPlace(small)), tl = best(() => streetNameUsedAsPlace(large))
    expect(tl / Math.max(ts, 0.05), `small ${ts.toFixed(2)} ms, large ${tl.toFixed(2)} ms`).toBeLessThan(9)
  })
  it('a message at the client limit (24.000 characters) full of street names is answered in a few ms, correctly, whether the place use is first, last or absent', () => {
    const body = 'nguyễn huệ '.repeat(2181) // 23.991 characters (clientInput.ts maxMessageTextChars = 24.000)
    expect(body.length).toBeLessThanOrEqual(24000)
    const cases: Array<[string, boolean]> = [[body, false], [body + 'ở nguyễn huệ', true], ['quán ở nguyễn huệ ' + body, true], [body + 'là vua', false]]
    for (const [t, want] of cases) {
      expect(streetNameUsedAsPlace(t)).toBe(want)
      const ms = best(() => streetNameUsedAsPlace(t))
      expect(ms, `${t.length} chars took ${ms.toFixed(2)} ms (a quadratic pass takes ~200 ms here; the bound is wide on purpose so a slow machine does not flake)`).toBeLessThan(50)
    }
  })
})
