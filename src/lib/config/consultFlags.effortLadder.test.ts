import { describe, it, expect } from 'vitest'
import { isLookupTool, heavyTurnReached, HEAVY_TURN_LOOKUPS } from './consultFlags'

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
