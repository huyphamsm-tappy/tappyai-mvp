import { describe, it, expect } from 'vitest'
import { quotaUnitsFor, QUOTA_WEIGHTS } from './quotaWeights'

describe('weighted quota (prepared, OFF by default)', () => {
  it('is OFF unless QUOTA_WEIGHTED=1: every turn costs 1 as today', () => {
    for (const t of Object.keys(QUOTA_WEIGHTS)) expect(quotaUnitsFor(t as never, {})).toBe(1)
  })
  it('when enabled: ask / follow-up / more = 0, consult = 1, plan = 3', () => {
    const on = { QUOTA_WEIGHTED: '1' }
    expect(quotaUnitsFor('ask', on)).toBe(0)
    expect(quotaUnitsFor('followup', on)).toBe(0)
    expect(quotaUnitsFor('more', on)).toBe(0)
    expect(quotaUnitsFor('pick', on)).toBe(1)
    expect(quotaUnitsFor('compare', on)).toBe(1)
    expect(quotaUnitsFor('plan', on)).toBe(3)
    expect(quotaUnitsFor(null, on)).toBe(1)
  })
})
