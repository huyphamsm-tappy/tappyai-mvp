import { describe, it, expect } from 'vitest'
import { timeReserveHoldsToolCall, TURN_WRITE_RESERVE_MS } from './consultFlags'

// 18/11 (Phase 1, S2): a lookup that starts when only the write reserve of the turn is left is answered by code, not run.
describe('timeReserveHoldsToolCall', () => {
  const DEADLINE = 110_000
  it('runs every lookup while more than the write reserve of the turn is left', () => {
    for (const tool of ['web_search', 'search_places', 'search_products', 'get_hotel_prices', 'read_page']) {
      expect(timeReserveHoldsToolCall(tool, 0, DEADLINE)).toBe(false)
      expect(timeReserveHoldsToolCall(tool, DEADLINE - TURN_WRITE_RESERVE_MS - 1, DEADLINE)).toBe(false)
    }
  })
  it('holds a lookup from the moment only the write reserve is left', () => {
    for (const tool of ['web_search', 'search_places', 'search_products', 'get_hotel_prices', 'get_transport_options', 'read_page']) {
      expect(timeReserveHoldsToolCall(tool, DEADLINE - TURN_WRITE_RESERVE_MS, DEADLINE)).toBe(true)
      expect(timeReserveHoldsToolCall(tool, DEADLINE, DEADLINE)).toBe(true)
    }
  })
  it('never holds what composes the answer: the plan card, the other presentation tools, calculate and the think switch', () => {
    for (const tool of ['present_plan', 'present_options', 'present_blocks', 'calculate', 'think_deeper']) expect(timeReserveHoldsToolCall(tool, DEADLINE, DEADLINE)).toBe(false)
  })
  it('the reserve is 40 s, so a 110 s turn stops looking things up at 70 s', () => {
    expect(TURN_WRITE_RESERVE_MS).toBe(40_000)
    expect(timeReserveHoldsToolCall('web_search', 69_999, DEADLINE)).toBe(false)
    expect(timeReserveHoldsToolCall('web_search', 70_000, DEADLINE)).toBe(true)
  })
  it('a custom reserve moves the cut-off', () => {
    expect(timeReserveHoldsToolCall('web_search', 90_000, DEADLINE, 15_000)).toBe(false)
    expect(timeReserveHoldsToolCall('web_search', 95_000, DEADLINE, 15_000)).toBe(true)
  })
})
