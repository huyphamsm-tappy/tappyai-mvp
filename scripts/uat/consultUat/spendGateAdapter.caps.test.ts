// @vitest-environment node
// P0-1 · the adapter is the last place a cap is received: a per-turn guard above the maximum is refused AT CONSTRUCTION, before it can hold a
// reservation. MOCK-ONLY.
import { describe, it, expect } from 'vitest'
import { BudgetGuard } from './harness'
import { GuardSpendGate } from './spendGateAdapter'

describe('P0-1 · GuardSpendGate refuses a guard whose cap is above $0.10 (Wave 3-FIX R3-06: the per-turn maximum was $0.05)', () => {
  for (const cap of [0.11, 0.1000001, 1, 10, 1e9, Number.MAX_SAFE_INTEGER, 0.100000000001]) {
    it(`cap ${cap} → throws at construction`, () => {
      expect(() => new GuardSpendGate(new BudgetGuard(cap))).toThrow(/cap|maximum|0\.1/i)
    })
  }
  it('a guard with no cap (every reservation refused anyway) is refused too: the gate cannot state what it enforces', () => {
    expect(() => new GuardSpendGate(new BudgetGuard(null))).toThrow()
  })
  for (const cap of [0.10, 0.05, 0.02, 0.000001]) {
    it(`cap ${cap} → accepted`, () => {
      const g = new GuardSpendGate(new BudgetGuard(cap))
      expect(g.requests).toBe(0)
    })
  }
})
