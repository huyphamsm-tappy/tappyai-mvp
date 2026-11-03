import { describe, it, expect, afterEach, vi } from 'vitest'
import { DEEP_RESEARCH_LEAN_FLAGS, deepResearchLeanOn, leanValue, type DeepResearchLeanKey } from './deepResearchLean'
import { normalisePlan, pageTextLimit, DEEP_RESEARCH_LIMITS, GAP_STEPS, PAGE_TEXT_LIMIT } from './deepResearch'

const KEYS = Object.keys(DEEP_RESEARCH_LEAN_FLAGS) as DeepResearchLeanKey[]

describe('Deep Research cost experiments (03/11)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('every flag is OFF unless exactly "1"', () => {
    for (const k of KEYS) {
      const name = DEEP_RESEARCH_LEAN_FLAGS[k]
      expect(deepResearchLeanOn(k, {})).toBe(false)
      for (const v of ['0', 'true', 'on', ' 1', '1 ', '']) expect(deepResearchLeanOn(k, { [name]: v })).toBe(false)
      expect(deepResearchLeanOn(k, { [name]: '1' })).toBe(true)
    }
  })

  it('one flag changes only its own value', () => {
    const env = { [DEEP_RESEARCH_LEAN_FLAGS.queries]: '1' }
    expect(leanValue('queries', 3, 2, env)).toBe(2)
    for (const k of KEYS.filter(x => x !== 'queries')) expect(leanValue(k, 'normal', 'lean', env)).toBe('normal')
  })

  it('is locked OFF in a production runtime, even set to "1"; the owner opens it by name in CONSULT_PRODUCTION_ALLOW', () => {
    for (const k of KEYS) {
      const name = DEEP_RESEARCH_LEAN_FLAGS[k]
      for (const prod of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }]) {
        expect(deepResearchLeanOn(k, { ...prod, [name]: '1' })).toBe(false)
        expect(deepResearchLeanOn(k, { ...prod, [name]: '1', CONSULT_PRODUCTION_ALLOW: name })).toBe(true)
      }
    }
  })

  it('OFF: the limits the code has today', () => {
    const p = normalisePlan({ title: 't', steps: Array.from({ length: 12 }, (_, i) => ({ title: `s${i}`, queries: ['a', 'b', 'c', 'd'] })) }, 'q')
    expect(p?.steps).toHaveLength(DEEP_RESEARCH_LIMITS.planSteps)
    expect(p?.steps[0].queries).toHaveLength(DEEP_RESEARCH_LIMITS.queriesPerStep)
    expect(pageTextLimit()).toBe(PAGE_TEXT_LIMIT)
    expect(GAP_STEPS).toBe(4)
  })

  it('ON (localhost): 8 steps, 2 queries each, pages cut at 6000', () => {
    vi.stubEnv(DEEP_RESEARCH_LEAN_FLAGS.planSteps, '1')
    vi.stubEnv(DEEP_RESEARCH_LEAN_FLAGS.queries, '1')
    vi.stubEnv(DEEP_RESEARCH_LEAN_FLAGS.page, '1')
    const p = normalisePlan({ title: 't', steps: Array.from({ length: 12 }, (_, i) => ({ title: `s${i}`, queries: ['a', 'b', 'c', 'd'] })) }, 'q')
    expect(p?.steps).toHaveLength(8)
    expect(p?.steps[0].queries).toEqual(['a', 'b'])
    expect(pageTextLimit()).toBe(6000)
  })
})
