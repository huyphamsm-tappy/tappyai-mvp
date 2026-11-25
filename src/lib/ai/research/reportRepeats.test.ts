import { describe, it, expect } from 'vitest'
import { repeatedFigures, TIGHT_WRITE_RULE } from './reportRepeats'
import { researchTightWriteOn } from './deepResearchState'

// Measured 11/11 (two real reports each, 12 reports): the same figures are written again in the summary, the section and the caveats. This counts how many of a report's figures turn up on three or more
// different lines, so a change to the writer can be judged by a number.

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchTightWriteOn({})).toBe(false)
    expect(researchTightWriteOn({ RESEARCH_TIGHT_WRITE: '1' })).toBe(true)
    expect(researchTightWriteOn({ RESEARCH_TIGHT_WRITE: 'on' })).toBe(false)
    expect(researchTightWriteOn({ RESEARCH_TIGHT_WRITE: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchTightWriteOn({ RESEARCH_TIGHT_WRITE: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_TIGHT_WRITE' })).toBe(true)
  })
})

describe('repeatedFigures', () => {
  it('counts a figure written on three or more different lines, not one written twice', () => {
    const r = repeatedFigures('Tóm tắt: 12.500 tỷ đồng.\nMục 1: thị trường 12.500 tỷ đồng.\nMục 2: nền 12.500 tỷ đồng.\nGiá 35.000 đồng.\nGiá 35.000 đồng lần hai.')
    expect(r.distinct).toBe(2)
    expect(r.repeated).toBe(1)
    expect(r.share).toBe(50)
  })
  it('the same figure twice on ONE line is one line', () => {
    expect(repeatedFigures('12.500 và 12.500 và 12.500\nkhác').repeated).toBe(0)
  })
  it('ignores citation marks, years, numbers shorter than four characters and the sources list', () => {
    const text = 'a [1234] 2025\nb [1234] 2025 99 100\nc [1234] 2025 99 100\n## Nguồn\n12.500\n12.500\n12.500'
    const r = repeatedFigures(text)
    expect(r.distinct).toBe(0)
    expect(r.repeated).toBe(0)
  })
  it('an empty report is nothing, not a division by zero', () => {
    expect(repeatedFigures('')).toEqual({ distinct: 0, repeated: 0, share: 0 })
  })
})

describe('the writing rule', () => {
  it('says to state each figure once, to keep the summary to headline figures, and to point to a section instead of restating a disagreement', () => {
    expect(TIGHT_WRITE_RULE).toContain('once')
    expect(TIGHT_WRITE_RULE).toMatch(/summary/i)
    expect(TIGHT_WRITE_RULE).toMatch(/caveat/i)
  })
})
