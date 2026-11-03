import { describe, it, expect } from 'vitest'
import { writerEffort, writerModel, DEEP_RESEARCH_WRITER_EFFORT_FLAG as FLAG, DEEP_RESEARCH_WRITER_MODEL_FLAG as MODEL_FLAG } from './deepResearchDeps'

describe('the report writer\'s model (03/11)', () => {
  it('is Luna unless the variable says haiku55 AND the Anthropic key is present', () => {
    expect(writerModel({}, true)).toBe('luna')
    expect(writerModel({ [MODEL_FLAG]: 'haiku55' }, false)).toBe('luna')
    expect(writerModel({ [MODEL_FLAG]: 'haiku55' }, true)).toBe('haiku55')
    for (const v of ['sonnet55', 'Haiku55', '1', 'true', '']) expect(writerModel({ [MODEL_FLAG]: v }, true)).toBe('luna')
  })
  it('stays Luna in a production runtime; the owner opens it by name in CONSULT_PRODUCTION_ALLOW', () => {
    for (const prod of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }]) {
      expect(writerModel({ ...prod, [MODEL_FLAG]: 'haiku55' }, true)).toBe('luna')
      expect(writerModel({ ...prod, [MODEL_FLAG]: 'haiku55', CONSULT_PRODUCTION_ALLOW: MODEL_FLAG }, true)).toBe('haiku55')
    }
  })
})

describe('the report writer\'s thinking effort (03/11)', () => {
  it('is medium unless the variable says low or high', () => {
    expect(writerEffort({})).toBe('medium')
    expect(writerEffort({ [FLAG]: 'high' })).toBe('high')
    expect(writerEffort({ [FLAG]: 'low' })).toBe('low')
    for (const v of ['medium', 'xhigh', 'HIGH', 'none', '1', '']) expect(writerEffort({ [FLAG]: v })).toBe('medium')
  })
  it('stays medium in a production runtime; the owner opens it by name in CONSULT_PRODUCTION_ALLOW', () => {
    for (const prod of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }]) {
      expect(writerEffort({ ...prod, [FLAG]: 'high' })).toBe('medium')
      expect(writerEffort({ ...prod, [FLAG]: 'high', CONSULT_PRODUCTION_ALLOW: FLAG })).toBe('high')
    }
  })
})
