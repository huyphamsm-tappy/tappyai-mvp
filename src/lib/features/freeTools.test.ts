import { describe, it, expect } from 'vitest'
import { toolsForFreePlan, FREE_TOOL_NAMES } from './freeTools'
import { isLookupTool } from '@/lib/config/consultFlags'
import { EXPLAIN_FEATURE_DESCRIPTION } from '@/lib/ai/consultative/oneBrain'

describe('a Free turn keeps only explain_feature', () => {
  const all = { search_places: 1, web_search: 2, get_hotel_prices: 3, present_plan: 4, explain_feature: 5 }
  it('every paid tool is dropped, explain_feature stays, and the input is not changed', () => {
    expect(toolsForFreePlan(all)).toEqual({ explain_feature: 5 })
    expect(Object.keys(all)).toHaveLength(5)
  })
  it('with no explain_feature among them the Free turn has no tool at all, as before', () => {
    expect(toolsForFreePlan({ search_places: 1, web_search: 2 })).toEqual({})
    expect(toolsForFreePlan({})).toEqual({})
  })
  it('the only name allowed is explain_feature (a new name here is a decision about Free plan cost)', () => {
    expect([...FREE_TOOL_NAMES]).toEqual(['explain_feature'])
  })
})

describe('explain_feature in the turn', () => {
  it('it is not a lookup: it does not use up the lookups, rounds or time of the turn budget', () => {
    expect(isLookupTool('explain_feature')).toBe(false)
    expect(isLookupTool('web_search')).toBe(true)
  })
  it('its description says when to call it, that it costs nothing, and not to invent', () => {
    expect(EXPLAIN_FEATURE_DESCRIPTION).toMatch(/how to use Tappy/i)
    expect(EXPLAIN_FEATURE_DESCRIPTION).toMatch(/does not search the web/i)
    expect(EXPLAIN_FEATURE_DESCRIPTION).toMatch(/do not invent|not listed|do not have that listed/i)
  })
})
