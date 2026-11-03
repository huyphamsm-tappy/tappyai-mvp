// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { judgeText, withoutTodayDate } from './guardEvidence'
import { unverifiedFigureLine, withUnverifiedFigureLine } from './unverifiedFigure'

const ev = (passages: string[]) => ({ sources: [{ id: 'S1', host: 'vnexpress.net', sourceType: 'news' as never, passages }], conflicts: [], carried: [], constraintsSig: null, userText: 'Giá xăng RON 95-III hôm nay bao nhiêu một lít?' })
const PAGE = ['Giá xăng dầu mới nhất hôm nay 8/10', 'Xăng E10 RON 95-III được niêm yết ở 28.250 đồng/lít, tăng 120 đồng.']
const TODAY = { day: 11, month: 10, year: 2026 }
const verdict = (s: string, o = {}) => judgeText(s, ev(PAGE) as never, o)[0].j.verdict

describe('B4: system-clock date framing', () => {
  const framed = 'Tra cứu hôm nay (11/10), **xăng E10 RON 95-III** được niêm yết ở **28.250 đồng/lít** [S1].'
  it('without the option the unsourced date still makes the sentence UNKNOWN (flag off unchanged)', () => {
    expect(verdict(framed)).toBe('UNKNOWN')
  })
  it('today’s date is ignored, so a price the page states is SUPPORTED', () => {
    expect(verdict(framed, { today: TODAY })).toBe('SUPPORTED')
  })
  it('a price the page does NOT state is still not supported, even with today’s date', () => {
    expect(verdict('Tra cứu hôm nay (11/10), xăng E10 RON 95-III giá 29.999 đồng/lít [S1].', { today: TODAY })).not.toBe('SUPPORTED')
  })
  it('a date that is not today is still judged', () => {
    expect(verdict('Ngày 9/10, xăng E10 RON 95-III được niêm yết ở 28.250 đồng/lít [S1].', { today: TODAY })).not.toBe('SUPPORTED')
  })
  it('withoutTodayDate blanks only today’s date (with or without year) and keeps the rest', () => {
    expect(withoutTodayDate('hôm nay 11/10 và 8/10', TODAY)).toBe('hôm nay       và 8/10')
    expect(withoutTodayDate('ngày 11/10/2026', TODAY).trim()).toBe('ngày')
    expect(withoutTodayDate('ngày 11/10/2025', TODAY)).toBe('ngày 11/10/2025')
  })
})

describe('B4: one honest sentence when the guards cut every figure', () => {
  const draft = 'Xăng RON 95-III hôm nay là 28.250 đồng/lít [S1].'
  it('adds it when the draft had a price and the final text has none', () => {
    expect(unverifiedFigureLine(draft, 'Mình tra giúp bạn rồi nhé.', 'vi')).toMatch(/chưa xác minh được số này/)
  })
  it('does not add it when a figure survived', () => {
    expect(unverifiedFigureLine(draft, 'Xăng hôm nay 28.250 đồng/lít.', 'vi')).toBeNull()
  })
  it('does not add it when the draft had no figure, or the reply already admits non-verification', () => {
    expect(unverifiedFigureLine('Giá xăng thường điều chỉnh mỗi tuần.', 'Giá xăng thường điều chỉnh mỗi tuần.', 'vi')).toBeNull()
    expect(unverifiedFigureLine(draft, 'Mình chưa xác minh được giá này.', 'vi')).toBeNull()
  })
  it('puts the sentence before the machine blocks, once', () => {
    const r = withUnverifiedFigureLine(draft, 'Mình tra rồi.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]', 'vi')
    expect(r.added).toBe(true)
    expect(r.text).toBe('Mình tra rồi.\n\nMình chưa xác minh được số này từ nguồn đã đọc.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]')
    expect(withUnverifiedFigureLine(draft, r.text, 'vi').added).toBe(false)
  })
  it('an empty remainder becomes just the sentence', () => {
    expect(withUnverifiedFigureLine(draft, '', 'vi').text).toBe('Mình chưa xác minh được số này từ nguồn đã đọc.')
  })
})
