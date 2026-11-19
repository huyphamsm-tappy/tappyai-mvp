// 19/11 owner: the plan read like a sightseeing list. A trip plan is the whole package (transport, stay, cost lines, tips) and a short plan for today follows the clock.
import { describe, it, expect } from 'vitest'
import { PRESENT_PLAN_DESCRIPTION } from './oneBrain'

describe('present_plan description', () => {
  it('asks for the package: transport, stay with a price, cost lines, tips', () => {
    for (const w of ['how to get there and back', 'get_hotel_prices', 'cost_breakdown', 'local_tips']) expect(PRESENT_PLAN_DESCRIPTION).toContain(w)
  })
  it('a short plan for today starts from the next sensible hour and is shaped by the hour', () => {
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/current local time/)
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/never with a slot that has already passed/)
  })
  it('keeps the vivid first plan rules', () => {
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/20:30 or later/)
  })
})
