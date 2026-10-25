import { describe, it, expect } from 'vitest'
import { applySearchNowGate, searchNowIntentGate } from './searchNowIntentGate'
import { consultSearchNowIntentGateOn } from '@/lib/config/consultFlags'
import type { ConsultTurn } from './consultBrain'
import type { SearchNow, SearchNowType } from './searchNow'

const TURNS: ConsultTurn[] = ['ask', 'pick', 'followup', 'compare', 'more', 'reject', 'plan', 'chat']

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
  it('applySearchNowGate drops only a plan that runs the PLACE tool, and only when the gate blocks', () => {
    const mk = (type: SearchNowType): SearchNow => ({ query: 'q', type, exact: true })
    const blocked = searchNowIntentGate({ consult: { turn: 'chat' }, statedArea: null })
    const open = searchNowIntentGate({ consult: { turn: 'pick' }, statedArea: null })
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
