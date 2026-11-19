import { describe, it, expect } from 'vitest'
import { isLookupTool, heavyTurnReached, HEAVY_TURN_LOOKUPS, lookupTimeUp, LOOKUP_TIME_BUDGET_MS } from './consultFlags'
import { readFileSync } from 'node:fs'

// 19/11 (UAT: a trip plan spent 80 s of the 110 s turn on lookups and was cut off while writing): the lookups have a time budget the code holds
describe('lookup time budget', () => {
  it('is 55 s of the 110 s turn: a lookup at or after it is refused, before it is allowed', () => {
    expect(LOOKUP_TIME_BUDGET_MS).toBe(55_000)
    expect(lookupTimeUp(54_999)).toBe(false)
    expect(lookupTimeUp(55_000)).toBe(true)
    expect(lookupTimeUp(80_000)).toBe(true)
    expect(lookupTimeUp(10_000, 10_000)).toBe(true) // a custom budget moves the line
  })
  it('the route refuses a lookup (never a card or a plan call) once the time is up, on the ladder turns only', () => {
    const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
    // counted from the first lookup of the turn, not from its start (a slow first step must not leave the turn with no lookup at all)
    expect(src).toContain('if (effortLadder && isLookupTool(name) && lookupTimeUp(Date.now() - (firstLookupAt ?? Date.now()))) {')
    expect(src).toContain("type: 'tappyai_lookup_time_up'")
  })
})

// 18/11 (Phase 1, S6b): the effort of a one-brain turn steps down only once the turn is HEAVY (many lookups); a light turn keeps medium.
describe('effort ladder', () => {
  it('a turn is heavy from the ninth lookup, not before', () => {
    expect(HEAVY_TURN_LOOKUPS).toBe(9)
    expect(heavyTurnReached(0)).toBe(false)
    expect(heavyTurnReached(8)).toBe(false)
    expect(heavyTurnReached(9)).toBe(true)
    expect(heavyTurnReached(24)).toBe(true)
  })
  it('a custom threshold moves the line', () => {
    expect(heavyTurnReached(5, 6)).toBe(false)
    expect(heavyTurnReached(6, 6)).toBe(true)
  })
  it('every fetching tool is a lookup', () => {
    for (const tool of ['web_search', 'search_places', 'search_products', 'get_hotel_prices', 'get_flight_prices', 'get_transport_options', 'get_weather_forecast', 'get_news', 'get_gold_price', 'get_market_rate', 'read_page']) expect(isLookupTool(tool)).toBe(true)
  })
  it('what composes the answer or switches a mode is not a lookup', () => {
    for (const tool of ['present_plan', 'present_options', 'present_blocks', 'calculate', 'think_deeper', 'save_price_watch']) expect(isLookupTool(tool)).toBe(false)
  })
})
