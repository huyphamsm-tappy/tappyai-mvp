import { describe, it, expect } from 'vitest'
import { guardTravelClaimsInText } from './travelGuard'

// 12/11 self-UAT, "Find me a hotel near Hoi An Ancient Town under 60 USD": the label "(estimate, not verified)" was written three times in two lines.
// Rule now: amounts of ONE KIND in ONE LINE (same currency words, same unit word after them) share one label, after the first; amounts of a different kind keep their own; nothing goes unlabelled.
const EN = { lang: 'en', availability: 'counted' as const, money: 'annotate' as const, schedule: 'label' as const, notice: false }
const VI = { ...EN, lang: 'vi' }
const run = (s: string, o = EN) => guardTravelClaimsInText(s, [], 'Find me a hotel near Hoi An Ancient Town under 60 USD', o).text
const count = (s: string, tag: string) => s.split(tag).length - 1
const TAG = '(estimate, not verified)'

describe('unverified price label is not repeated for the same kind of amount in a line', () => {
  it('the UAT answer: three per-night amounts over two lines -> one label per line, none lost', () => {
    const uat = 'Hotel A is from US$28.87 per night, a good fit near the old town.\nHotel B costs US$54.52/night and US$49.00 per night for a standard room.'
    const out = run(uat)
    const lines = out.split('\n')
    expect(count(out, TAG)).toBe(2)
    expect(count(lines[0], TAG)).toBe(1)
    expect(count(lines[1], TAG)).toBe(1)
    expect(lines[0]).toContain('US$28.87 (estimate, not verified) per night')
    expect(lines[1]).toContain('US$54.52 (estimate, not verified)/night')
  })
  it('the two-line sentence of the UAT: "from US$28.87 per night ... US$54.52/night" carries the label once', () => {
    const out = run('Rooms run from US$28.87 per night, and the best-rated one is US$54.52/night.')
    expect(count(out, TAG)).toBe(1)
    expect(out).toContain('US$28.87 (estimate, not verified) per night')
  })
  it('honesty kept: amounts of a different kind in the same line each keep their label', () => {
    const out = run('Breakfast is US$5 per person and the room is US$40 per night.')
    expect(count(out, TAG)).toBe(2)
  })
  it('honesty kept: every line with an unbacked amount is labelled; a line with none is not', () => {
    const out = run('Line one US$30 per night.\nLine two has no price.\nLine three US$40 per night.')
    expect(count(out, TAG)).toBe(2)
    expect(out.split('\n')[1]).not.toContain(TAG)
  })
  it('already labelled text is not labelled again (idempotent)', () => {
    const once = run('Rooms from US$28.87 per night and US$54.52/night.')
    expect(run(once)).toBe(once)
  })
  it('Vietnamese label follows the same rule; different kinds keep theirs', () => {
    expect(count(run('Phòng từ 700.000đ/đêm đến 1.200.000đ/đêm.', VI), '(ước tính, chưa xác minh)')).toBe(1)
    expect(count(run('Ăn uống 2,1 triệu, thuê xe 700.000 đồng.', VI), '(ước tính, chưa xác minh)')).toBe(2)
  })
})
