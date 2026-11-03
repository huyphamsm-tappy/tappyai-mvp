// Deep Research: figures of one series and label that sources disagree on are handed to the writer as a conflict, not left to chance.
import { describe, it, expect } from 'vitest'
import { figureConflicts, writerNotes, type Finding } from './deepResearch'

const fig = (value: number, source: number, label = '2025', series = 'Doanh số VinFast', unit = 'xe'): Finding =>
  ({ step: 1, text: `${series} ${label}: ${value}`, source, figure: { series, label, value, unit } })

describe('figureConflicts', () => {
  it('flags the same series and label with different values from different sources', () => {
    const out = figureConflicts([fig(100_000, 1), fig(120_000, 2)])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('100000 [1] vs 120000 [2]')
  })

  it('ignores rounding-size gaps, one source repeating itself, other labels and findings without a figure', () => {
    expect(figureConflicts([fig(100_000, 1), fig(101_000, 2)])).toEqual([])
    expect(figureConflicts([fig(100_000, 1), fig(120_000, 1)])).toEqual([])
    expect(figureConflicts([fig(100_000, 1, '2024'), fig(120_000, 2, '2025')])).toEqual([])
    expect(figureConflicts([fig(100_000, 1), { step: 1, text: 'no figure', source: 2 }])).toEqual([])
  })

  it('matches series, label and unit case-insensitively', () => {
    expect(figureConflicts([fig(10, 1, 'Q1', 'Giá bán'), fig(20, 2, 'q1', 'giá bán')])).toHaveLength(1)
  })
})

describe('writerNotes with conflicts', () => {
  const plan = { title: 'T', steps: [{ title: 'Doanh số', queries: ['q'] }] }

  it('appends a conflicting-figures block only when there is a conflict', () => {
    expect(writerNotes(plan, [fig(100_000, 1)])).not.toContain('Conflicting figures')
    const notes = writerNotes(plan, [fig(100_000, 1), fig(120_000, 2)])
    expect(notes).toContain('## Conflicting figures')
    expect(notes).toContain('100000 [1] vs 120000 [2]')
  })
})
