import { describe, it, expect } from 'vitest'
import { applySearchNowGate, cityStatedAsPlace, isNearMeOnly, rulesReadVenueRequest, searchNowIntentGate } from './searchNowIntentGate'
import { PLACE_TYPES } from './presearch'
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
    expect(searchNowIntentGate({ consult: { turn: 'chat', area: 'Đà Nẵng' }, statedArea: null })).toMatchObject({ blocked: false, reason: 'stated_place', statedPlaceFrom: 'consult_area' })
    for (const empty of ['', '   ', null, undefined]) expect(searchNowIntentGate({ consult: { turn: 'chat', area: empty as never }, statedArea: empty as never }).blocked, JSON.stringify(empty)).toBe(true)
  })
  it('Wave 2E (C3): an area that says only "near me" is not a stated place; a city the code read from the user\'s words is', () => {
    for (const nearMe of ['gần đây', 'Gần bạn', 'gần chỗ mình', 'quanh đây', 'xung quanh', 'near me', 'nearby', 'around here']) {
      expect(searchNowIntentGate({ consult: { turn: 'chat', area: nearMe }, statedArea: null }), nearMe).toMatchObject({ blocked: true, reason: 'chat_turn_no_stated_place' })
    }
    // a place inside the near-me phrase is a place
    for (const placed of ['gần Hồ Gươm, Hà Nội', 'gần đây ở Quận 3', 'Đà Nẵng', 'Quận 7']) {
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
