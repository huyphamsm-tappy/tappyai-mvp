import { describe, it, expect } from 'vitest'
import { capHedges } from './hedgeCap'

// Owner decision 2026-09-19: at most two hedges per prose; beyond that, ONE merged sentence.
describe('capHedges', () => {
  const pick = 'Mình chọn **Asanoha** — 4.7⭐ (659 đánh giá), cách bạn 0.4km.'
  it('leaves one or two hedges untouched', () => {
    const t = `${pick}\n\nMình chưa thấy bằng chứng về phòng riêng ở các quán này — nên gọi hỏi trước khi đi.\n\nKết quả chưa có mức giá, nên mình chưa khẳng định được có vừa ngân sách không.`
    const r = capHedges(t, { lang: 'vi', pickNames: ['Asanoha'] })
    expect(r.text).toBe(t)
    expect(r).toMatchObject({ hedges: 2, merged: 0 })
  })
  it('merges three hedges into one sentence that keeps every subject', () => {
    const t = `${pick}\n\nQuán chưa có thông tin rõ về phòng riêng cho 8 người.\n\nMình chưa thấy bằng chứng về chỗ đậu xe ở các quán này — nên gọi hỏi trước khi đi.\n\nKết quả chưa có mức giá, nên mình chưa khẳng định được có vừa ngân sách không.\n\n[CTA_BUTTONS]x[/CTA_BUTTONS]`
    const r = capHedges(t, { lang: 'vi', pickNames: ['Asanoha'] })
    expect(r).toMatchObject({ hedges: 3, merged: 2 })
    const hedgeLines = r.text.split('\n').filter(l => /chưa/.test(l))
    expect(hedgeLines).toHaveLength(1)
    expect(hedgeLines[0]).toMatch(/^Mình chưa xác nhận được phòng riêng cho 8 người; chỗ đậu xe; /)
    expect(hedgeLines[0]).toMatch(/mức giá/)
    expect(hedgeLines[0]).toMatch(/nên gọi hỏi trước khi đi\.$/)
    // The pick and the machine block are untouched.
    expect(r.text.startsWith(pick)).toBe(true)
    expect(r.text).toContain('[CTA_BUTTONS]x[/CTA_BUTTONS]')
  })
  it('a hedge inside the pick sentence is not counted', () => {
    const t = `Mình chọn **Asanoha** dù chưa thấy bằng chứng yên tĩnh.\n\nChưa rõ có phòng riêng.\n\nChưa rõ có đậu xe.`
    const r = capHedges(t, { lang: 'vi', pickNames: ['Asanoha'] })
    expect(r).toMatchObject({ hedges: 2, merged: 0 })
    expect(r.text).toBe(t)
  })
  it('english', () => {
    const t = `I pick **Asanoha**.\n\nI found no evidence about a private room.\n\nI could not confirm parking.\n\nI cannot confirm the price fits.`
    const r = capHedges(t, { lang: 'en', pickNames: ['Asanoha'] })
    expect(r.merged).toBe(2)
    expect(r.text.split('\n').filter(l => /confirm|evidence/.test(l))).toHaveLength(1)
    expect(r.text).toMatch(/I could not confirm a private room; /)
  })
})
