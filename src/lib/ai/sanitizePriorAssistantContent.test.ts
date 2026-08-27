import { describe, it, expect } from 'vitest'
import { sanitizePriorAssistantContent } from './sanitizePriorAssistantContent'

// V2 highlighted regression: a contextual follow-up ("Giá cả thế nào?",
// "cụ thể hơn được không?", "chọn giúp tôi") must NOT re-render the same
// recommendation/image cards from the previous turn. On a tool-less follow-up,
// the stream filter runs bufferMode=false and forwards every text delta live
// without stripping the model's own enrichment. If prior assistant messages in
// the context still carry image markdown and [TAPPY_PLAN]/[CTA_BUTTONS]/
// [FOLLOWUPS] markers, the model can echo them and the client re-renders the
// same cards. This helper strips those decorations from prior assistant text
// BEFORE the LLM sees them.

describe('sanitizePriorAssistantContent', () => {
  it('strips [TAPPY_PLAN]…[/TAPPY_PLAN] blocks entirely', () => {
    const input = [
      'Đây là lịch trình Đà Nẵng của bạn:',
      '[TAPPY_PLAN]',
      '{"type":"trip","title":"Đà Nẵng","days":[{"label":"Ngày 1","items":[{"time":"18:00","name":"Hải Sản Mộc","category":"food"}]}]}',
      '[/TAPPY_PLAN]',
      'Ngon miệng nhé!',
    ].join('\n')
    const out = sanitizePriorAssistantContent(input)
    expect(out).not.toContain('[TAPPY_PLAN]')
    expect(out).not.toContain('[/TAPPY_PLAN]')
    expect(out).not.toContain('Hải Sản Mộc') // the JSON body is gone
    expect(out).toContain('Đây là lịch trình') // prose preserved
    expect(out).toContain('Ngon miệng nhé!')
  })

  it('strips [CTA_BUTTONS] both in closed and bare-tail form', () => {
    const closed = 'Xem thêm nhé: [CTA_BUTTONS]{"buttons":[{"label":"Đặt bàn","url":"https://x"}]}[/CTA_BUTTONS]\ncòn gì nữa?'
    expect(sanitizePriorAssistantContent(closed)).not.toContain('[CTA_BUTTONS]')
    expect(sanitizePriorAssistantContent(closed)).not.toContain('Đặt bàn')
    expect(sanitizePriorAssistantContent(closed)).toContain('Xem thêm nhé:')
    expect(sanitizePriorAssistantContent(closed)).toContain('còn gì nữa?')

    const bareTail = 'Chốt nhé.\n\n[CTA_BUTTONS]{"buttons":[{"label":"Đặt","url":"https://x"}]}'
    const out = sanitizePriorAssistantContent(bareTail)
    expect(out).not.toContain('[CTA_BUTTONS]')
    expect(out).toContain('Chốt nhé.')
  })

  it('strips [FOLLOWUPS] single-line block', () => {
    const input = 'Ăn ở đâu?\n[FOLLOWUPS]Giá cả thế nào?|Có giao tận nơi không?|Cho tôi 3 lựa chọn khác[/FOLLOWUPS]\n'
    const out = sanitizePriorAssistantContent(input)
    expect(out).not.toContain('[FOLLOWUPS]')
    expect(out).not.toContain('[/FOLLOWUPS]')
    expect(out).not.toContain('Giá cả thế nào?') // suggestion payload gone
    expect(out).toContain('Ăn ở đâu?')
  })

  it('strips [TAPPY_SHOPPING] block defensively (present on prod, absent on this branch)', () => {
    const input = 'Chọn Sony WH-1000XM5.\n[TAPPY_SHOPPING]{"decision":{"name":"WH-1000XM5"}}[/TAPPY_SHOPPING]\nĐặt hàng ở đâu?'
    const out = sanitizePriorAssistantContent(input)
    expect(out).not.toContain('[TAPPY_SHOPPING]')
    expect(out).not.toContain('WH-1000XM5"')
    expect(out).toContain('Chọn Sony WH-1000XM5.') // the prose reference stays
    expect(out).toContain('Đặt hàng ở đâu?')
  })

  it('strips markdown images (the injected place photos)', () => {
    const input = [
      '**Phở Gà Nguyệt**',
      '4.5⭐ · 5B Phủ Doãn',
      '![Ảnh địa điểm](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9Gc)',
      '![Ảnh địa điểm](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcB)',
      'Ngon lắm nhé.',
    ].join('\n')
    const out = sanitizePriorAssistantContent(input)
    expect(out).not.toContain('gstatic.com')
    expect(out).not.toContain('![')
    expect(out).toContain('**Phở Gà Nguyệt**')
    expect(out).toContain('4.5⭐')
    expect(out).toContain('Ngon lắm nhé.')
  })

  it('preserves prose that carries the facts a follow-up may reference', () => {
    // A "Giá cả thế nào?" follow-up must still have access to the price/rating
    // the previous turn wrote in prose. Only the system-owned decoration is
    // stripped, never the facts around it.
    const input = [
      '**Phở Gà Nguyệt**',
      '4.5⭐ (2,847 đánh giá) · 45.000đ/tô · 5B Phủ Doãn',
      '![Ảnh](https://x/1.jpg)',
      '[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]',
    ].join('\n')
    const out = sanitizePriorAssistantContent(input)
    expect(out).toContain('Phở Gà Nguyệt')
    expect(out).toContain('4.5⭐')
    expect(out).toContain('45.000đ/tô')
    expect(out).toContain('5B Phủ Doãn')
    expect(out).toContain('2,847 đánh giá')
  })

  it('is idempotent — running twice equals running once', () => {
    const input = [
      'Chốt Sony.',
      '[CTA_BUTTONS]{"buttons":[{"label":"Đặt","url":"https://x"}]}[/CTA_BUTTONS]',
      '![img](https://x/a.jpg)',
      '[FOLLOWUPS]a|b|c[/FOLLOWUPS]',
      '[TAPPY_PLAN]{"days":[]}[/TAPPY_PLAN]',
    ].join('\n')
    const once = sanitizePriorAssistantContent(input)
    const twice = sanitizePriorAssistantContent(once)
    expect(twice).toBe(once)
  })

  it('leaves clean content unchanged', () => {
    const input = 'Xin chào! Bạn muốn ăn gì hôm nay?'
    expect(sanitizePriorAssistantContent(input)).toBe(input)
  })

  it('handles empty and near-empty content', () => {
    expect(sanitizePriorAssistantContent('')).toBe('')
    expect(sanitizePriorAssistantContent(' ')).toBe(' ')
  })

  it('collapses the blank runs the removals leave behind', () => {
    // Three markers stacked with no prose between them must not leave three
    // blank lines that make the next prose look like a new section.
    const input = 'Trước.\n[TAPPY_PLAN]{"a":1}[/TAPPY_PLAN]\n[FOLLOWUPS]a[/FOLLOWUPS]\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]\nSau.'
    const out = sanitizePriorAssistantContent(input)
    expect(out).not.toMatch(/\n{3,}/)
    expect(out).toContain('Trước.')
    expect(out).toContain('Sau.')
  })
})
