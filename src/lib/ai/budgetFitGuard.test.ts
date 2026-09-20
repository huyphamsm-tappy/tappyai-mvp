import { describe, it, expect } from 'vitest'
import { guardBudgetFitInText, bandOverclaims } from './budgetFitGuard'

// E1 (2026-09-20): P2 budget-band overclaim, measured on the 2026-09-19 gate (B1, B8, F7b, E6).
const UNDER_100K = { min: 0, max: 100000, type: 'under' as const }
const AROUND_150K = { min: 120000, max: 180000, type: 'around' as const }

describe('bandOverclaims', () => {
  it('a band starting at the ceiling of "dưới 100k" overclaims; one starting under it does not', () => {
    expect(bandOverclaims({ lo: 100000, hi: 200000 }, UNDER_100K)).toBe(true)
    expect(bandOverclaims({ lo: 100000, hi: 600000 }, UNDER_100K)).toBe(true)
    expect(bandOverclaims({ lo: 50000, hi: 100000 }, UNDER_100K)).toBe(false)
  })
  it('"tầm 150k" widens to 120–180k: 100–200k fits, 200–500k does not', () => {
    expect(bandOverclaims({ lo: 100000, hi: 200000 }, AROUND_150K)).toBe(false)
    expect(bandOverclaims({ lo: 200000, hi: 500000 }, AROUND_150K)).toBe(true)
  })
})

describe('guardBudgetFitInText', () => {
  it('B1: removes the fit clause, keeps the band and the rest (proportional)', () => {
    const t = 'Mình chọn **Béo Ơi Quán** — 4.6⭐ (1.200 đánh giá), mức giá 100-200k/người, vừa vặn ngân sách của bạn.'
    const out = guardBudgetFitInText(t, UNDER_100K)
    expect(out.redacted).toBe(1)
    expect(out.text).toBe('Mình chọn **Béo Ơi Quán** — 4.6⭐ (1.200 đánh giá), mức giá 100-200k/người.')
  })
  it('B8: "100–600k/người nằm trong tầm" — the fit and the band share a clause, so the clause goes', () => {
    const t = 'Quán Bụi Central có giá 100–600k/người nằm trong tầm, không gian đẹp.'
    const out = guardBudgetFitInText(t, UNDER_100K)
    expect(out.text).not.toContain('nằm trong tầm')
    expect(out.text).toContain('không gian đẹp')
  })
  it('a band that really fits is untouched; no budget ⇒ identity; no fit phrase ⇒ identity', () => {
    const fits = 'Mức giá 100-200k/người vừa vặn với budget 150k của bạn.'
    expect(guardBudgetFitInText(fits, AROUND_150K).text).toBe(fits)
    const over = 'Mức giá 100-200k/người vừa vặn ngân sách.'
    expect(guardBudgetFitInText(over, null).text).toBe(over)
    const noFit = 'Mức giá 100-200k/người.'
    expect(guardBudgetFitInText(noFit, UNDER_100K).text).toBe(noFit)
  })
  it('English wording', () => {
    const t = 'Prices run 100-200k per person, which fits your budget nicely.'
    const out = guardBudgetFitInText(t, UNDER_100K)
    expect(out.text).toBe('Prices run 100-200k per person.')
  })
})
