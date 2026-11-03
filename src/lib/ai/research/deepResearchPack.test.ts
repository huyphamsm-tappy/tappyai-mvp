import { describe, it, expect } from 'vitest'
import { packFindingsForGapCheck, GAP_FINDINGS_BUDGET } from './deepResearch'

const f = (step: number, text: string, figure = false) => ({ step, text, ...(figure ? { figure: { series: 's', label: 'l', value: 1, unit: 'u' } } : {}) })
const laidOut = (lines: string[]) => lines.map(l => `- ${l}`).join('\n')

describe('packFindingsForGapCheck (03/11: the gap check no longer sees only the first steps)', () => {
  it('every step with findings is in the pack, even when the early steps alone would fill the budget', () => {
    const findings = [
      ...Array.from({ length: 200 }, (_, i) => f(1, `early step finding ${i} ${'x'.repeat(200)}`)),
      ...Array.from({ length: 200 }, (_, i) => f(2, `second step finding ${i} ${'y'.repeat(200)}`)),
      ...Array.from({ length: 20 }, (_, i) => f(9, `late step finding ${i} ${'z'.repeat(200)}`)),
    ]
    // what the gap check was given before: the findings in order, cut at the budget - only step 1
    const before = laidOut(findings.map(x => x.text)).slice(0, GAP_FINDINGS_BUDGET)
    expect(before).not.toContain('late step')
    const pack = packFindingsForGapCheck(findings)
    for (const s of [1, 2, 9]) expect(pack.some(l => l.startsWith(`[S${s}] `))).toBe(true)
  })

  it('never exceeds the budget as the gap check lays it out', () => {
    const findings = Array.from({ length: 500 }, (_, i) => f((i % 13) + 1, `finding ${i} ${'w'.repeat(i % 300)}`))
    for (const budget of [500, 5_000, 30_000]) expect(laidOut(packFindingsForGapCheck(findings, budget)).length).toBeLessThanOrEqual(budget)
  })

  it('a short step gives its unused share to the longer ones', () => {
    const findings = [f(1, 'only one short finding'), ...Array.from({ length: 100 }, (_, i) => f(2, `long step finding ${i} ${'a'.repeat(100)}`))]
    const pack = packFindingsForGapCheck(findings, 3_000)
    expect(pack.filter(l => l.startsWith('[S1] '))).toHaveLength(1)
    expect(laidOut(pack).length).toBeGreaterThan(2_500)
  })

  it('inside a step a finding with a figure comes before one without, the step\'s own order otherwise kept', () => {
    const pack = packFindingsForGapCheck([f(1, 'no figure A'), f(1, 'figure B', true), f(1, 'no figure C'), f(1, 'figure D', true)])
    expect(pack).toEqual(['[S1] figure B', '[S1] figure D', '[S1] no figure A', '[S1] no figure C'])
  })

  it('keeps everything when it all fits, and is deterministic', () => {
    const findings = [f(2, 'b'), f(1, 'a'), f(2, 'c', true)]
    const pack = packFindingsForGapCheck(findings)
    expect(pack).toHaveLength(3)
    expect(packFindingsForGapCheck(findings)).toEqual(pack)
  })

  it('an empty input is an empty pack', () => {
    expect(packFindingsForGapCheck([])).toEqual([])
  })
})
