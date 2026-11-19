// Final UAT 19/11: "... a basket. > In short: ..." showed the raw ">" in the middle of a paragraph.
import { describe, it, expect } from 'vitest'
import { splitGluedQuote, repairGluedMarkdown } from './markdownNormalize'

describe('splitGluedQuote', () => {
  it('a quote glued to the end of a sentence becomes a paragraph of its own', () => {
    expect(splitGluedQuote('Prices rose a lot. > In short: it costs more.')).toBe('Prices rose a lot.\n\n> In short: it costs more.')
  })
  it('a quote on its own line, a table row, a fence and a comparison inside a sentence are left alone', () => {
    expect(splitGluedQuote('> already a quote. > still one')).toBe('> already a quote. > still one')
    expect(splitGluedQuote('| a. > b | c |')).toBe('| a. > b | c |')
    expect(splitGluedQuote('```\nx. > y\n```')).toBe('```\nx. > y\n```')
    expect(splitGluedQuote('when x > 3 the rule applies')).toBe('when x > 3 the rule applies')
  })
  it('runs inside repairGluedMarkdown and is idempotent', () => {
    const once = repairGluedMarkdown('A. > B')
    expect(once).toBe('A.\n\n> B')
    expect(repairGluedMarkdown(once)).toBe(once)
  })
})
