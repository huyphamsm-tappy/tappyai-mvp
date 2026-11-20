import { describe, it, expect } from 'vitest'
import { tierTurnFor, researchAdvancedOn, standardTurnFor } from './researchTurn'
import { ADVANCED_RUN_BOUNDS, ADVANCED_BOUNDS } from './researchController'
import { STANDARD_RUN_BOUNDS } from './researchAdmission'
import { claudeCallCost, SONNET55_MODEL_ID, HAIKU55_MODEL_ID } from '@/lib/ai/llm/providers/claude'
import { withThinkingDisabled } from '@/lib/ai/llm/providers/anthropicTransport'

const BOTH = { RESEARCH_ADMISSION: '1', RESEARCH_ADVANCED: '1' }
const ADV_MSG = 'Dự báo doanh thu trà sữa Việt Nam 3 năm tới và phân tích độ nhạy'
const STD_MSG = 'Viết báo cáo về trà sữa ở Hà Nội'

describe('the Advanced flag', () => {
  it('needs RESEARCH_ADMISSION too, is off by default and locked in production unless the owner lists it', () => {
    expect(researchAdvancedOn({})).toBe(false)
    expect(researchAdvancedOn({ RESEARCH_ADVANCED: '1' })).toBe(false)
    expect(researchAdvancedOn(BOTH)).toBe(true)
    expect(researchAdvancedOn({ ...BOTH, VERCEL_ENV: 'production' })).toBe(false)
    expect(researchAdvancedOn({ ...BOTH, VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_ADMISSION,RESEARCH_ADVANCED' })).toBe(true)
  })
})

describe('tierTurnFor', () => {
  it('an Advanced request gets the Advanced bounds only when its own flag is on; otherwise null (existing engine)', () => {
    expect(tierTurnFor(ADV_MSG, { env: { RESEARCH_ADMISSION: '1' }, claudeAvailable: true })).toBeNull()
    const p = tierTurnFor(ADV_MSG, { env: BOTH, claudeAvailable: true })!
    expect(p.tier).toBe('ADVANCED_RESEARCH_REPORT'); expect(p.bounds).toEqual(ADVANCED_RUN_BOUNDS); expect(p.decision.triggers).toContain('QUANTITATIVE_ANALYSIS')
  })
  it('a Standard request is still Standard with both flags on; no Claude means no tier at all', () => {
    expect(tierTurnFor(STD_MSG, { env: BOTH, claudeAvailable: true })!.bounds).toEqual(STANDARD_RUN_BOUNDS)
    expect(tierTurnFor(ADV_MSG, { env: BOTH, claudeAvailable: false })).toBeNull()
  })
  it('standardTurnFor never returns an Advanced plan', () => {
    expect(standardTurnFor(ADV_MSG, { env: BOTH, claudeAvailable: true })).toBeNull()
    expect(standardTurnFor(STD_MSG, { env: BOTH, claudeAvailable: true })).not.toBeNull()
  })
})

describe('Advanced bounds', () => {
  it('up to the Controller gap-round cap, with the report checked against the question parts', () => {
    expect(ADVANCED_RUN_BOUNDS.gapRounds).toBe(ADVANCED_BOUNDS.maxGapRounds)
    expect(ADVANCED_RUN_BOUNDS.repairParts).toBe(true)
  })
})

describe('Sonnet 5.5 request shape (measured against the API 10/11/2026: it 400s on thinking "disabled" and on temperature)', () => {
  it('sampling settings are removed and NO thinking field is added; Haiku keeps its disabled field', () => {
    // model ids come from the provider file: the architecture guard allows a Claude model id nowhere else
    const body = JSON.stringify({ model: SONNET55_MODEL_ID, max_tokens: 5, temperature: 0, top_p: 0.9, top_k: 5 })
    expect(JSON.parse(withThinkingDisabled(body, SONNET55_MODEL_ID) as string)).toEqual({ model: SONNET55_MODEL_ID, max_tokens: 5 })
    const haiku = JSON.stringify({ model: HAIKU55_MODEL_ID, max_tokens: 5, temperature: 0 })
    expect(JSON.parse(withThinkingDisabled(haiku, HAIKU55_MODEL_ID) as string)).toEqual({ model: HAIKU55_MODEL_ID, max_tokens: 5, thinking: { type: 'disabled' } })
  })
})

describe('Sonnet 5.5 and a forced tool choice (measured 11/11/2026: 400 "type tool and any are not supported for this model")', () => {
  const forced = (system: unknown) => JSON.stringify({ model: SONNET55_MODEL_ID, max_tokens: 9, tools: [{ name: 'tappy_research_plan', input_schema: { type: 'object' } }], tool_choice: { type: 'tool', name: 'tappy_research_plan' }, ...(system === undefined ? {} : { system }) })
  it('the forced choice is dropped and the instruction to answer through the tool moves into the system prompt (string, block list, or none)', () => {
    for (const sys of ['Be brief.', [{ type: 'text', text: 'Be brief.' }], undefined]) {
      const out = JSON.parse(withThinkingDisabled(forced(sys), SONNET55_MODEL_ID) as string)
      expect(out.tool_choice).toBeUndefined(); expect(out.thinking).toBeUndefined(); expect(out.tools).toHaveLength(1)
      const blocks = out.system as Array<{ type: string; text: string }>
      expect(blocks.at(-1)!.text).toContain('tappy_research_plan')
      if (sys) expect(blocks[0].text).toBe('Be brief.')
    }
  })
  it('an automatic tool choice is left alone, and Haiku keeps its forced choice untouched', () => {
    const auto = JSON.stringify({ model: SONNET55_MODEL_ID, tool_choice: { type: 'auto' }, tools: [] })
    expect(JSON.parse(withThinkingDisabled(auto, SONNET55_MODEL_ID) as string).tool_choice).toEqual({ type: 'auto' })
    const haiku = JSON.stringify({ model: HAIKU55_MODEL_ID, tool_choice: { type: 'tool', name: 'x' }, tools: [{ name: 'x' }] })
    expect(JSON.parse(withThinkingDisabled(haiku, HAIKU55_MODEL_ID) as string).tool_choice).toEqual({ type: 'tool', name: 'x' })
  })
})

describe('Sonnet 5.5 pricing row', () => {
  it('prices one call at the list card: $2 in, $2.50 cache write, $0.10 cache read, $10 out per million, one tier at any length', () => {
    const c = claudeCallCost(SONNET55_MODEL_ID, { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 })!
    expect(c.usd).toBe(2)
    expect(claudeCallCost(SONNET55_MODEL_ID, { input: 0, cacheRead: 1_000_000, cacheWrite: 0, output: 0 })!.usd).toBe(0.1)
    expect(claudeCallCost(SONNET55_MODEL_ID, { input: 0, cacheRead: 0, cacheWrite: 1_000_000, output: 0 })!.usd).toBe(2.5)
    expect(claudeCallCost(SONNET55_MODEL_ID, { input: 0, cacheRead: 0, cacheWrite: 0, output: 1_000_000 })!.usd).toBe(10)
    expect(claudeCallCost(SONNET55_MODEL_ID, { input: 500_000, cacheRead: 0, cacheWrite: 0, output: 0 })!.usd).toBe(1)
  })
})
