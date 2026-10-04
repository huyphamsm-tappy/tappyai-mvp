// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { withSerperTurnBudget, withSerperToolBudget, sharedSerperBudget, admitWithinToolBudget } from './serperToolBudget'

describe('Serper budgets (hardening D)', () => {
  it('tool cap nested in turn cap: the turn total never passes its limit', async () => {
    const r = await withSerperTurnBudget(8, async () => {
      const a = await withSerperToolBudget(6, async () => [admitWithinToolBudget(3), admitWithinToolBudget(3), admitWithinToolBudget(1)])
      const b = await withSerperToolBudget(6, async () => [admitWithinToolBudget(3), admitWithinToolBudget(1), admitWithinToolBudget(1)])
      return { a: a.value, b: b.value }
    })
    expect(r.value.a).toEqual([true, true, false]) // tool cap 6
    expect(r.value.b).toEqual([false, true, true]) // turn cap 8: 6 + 3 refused, 6 + 1 + 1
    expect(r.spent).toBe(8)
  })
  it('shared after-loop budget: photos + TikTok together never pass what the tools left, even concurrently', async () => {
    const after = sharedSerperBudget(1)
    const [photo, tiktok] = await Promise.all([after.run(async () => admitWithinToolBudget(1)), after.run(async () => admitWithinToolBudget(1))])
    expect([photo, tiktok].filter(Boolean)).toHaveLength(1)
    expect(after.spent()).toBe(1)
    const zero = sharedSerperBudget(0)
    expect(await zero.run(async () => admitWithinToolBudget(1))).toBe(false)
  })
  it('outside every scope nothing is refused (legacy path unchanged)', () => {
    expect(admitWithinToolBudget(3)).toBe(true)
  })
})
