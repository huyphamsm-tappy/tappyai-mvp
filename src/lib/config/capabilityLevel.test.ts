import { describe, it, expect } from 'vitest'
import {
  CAPABILITY_FLAG_LEVELS, CONSULT_CAPABILITY_LEVEL_FLAG, capabilityFlags, capabilityLevel, capabilityLimits,
  consultDeterministicMathOn, consultResearchLoopOn, consultStructuredSynthesisOn, consultToolByNeedOn,
} from './consultFlags'

const GATE = { CONSULT_SEARCH_NOW_INTENT_GATE: '1' }
const lv = (v: string | undefined, extra: Record<string, string | undefined> = {}) => ({ ...(v === undefined ? {} : { [CONSULT_CAPABILITY_LEVEL_FLAG]: v }), ...extra })

describe('Wave 3 · W6 capability level', () => {
  it('only the single characters 0-4 are a level; everything else is level 0', () => {
    for (const v of ['0', '1', '2', '3', '4']) expect(capabilityLevel(lv(v))).toBe(Number(v))
    for (const v of [undefined, '', '5', '9', '-1', '01', '10', ' 2', '2 ', 'L2', 'two', '1.0', '٣', '２', 'true', 'on']) expect(capabilityLevel(lv(v)), JSON.stringify(v)).toBe(0)
  })
  it('a production runtime is level 0 whatever the variable says', () => {
    for (const p of [{ VERCEL_ENV: 'production' }, { NODE_ENV: 'production' }]) {
      expect(capabilityLevel(lv('4', p))).toBe(0)
      expect(consultDeterministicMathOn(lv('4', { ...GATE, ...p }))).toBe(false)
      expect(consultToolByNeedOn(lv('4', { ...GATE, ...p }))).toBe(false)
      expect(consultResearchLoopOn(lv('4', p))).toBe(false)
      expect(consultStructuredSynthesisOn(lv('4', p))).toBe(false)
      expect(capabilityLimits(lv('4', p))).toEqual({ researchSteps: 6, researchMaxReads: 4, structuredMaxTokens: 3500 })
    }
  })
  it('the table: L1 = W2 + W4, L2 = + W1, L3 = + W3 (W2 needs the search-now gate), L0 = nothing', () => {
    const expected: Record<number, { toolByNeed: boolean; math: boolean; research: boolean; synth: boolean }> = {
      0: { toolByNeed: false, math: false, research: false, synth: false },
      1: { toolByNeed: true, math: true, research: false, synth: false },
      2: { toolByNeed: true, math: true, research: true, synth: false },
      3: { toolByNeed: true, math: true, research: true, synth: true },
      4: { toolByNeed: true, math: true, research: true, synth: true },
    }
    for (const l of [0, 1, 2, 3, 4]) {
      const env = lv(String(l), GATE)
      expect({ toolByNeed: consultToolByNeedOn(env), math: consultDeterministicMathOn(env), research: consultResearchLoopOn(env), synth: consultStructuredSynthesisOn(env) }, `L${l}`).toEqual(expected[l])
      const f = capabilityFlags(env)
      expect(f.level).toBe(l)
      expect([f.toolByNeed, f.deterministicMath, f.researchLoop, f.structuredSynthesis]).toEqual([expected[l]!.toolByNeed, expected[l]!.math, expected[l]!.research, expected[l]!.synth])
    }
    expect(CAPABILITY_FLAG_LEVELS).toEqual({ CONSULT_TOOL_BY_NEED: 1, CONSULT_DETERMINISTIC_MATH: 1, CONSULT_RESEARCH_LOOP: 2, CONSULT_STRUCTURED_SYNTHESIS: 3, CONSULT_KNOWLEDGE_PATH: 2, CONSULT_PICK_TURN_TOOLS: 2 })
  })
  it('W2 is inert at every level without the search-now gate; the others do not need it', () => {
    for (const l of ['1', '2', '3', '4']) {
      expect(consultToolByNeedOn(lv(l))).toBe(false)
      expect(consultToolByNeedOn(lv(l, { CONSULT_SEARCH_NOW_INTENT_GATE: '0' }))).toBe(false)
      expect(consultDeterministicMathOn(lv(l))).toBe(true)
    }
  })
  it('a Wave 3 flag that is SET decides for itself: "1" on, any other value off, even when the level would switch it on or leave it off', () => {
    for (const v of ['0', 'true', 'on', ' 1', '1 ', '', 'no']) {
      expect(consultResearchLoopOn(lv('4', { CONSULT_RESEARCH_LOOP: v })), JSON.stringify(v)).toBe(false)
      expect(consultStructuredSynthesisOn(lv('3', { CONSULT_STRUCTURED_SYNTHESIS: v })), JSON.stringify(v)).toBe(false)
      expect(consultDeterministicMathOn(lv('1', { CONSULT_DETERMINISTIC_MATH: v })), JSON.stringify(v)).toBe(false)
      expect(consultToolByNeedOn(lv('1', { ...GATE, CONSULT_TOOL_BY_NEED: v })), JSON.stringify(v)).toBe(false)
    }
    // "1" switches a capability on below its level
    expect(consultResearchLoopOn(lv('0', { CONSULT_RESEARCH_LOOP: '1' }))).toBe(true)
    expect(consultStructuredSynthesisOn(lv('1', { CONSULT_STRUCTURED_SYNTHESIS: '1' }))).toBe(true)
    expect(consultResearchLoopOn(lv(undefined, { CONSULT_RESEARCH_LOOP: '1' }))).toBe(true)
    // the other flags are untouched by one explicit "0"
    expect(consultDeterministicMathOn(lv('3', { CONSULT_RESEARCH_LOOP: '0' }))).toBe(true)
    expect(consultStructuredSynthesisOn(lv('3', { CONSULT_RESEARCH_LOOP: '0' }))).toBe(true)
  })
  it('an invalid level never switches anything on', () => {
    for (const v of ['5', '01', 'L3', ' 3', '3 ', 'three']) {
      const env = lv(v, GATE)
      expect([consultToolByNeedOn(env), consultDeterministicMathOn(env), consultResearchLoopOn(env), consultStructuredSynthesisOn(env)], JSON.stringify(v)).toEqual([false, false, false, false])
    }
  })
  it('the limits: only L4 deepens the loop; below it they are the Wave 3 defaults', () => {
    for (const l of ['0', '1', '2', '3']) expect(capabilityLimits(lv(l))).toEqual({ researchSteps: 6, researchMaxReads: 4, structuredMaxTokens: 3500 })
    expect(capabilityLimits(lv('4'))).toEqual({ researchSteps: 8, researchMaxReads: 6, structuredMaxTokens: 4000 })
    expect(capabilityLimits(lv('4')).structuredMaxTokens).toBeLessThanOrEqual(4000) // the hard per-call ceiling is never exceeded
    expect(capabilityLimits({})).toEqual({ researchSteps: 6, researchMaxReads: 4, structuredMaxTokens: 3500 })
  })
  it('independent truth table: every level x every flag value x the gate agrees with the written rule', () => {
    const levels = [undefined, '0', '1', '2', '3', '4', '7', 'x']
    const values = [undefined, '0', '1', 'true']
    for (const l of levels) for (const g of [undefined, '1']) for (const w of values) {
      const env = lv(l, { CONSULT_SEARCH_NOW_INTENT_GATE: g, CONSULT_TOOL_BY_NEED: w, CONSULT_RESEARCH_LOOP: w })
      const level = l !== undefined && /^[0-4]$/.test(l) ? Number(l) : 0
      const byValue = (min: number) => (w !== undefined ? w === '1' : level >= min)
      expect(consultToolByNeedOn(env), `${l}/${g}/${w}`).toBe(byValue(1) && g === '1')
      expect(consultResearchLoopOn(env), `${l}/${g}/${w}`).toBe(byValue(2))
    }
  })
})
