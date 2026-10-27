import { describe, it, expect } from 'vitest'
import { knowledgeDepth, finalSynthesisReserveReached, FINAL_SYNTHESIS_RESERVED_STEPS, capabilityLimits } from './consultFlags'

/** How many tool rounds the guard lets run in a turn of `maxSteps` steps: the stepsFinished values (0 ..) at which a tool call is NOT answered by "search budget used". */
const roundsAllowed = (maxSteps: number): number => { let n = 0; for (let sf = 0; sf < maxSteps; sf++) if (!finalSynthesisReserveReached(sf, maxSteps)) n++; return n }

describe('finalSynthesisReserveReached (the guard the route uses)', () => {
  it('the reserve is the last two steps; step 0 is never refused', () => {
    expect(FINAL_SYNTHESIS_RESERVED_STEPS).toBe(2)
    expect([0, 1, 2, 3, 4].map(sf => finalSynthesisReserveReached(sf, 5))).toEqual([false, false, false, true, true])
    expect([0, 1, 2, 3, 4, 5].map(sf => finalSynthesisReserveReached(sf, 6))).toEqual([false, false, false, false, true, true])
    expect(finalSynthesisReserveReached(0, 1)).toBe(false); expect(finalSynthesisReserveReached(0, 2)).toBe(false)
  })
  it('measured B2 27/10 (E18, E22, X2): at five steps the fourth lookup (stepsFinished 3) is refused; three run', () => {
    expect(finalSynthesisReserveReached(3, 5)).toBe(true)
    expect(roundsAllowed(5)).toBe(3)
  })
})

describe('knowledgeDepth (C-PRE-3) - lookups by level', () => {
  const at = (level?: string, extra: Record<string, string> = {}) => knowledgeDepth({ ...(level === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: level }), ...extra })
  it('unset, L0, L1: the previous five steps (three lookups); L2, L3: six (four); L4: eight (six)', () => {
    expect(at()).toEqual({ steps: 5, toolRounds: 3 })
    expect(at('0')).toEqual({ steps: 5, toolRounds: 3 })
    expect(at('1')).toEqual({ steps: 5, toolRounds: 3 })
    expect(at('2')).toEqual({ steps: 6, toolRounds: 4 })
    expect(at('3')).toEqual({ steps: 6, toolRounds: 4 })
    expect(at('4')).toEqual({ steps: 8, toolRounds: 6 })
  })
  it('toolRounds is exactly what the guard lets through, for every level (not a second copy of the arithmetic)', () => {
    for (const l of ['0', '1', '2', '3', '4']) { const d = at(l); expect(roundsAllowed(d.steps), l).toBe(d.toolRounds) }
  })
  it('an invalid level and a production runtime read as level 0', () => {
    for (const bad of ['5', '01', 'L3', ' 3', '3 ', '']) expect(at(bad), JSON.stringify(bad)).toEqual({ steps: 5, toolRounds: 3 })
    expect(at('4', { VERCEL_ENV: 'production' })).toEqual({ steps: 5, toolRounds: 3 })
    expect(at('4', { NODE_ENV: 'production' })).toEqual({ steps: 5, toolRounds: 3 })
  })
  it('never deeper than the research loop itself (the same step budget as capabilityLimits at L2+), and never above the hard eight', () => {
    for (const l of ['2', '3', '4']) { const env = { CONSULT_CAPABILITY_LEVEL: l }; expect(knowledgeDepth(env).steps).toBe(capabilityLimits(env).researchSteps) }
    expect(at('4').steps).toBeLessThanOrEqual(8)
  })
})
