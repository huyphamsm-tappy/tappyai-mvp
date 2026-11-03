import { describe, it, expect } from 'vitest'
import { writerEffort, DEEP_RESEARCH_WRITER_EFFORT_FLAG as FLAG } from './deepResearchDeps'

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
