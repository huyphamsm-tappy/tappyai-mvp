// A trip plan downloaded as the designed page must not say "research note" (owner 19/11: the first real plan PDF read "TAPPYAI RESEARCH / INTELLIGENCE").
import { describe, it, expect } from 'vitest'
import { reportPdfDesigned } from './reportPdfDesign'

const text = '# Trip\n\nfacts\n\n## Day 1\n\n- **09:00 - Cafe** - sit\n\n## Tips\n\n- book ahead\n'
const cover = (labels?: { line: string; note: string; footerBrand: string }) => ({
  eyebrow: 'Trip plan', title: 'Trip', facts: ['1 day'], kind: 'Trip plan', updated: 'Updated', sources: 0, sourcesWord: '',
  words: { scope: 'Scope', caveats: 'Caveats', sources: 'Sources', footer: 'Updated' }, ...(labels ? { labels } : {}),
})

describe('designed page brand labels', () => {
  it('a cover with its own labels replaces the research wording everywhere', () => {
    const doc = JSON.stringify(reportPdfDesigned(text, [], { cover: cover({ line: 'TAPPYAI / TRAVEL', note: 'TRIP PLAN', footerBrand: 'TAPPYAI TRAVEL' }) } as never))
    expect(doc).toContain('TAPPYAI / TRAVEL')
    expect(doc).toContain('TRIP PLAN')
    expect(doc).not.toContain('RESEARCH')
    expect(doc).not.toContain('INTELLIGENCE')
  })
  it('without labels the research report keeps its own wording', () => {
    const doc = JSON.stringify(reportPdfDesigned(text, [], { cover: cover() } as never))
    expect(doc).toContain('RESEARCH')
  })
})
