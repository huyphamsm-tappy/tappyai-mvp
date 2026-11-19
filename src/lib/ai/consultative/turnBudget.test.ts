import { describe, it, expect } from 'vitest'
import { tierOf, budgetOf, spendLookup, newBudgetState, TURN_BUDGET_PROMPT } from './turnBudget'
import { ONE_BRAIN_CORE } from './oneBrain'

describe('tierOf', () => {
  it('a plan or an itinerary is a plan turn', () => {
    expect(tierOf({ intent: 'planning' })).toBe('plan')
    expect(tierOf({ intent: 'recommendation', answer_shape: 'itinerary' })).toBe('plan')
  })
  it('a fact or an explanation without fresh data is light; the same intent that needs fresh data is a lookup turn', () => {
    expect(tierOf({ intent: 'knowledge', needs_fresh_data: false })).toBe('light')
    expect(tierOf({ intent: 'knowledge', needs_fresh_data: true })).toBe('lookup')
  })
  it('places, products, prices, news and comparisons are lookup turns', () => {
    for (const intent of ['local_place', 'shopping', 'lookup', 'news', 'recommendation', 'comparison']) expect(tierOf({ intent })).toBe('lookup')
  })
  it('no reading, no tier (the turn keeps the limits it always had)', () => {
    expect(tierOf(null)).toBeNull()
    expect(tierOf({})).toBeNull()
  })
})

describe('spendLookup', () => {
  it('refuses a call over the per-tool cap, with a note that says to use what is there', () => {
    const b = budgetOf('light'), s = newBudgetState()
    expect(spendLookup(b, s, 'get_hotel_prices', 0).ok).toBe(true)
    const v = spendLookup(b, s, 'get_hotel_prices', 0)
    expect(v.ok).toBe(false)
    if (!v.ok) { expect(v.reason).toBe('tool_cap'); expect(v.note).toMatch(/already have/) }
  })
  it('refuses once the whole turn has spent its lookups', () => {
    const b = budgetOf('light'), s = newBudgetState()
    expect(spendLookup(b, s, 'web_search', 0).ok).toBe(true)
    expect(spendLookup(b, s, 'web_search', 0).ok).toBe(true)
    expect(spendLookup(b, s, 'search_places', 0).ok).toBe(true)
    const v = spendLookup(b, s, 'search_places', 0)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('total_cap')
  })
  it('refuses a new lookup after the time of the tier', () => {
    const b = budgetOf('lookup'), s = newBudgetState()
    expect(spendLookup(b, s, 'web_search', 0).ok).toBe(true)
    const v = spendLookup(b, s, 'get_weather', b.timeMs + 1)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('time')
    expect(s.lookups).toBe(1) // a refused call is not counted
  })
  it('the time counts from the first lookup: a turn that was slow to begin still gets its lookups', () => {
    const b = budgetOf('lookup'), s = newBudgetState()
    const late = 64_000 // the model took 64 s before its first step finished (measured under load)
    expect(spendLookup(b, s, 'get_hotel_prices', late).ok).toBe(true)
    expect(spendLookup(b, s, 'web_search', late + 1000).ok).toBe(true)
    expect(spendLookup(b, s, 'get_weather', late + b.timeMs + 1).ok).toBe(false)
  })
  it('a plan turn carries room for its parts: 6 place searches, a stay, a fare', () => {
    const b = budgetOf('plan'), s = newBudgetState()
    for (let i = 0; i < 6; i++) expect(spendLookup(b, s, 'search_places', 0).ok).toBe(true)
    expect(spendLookup(b, s, 'get_hotel_prices', 0).ok).toBe(true)
    expect(spendLookup(b, s, 'get_transport_options', 0).ok).toBe(true)
    expect(spendLookup(b, s, 'search_places', 0).ok).toBe(false)
  })
})

describe('the prompt tells the model what the code enforces', () => {
  it('carries the budget line, and the numbers match the tiers', () => {
    expect(ONE_BRAIN_CORE).toContain(TURN_BUDGET_PROMPT)
    expect(TURN_BUDGET_PROMPT).toContain(`at most ${budgetOf('light').maxLookups} lookups`)
    expect(TURN_BUDGET_PROMPT).toContain(`at most ${budgetOf('lookup').maxLookups}`)
    expect(TURN_BUDGET_PROMPT).toContain(`up to ${budgetOf('plan').maxLookups}`)
  })
})
