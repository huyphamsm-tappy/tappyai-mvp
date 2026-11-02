import { describe, it, expect } from 'vitest'
import { consultSearchNowIntentGateOn, consultToolByNeedOn, consultDeterministicMathOn, consultResearchLoopOn, consultStructuredSynthesisOn } from './consultFlags'
import { consultTools, DOMAIN_TOOLS } from '@/lib/ai/consultative/leanConsultPrompt'

describe('Wave 3 · W3 CONSULT_STRUCTURED_SYNTHESIS', () => {
  it('ON only for the exact value "1", outside production, and needs no other flag', () => {
    expect(consultStructuredSynthesisOn({ CONSULT_STRUCTURED_SYNTHESIS: '1' })).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes', '11']) expect(consultStructuredSynthesisOn({ CONSULT_STRUCTURED_SYNTHESIS: v }), String(v)).toBe(false)
    expect(consultStructuredSynthesisOn({ CONSULT_STRUCTURED_SYNTHESIS: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(consultStructuredSynthesisOn({ CONSULT_STRUCTURED_SYNTHESIS: '1', NODE_ENV: 'production' })).toBe(false)
  })
})

describe('Wave 3 · W1 CONSULT_RESEARCH_LOOP', () => {
  it('ON only for the exact value "1", outside production, and needs no other flag', () => {
    expect(consultResearchLoopOn({ CONSULT_RESEARCH_LOOP: '1' })).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes', '11']) expect(consultResearchLoopOn({ CONSULT_RESEARCH_LOOP: v }), String(v)).toBe(false)
    expect(consultResearchLoopOn({ CONSULT_RESEARCH_LOOP: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(consultResearchLoopOn({ CONSULT_RESEARCH_LOOP: '1', NODE_ENV: 'production' })).toBe(false)
  })
  it('consultTools: with research every area gets web_search and read_page; with no area nothing is offered', () => {
    for (const d of ['food', 'spa', 'entertainment', 'shopping', 'travel'] as const) {
      const off = consultTools([d])
      expect(consultTools([d], { research: true }).sort()).toEqual([...new Set([...off, 'web_search', 'read_page'])].sort())
    }
    expect(consultTools([], { research: true })).toEqual([])
  })
})

describe('Wave 3 · W4 CONSULT_DETERMINISTIC_MATH', () => {
  it('ON only for the exact value "1", outside production, and needs no other flag', () => {
    expect(consultDeterministicMathOn({ CONSULT_DETERMINISTIC_MATH: '1' })).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes', '11']) expect(consultDeterministicMathOn({ CONSULT_DETERMINISTIC_MATH: v }), String(v)).toBe(false)
    expect(consultDeterministicMathOn({ CONSULT_DETERMINISTIC_MATH: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(consultDeterministicMathOn({ CONSULT_DETERMINISTIC_MATH: '1', NODE_ENV: 'production' })).toBe(false)
  })
  it('consultTools: with math every area gets calculate and nothing else changes; with no area nothing is offered', () => {
    for (const d of ['food', 'spa', 'entertainment', 'shopping', 'travel'] as const) {
      const off = consultTools([d])
      expect(consultTools([d], { math: true }).sort()).toEqual([...new Set([...off, 'calculate'])].sort())
    }
    expect(consultTools([], { math: true })).toEqual([])
    expect(consultTools(['food'], { math: true, toolByNeed: true }).sort()).toEqual(['calculate', 'search_places', 'web_search'])
  })
})

describe('Wave 3 · W2 CONSULT_TOOL_BY_NEED', () => {
  const G = { CONSULT_SEARCH_NOW_INTENT_GATE: '1' }
  it('ON only for the exact value "1" together with the search-now gate, outside production', () => {
    expect(consultToolByNeedOn({ ...G, CONSULT_TOOL_BY_NEED: '1' })).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes', '11']) expect(consultToolByNeedOn({ ...G, CONSULT_TOOL_BY_NEED: v }), String(v)).toBe(false)
    for (const g of [undefined, '0', 'true', ' 1']) expect(consultToolByNeedOn({ CONSULT_SEARCH_NOW_INTENT_GATE: g, CONSULT_TOOL_BY_NEED: '1' }), String(g)).toBe(false)
    expect(consultToolByNeedOn({ ...G, CONSULT_TOOL_BY_NEED: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(consultToolByNeedOn({ ...G, CONSULT_TOOL_BY_NEED: '1', NODE_ENV: 'production' })).toBe(false)
  })
  it('mirrors the gate it needs (same truth table as the launcher\'s INERT rule)', () => {
    for (const g of [undefined, '1']) for (const k of [undefined, '1']) {
      const env = { CONSULT_SEARCH_NOW_INTENT_GATE: g, CONSULT_TOOL_BY_NEED: k }
      expect(consultToolByNeedOn(env)).toBe(consultSearchNowIntentGateOn(env) && k === '1')
    }
  })
  it('consultTools: with toolByNeed every area gets web_search and nothing else changes; without it the sets are the old ones', () => {
    for (const d of ['food', 'spa', 'entertainment', 'shopping', 'travel'] as const) {
      const off = consultTools([d])
      expect(off).toEqual([...DOMAIN_TOOLS[d]])
      expect(consultTools([d], { toolByNeed: true }).sort()).toEqual([...new Set([...off, 'web_search'])].sort())
    }
    expect(consultTools([], { toolByNeed: true })).toEqual([]) // no area: not a lean consult turn, nothing is offered
    expect(consultTools(['food', 'travel'], { toolByNeed: true }).filter(t => t === 'web_search').length).toBe(1)
  })
})
