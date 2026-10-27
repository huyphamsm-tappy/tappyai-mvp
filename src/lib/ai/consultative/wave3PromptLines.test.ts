import { describe, it, expect } from 'vitest'
import { wave3PromptLines } from './wave3PromptLines'
import { TOOL_BY_NEED_RULE, MATH_TOOL_RULE, STRUCTURED_SYNTHESIS_RULE } from './leanConsultPrompt'
import { RESEARCH_RULE } from './researchLoop'
import { consultKnowledgePathOn, consultPickTurnToolsOn, CAPABILITY_FLAG_LEVELS, CONSULT_KNOWLEDGE_PATH_FLAG, CONSULT_PICK_TURN_TOOLS_FLAG } from '@/lib/config/consultFlags'

/** The expression the route held at a58dd26 (route.ts, the lean `buildLean({ extra, tail })` call), copied verbatim as the reference. */
const OLD = (offeredToolNames: string[], structured: boolean, toolByNeed: boolean, deterministicMath: boolean, research: unknown) => ({
  extra: [...(toolByNeed && offeredToolNames.includes('web_search') ? [TOOL_BY_NEED_RULE] : []), ...(deterministicMath && offeredToolNames.includes('calculate') ? [MATH_TOOL_RULE] : []), ...(research && offeredToolNames.includes('read_page') ? [RESEARCH_RULE] : [])],
  tail: structured ? [STRUCTURED_SYNTHESIS_RULE] : [],
})

const NAMES = ['web_search', 'calculate', 'read_page', 'search_places']
const subsets = (xs: string[]): string[][] => xs.reduce<string[][]>((acc, x) => acc.concat(acc.map(s => [...s, x])), [[]])

describe('wave3PromptLines (C1) - byte-identical to the old inline expression', () => {
  it('every subset of tools x every combination of the four switches: the same arrays, the same strings', () => {
    let n = 0
    for (const offered of subsets(NAMES)) for (let m = 0; m < 16; m++) {
      const [structured, toolByNeed, math, research] = [1, 2, 4, 8].map(b => (m & b) !== 0)
      const got = wave3PromptLines({ offeredToolNames: offered, structured, toolByNeed, math, research })
      expect(JSON.stringify(got), JSON.stringify({ offered, m })).toBe(JSON.stringify(OLD(offered, structured, toolByNeed, math, research)))
      n++
    }
    expect(n).toBe(16 * 16)
  })
  it('a rule line needs BOTH its capability and its tool in the real tool set', () => {
    expect(wave3PromptLines({ offeredToolNames: [], structured: false, toolByNeed: true, math: true, research: true }).extra).toEqual([])
    expect(wave3PromptLines({ offeredToolNames: ['web_search', 'calculate', 'read_page'], structured: false, toolByNeed: false, math: false, research: false }).extra).toEqual([])
    expect(wave3PromptLines({ offeredToolNames: ['web_search', 'calculate', 'read_page'], structured: true, toolByNeed: true, math: true, research: true })).toEqual({ extra: [TOOL_BY_NEED_RULE, MATH_TOOL_RULE, RESEARCH_RULE], tail: [STRUCTURED_SYNTHESIS_RULE] })
  })
})

describe('the two Wave 4 path flags (C1)', () => {
  const both = [[CONSULT_KNOWLEDGE_PATH_FLAG, consultKnowledgePathOn], [CONSULT_PICK_TURN_TOOLS_FLAG, consultPickTurnToolsOn]] as const
  it('names and the level they follow (L2, not L1)', () => {
    expect(CONSULT_KNOWLEDGE_PATH_FLAG).toBe('CONSULT_KNOWLEDGE_PATH'); expect(CONSULT_PICK_TURN_TOOLS_FLAG).toBe('CONSULT_PICK_TURN_TOOLS')
    expect(CAPABILITY_FLAG_LEVELS[CONSULT_KNOWLEDGE_PATH_FLAG]).toBe(2); expect(CAPABILITY_FLAG_LEVELS[CONSULT_PICK_TURN_TOOLS_FLAG]).toBe(2)
  })
  for (const [name, on] of both) {
    it(`${name}: default OFF; exactly "1"; unset follows L2+; a set value wins over the level; never in production`, () => {
      expect(on({})).toBe(false)
      expect(on({ [name]: '1' })).toBe(true)
      for (const v of ['0', 'true', ' 1', '1 ', '01', '']) expect(on({ [name]: v }), JSON.stringify(v)).toBe(false)
      expect(['0', '1', '2', '3', '4'].map(l => on({ CONSULT_CAPABILITY_LEVEL: l }))).toEqual([false, false, true, true, true])
      expect(on({ CONSULT_CAPABILITY_LEVEL: '4', [name]: '0' })).toBe(false)
      expect(on({ CONSULT_CAPABILITY_LEVEL: '0', [name]: '1' })).toBe(true)
      for (const p of [{ VERCEL_ENV: 'production' }, { NODE_ENV: 'production' }]) {
        expect(on({ ...p, [name]: '1' })).toBe(false); expect(on({ ...p, CONSULT_CAPABILITY_LEVEL: '4' })).toBe(false)
      }
    })
  }
})
