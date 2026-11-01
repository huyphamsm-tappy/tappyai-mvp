// Owner UAT 02/11 (approved): a Quy Nhon "ăn chơi" plan had no evening out - the model DID search "bar pub nhạc sống" and
// "quán bar pub beach bar", and both were refused (`places_budget blocked, budget_exhausted, used 3, limit 3`): restaurants and sights had
// used the turn's three place searches. One brain plans its own searches, so it gets room for a full day (6); the model decides how many
// it needs (most turns use one or two) - no keyword decides which turn is "a plan". The legacy budgets are unchanged.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPlacesBudget, PLACES_BUDGET_AGENT, PLACES_BUDGET_DEFAULT, PLACES_BUDGET_ONE_BRAIN, PLACES_BUDGET_PLANNING } from './placesBudget'

describe('one-brain place searches per turn', () => {
  it('six distinct searches pass, the seventh is refused; the legacy budgets stay 3 / 3 / 1', () => {
    expect(PLACES_BUDGET_ONE_BRAIN).toBe(6)
    expect([PLACES_BUDGET_AGENT, PLACES_BUDGET_PLANNING, PLACES_BUDGET_DEFAULT]).toEqual([3, 3, 1])
    const b = createPlacesBudget(PLACES_BUDGET_ONE_BRAIN, { byQuery: true, namedCentre: true })
    const q = ['khách sạn trung tâm', 'quán hải sản', 'điểm tham quan', 'quán cà phê biển', 'bar pub nhạc sống', 'beach club']
    for (const query of q) expect(b.claim('restaurant', 'Quy Nhơn', query).allowed).toBe(true)
    expect(b.claim('bar', 'Quy Nhơn', 'karaoke').allowed).toBe(false)
  })
  it('the route gives it to one-brain turns', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain('createPlacesBudget(agentOn ? PLACES_BUDGET_AGENT : oneBrain ? PLACES_BUDGET_ONE_BRAIN :')
  })
})
