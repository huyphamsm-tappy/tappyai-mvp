// Wave 2I - the two new behaviour flags: exactly "1", never in a production runtime, and (B) never without the search-now gate.
import { describe, it, expect } from 'vitest'
import { consultAbortAbandonedFirstPartOn, consultKnowledgeTurnToolsOn, CONSULT_ABORT_ABANDONED_FIRST_PART_FLAG, CONSULT_KNOWLEDGE_TURN_TOOLS_FLAG } from './consultFlags'

const OFF_VALUES = [undefined, '', '0', 'true', 'on', ' 1', '1 ', '01', 'yes']

describe('CONSULT_ABORT_ABANDONED_FIRST_PART', () => {
  it('is named as the owner asked', () => { expect(CONSULT_ABORT_ABANDONED_FIRST_PART_FLAG).toBe('CONSULT_ABORT_ABANDONED_FIRST_PART') })
  it('is ON only for the exact value "1"', () => {
    expect(consultAbortAbandonedFirstPartOn({ CONSULT_ABORT_ABANDONED_FIRST_PART: '1' })).toBe(true)
    for (const v of OFF_VALUES) expect(consultAbortAbandonedFirstPartOn({ CONSULT_ABORT_ABANDONED_FIRST_PART: v })).toBe(false)
    expect(consultAbortAbandonedFirstPartOn({})).toBe(false)
  })
  it('is OFF in a production runtime even when "1"', () => {
    expect(consultAbortAbandonedFirstPartOn({ CONSULT_ABORT_ABANDONED_FIRST_PART: '1', NODE_ENV: 'production' })).toBe(false)
    expect(consultAbortAbandonedFirstPartOn({ CONSULT_ABORT_ABANDONED_FIRST_PART: '1', VERCEL_ENV: 'production' })).toBe(false)
  })
})

describe('CONSULT_KNOWLEDGE_TURN_TOOLS', () => {
  const gate = { CONSULT_SEARCH_NOW_INTENT_GATE: '1' }
  it('is named as the owner asked', () => { expect(CONSULT_KNOWLEDGE_TURN_TOOLS_FLAG).toBe('CONSULT_KNOWLEDGE_TURN_TOOLS') })
  it('is ON only for the exact value "1" AND with the search-now gate on', () => {
    expect(consultKnowledgeTurnToolsOn({ ...gate, CONSULT_KNOWLEDGE_TURN_TOOLS: '1' })).toBe(true)
    for (const v of OFF_VALUES) expect(consultKnowledgeTurnToolsOn({ ...gate, CONSULT_KNOWLEDGE_TURN_TOOLS: v })).toBe(false)
  })
  it('is OFF without the gate (unset, "0", "true"), whatever its own value', () => {
    for (const g of [undefined, '0', 'true', ' 1']) expect(consultKnowledgeTurnToolsOn({ CONSULT_SEARCH_NOW_INTENT_GATE: g, CONSULT_KNOWLEDGE_TURN_TOOLS: '1' })).toBe(false)
  })
  it('is OFF in a production runtime even when both are "1"', () => {
    expect(consultKnowledgeTurnToolsOn({ ...gate, CONSULT_KNOWLEDGE_TURN_TOOLS: '1', NODE_ENV: 'production' })).toBe(false)
    expect(consultKnowledgeTurnToolsOn({ ...gate, CONSULT_KNOWLEDGE_TURN_TOOLS: '1', VERCEL_ENV: 'production' })).toBe(false)
  })
})
