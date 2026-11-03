import { describe, it, expect } from 'vitest'
import { notesModel, DEEP_RESEARCH_NOTES_MODEL_FLAG as FLAG } from './deepResearchDeps'

// 03/11 (owner: "giữ Luna làm bộ não ... dùng 1k Anthropic vào dự án để giảm chi phí"): the step that reads the pages and writes the findings is
// invisible to the reader (structured notes), so it can be served by Claude Haiku 5.5 without touching the voice or the layout, which stay Luna's.
describe('the research notes model (03/11)', () => {
  it('is Luna unless the variable says haiku55 AND the Anthropic key is present', () => {
    expect(notesModel({}, true)).toBe('luna')
    expect(notesModel({ [FLAG]: 'haiku55' }, false)).toBe('luna')
    expect(notesModel({ [FLAG]: 'haiku55' }, true)).toBe('haiku55')
    for (const v of ['sonnet55', 'Haiku55', '1', 'true', '']) expect(notesModel({ [FLAG]: v }, true)).toBe('luna')
  })
  it('stays Luna in a production runtime; the owner opens it by name in CONSULT_PRODUCTION_ALLOW', () => {
    for (const prod of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }]) {
      expect(notesModel({ ...prod, [FLAG]: 'haiku55' }, true)).toBe('luna')
      expect(notesModel({ ...prod, [FLAG]: 'haiku55', CONSULT_PRODUCTION_ALLOW: FLAG }, true)).toBe('haiku55')
    }
  })
  it('the flag is independent of the writer flag', () => {
    expect(notesModel({ DEEP_RESEARCH_WRITER_MODEL: 'haiku55' }, true)).toBe('luna')
  })
})
