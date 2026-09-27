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

// Session C follow-up (owner, 2026-09-22): a venue the constraint filter kept with NO provider
// band must never be presented as within budget — the model wrote "Quán Bụi nằm trong tầm giá"
// about a row that carried no price at all.
describe('a fit phrase about an UNPRICED venue is unsupported', () => {
  const unpriced = ['Quán Bụi - Lê Thánh Tôn - Authentic Vietnamese Cuisine', 'Hàng Dương Quán | Quán ăn ngon Quận 1']
  it('loses the fit clause, keeps the venue and its other facts', () => {
    const t = 'Mình chọn **Quán Bụi** cho bạn, nằm trong tầm giá, cách bạn 0.5km và đang mở cửa.'
    const out = guardBudgetFitInText(t, UNDER_100K, { unpricedNames: unpriced })
    expect(out.redacted).toBe(1)
    expect(out.text).not.toContain('nằm trong tầm giá')
    expect(out.text).toContain('**Quán Bụi**')
    expect(out.text).toContain('0.5km')
  })
  it('a fit phrase about a venue that HAS a band is judged by the band, as before', () => {
    const t = 'Mình chọn **Cơm Tấm Cali** cho bạn, rất hợp ngân sách.'
    expect(guardBudgetFitInText(t, UNDER_100K, { unpricedNames: unpriced }).redacted).toBe(0)
  })
  it('the head of a "| tagline" name is enough to recognise the venue', () => {
    const t = 'Hàng Dương Quán rất hợp túi tiền.'
    expect(guardBudgetFitInText(t, UNDER_100K, { unpricedNames: unpriced }).text).not.toContain('hợp túi tiền')
  })
})

// ── UAT4 P1-d (2026-09-27): golden G3a lost the picked café's name ────────────────────────────
import { readFileSync as _read } from 'node:fs'
describe('UAT4 G3a: cut only the false fit, never the pick', () => {
  const g3a = JSON.parse(_read('docs/uat/evidence/golden/uat4-golden/G3a.json', 'utf8'))
  const raw = (g3a.turns[0].preGuard as string).replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/g, '')
  const out = guardBudgetFitInText(raw, { min: 0, max: 50_000, type: 'under' }).text

  it('the picked café keeps its sentence and its name', () => {
    expect(out).toContain('**Little Cam Saigon (Trần Quốc Thảo)**')
    expect(out).toContain('giá tham khảo dưới 100k')
  })
  it('only the false fit phrase goes', () => {
    expect(out).not.toMatch(/phù hợp ngân sách của bạn/)
  })
  it('the honest "none confirmed under 50k" sentence and the search lead-in stay', () => {
    expect(out).toContain('chưa tìm được quán nào được xác nhận nằm trong tầm dưới 50k')
    expect(out).toContain('Mình tìm các quán cà phê yên tĩnh ở Quận 3 trong tầm giá dưới 50k')
  })
})
