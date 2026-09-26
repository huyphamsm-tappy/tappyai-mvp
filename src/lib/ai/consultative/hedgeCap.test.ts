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
    expect(hedgeLines[0]).toMatch(/^Mình chưa xác nhận được phòng riêng, chỗ đậu xe và mức giá — nên gọi hỏi trước khi đi\.$/)
    expect(hedgeLines[0]).toMatch(/nên gọi hỏi trước khi đi\.$/)
    // The pick and the machine block are untouched.
    expect(r.text.startsWith(pick)).toBe(true)
    expect(r.text).toContain('[CTA_BUTTONS]x[/CTA_BUTTONS]')
  })
  // Measured smoke 2026-09-19 (F8): the model's own "Tuy nhiên, kết quả chưa xác nhận rõ phòng riêng ở các
  // quán, nên mình sẽ gợi ý…" was stitched into the merged sentence. A hedge the reader cannot parse
  // stays as written; the readable ones still merge.
  it('an unreadable hedge is left as written, never stitched into the merged sentence', () => {
    const t = `${pick}

Mình chưa xác nhận được phòng riêng.

Kết quả chưa có mức giá, nên mình chưa khẳng định được có vừa ngân sách không.

Tuy nhiên, kết quả chưa xác nhận rõ phòng riêng ở các quán, nên mình sẽ gợi ý những nơi phù hợp nhất rồi bạn liên hệ xác nhận.`
    const r = capHedges(t, { lang: 'vi', pickNames: ['Asanoha'] })
    expect(r.hedges).toBe(3)
    // "xác nhận rõ phòng riêng" IS readable now → all three merge into one sentence.
    expect(r.merged).toBe(2)
    expect(r.unmergeable).toBe(0)
    expect(r.text).toContain('Mình chưa xác nhận được phòng riêng và mức giá — nên gọi hỏi trước khi đi.')
    expect(r.text).not.toContain('Tuy nhiên')
    const t2 = `${pick}

Chưa rõ có phòng riêng.

Mình chưa chắc lắm đâu nhé.

Mình chưa thấy bằng chứng về đậu xe.`
    const r2 = capHedges(t2, { lang: 'vi', pickNames: ['Asanoha'] })
    expect(r2.unmergeable).toBe(1)
    expect(r2.text).toContain('Mình chưa chắc lắm đâu nhé.')
    expect(r2.text).toContain('Mình chưa xác nhận được phòng riêng và đậu xe — nên gọi hỏi trước khi đi.')
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
    expect(r.text).toMatch(/I could not confirm a private room, parking and the price fits — worth a call before you go\./)
  })
})
