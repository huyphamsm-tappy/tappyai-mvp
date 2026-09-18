import { describe, it, expect } from 'vitest'
import { compactHistory, compactOldAssistant, MAX_OLD_ASSISTANT_CHARS, VERBATIM_TAIL } from './historyCompaction'

// Cost optimization item 6: older assistant replies shrink to their decision sentence + the
// venues they bolded; the last exchange and every user turn stay verbatim.

const LONG = 'Mình chọn **Hải Sản Hoàng Gia** cho bữa tối vì 4.7⭐ từ 961 đánh giá.\n\n' +
  'Nếu muốn gần hơn, **Quán Bụi - Lê Thánh Tôn** cách 0.7km, **4.5⭐ (1.188 đánh giá)**, giá 200-600k/người. '.repeat(6) +
  '\n\nBạn muốn đặt bàn không?'

describe('compactOldAssistant', () => {
  it('keeps the first paragraph and the bolded venue names, drops bolded numbers, caps the length', () => {
    const out = compactOldAssistant(LONG)
    expect(out.length).toBeLessThan(LONG.length / 3)
    expect(out).toContain('Mình chọn **Hải Sản Hoàng Gia**')
    expect(out).toContain('(đã gợi ý: **Hải Sản Hoàng Gia**, **Quán Bụi - Lê Thánh Tôn**)')
    expect(out).not.toContain('1.188 đánh giá**)')
  })
  it('a short reply is untouched', () => {
    expect(compactOldAssistant('Ok.')).toBe('Ok.')
    expect(compactOldAssistant('x'.repeat(MAX_OLD_ASSISTANT_CHARS))).toBe('x'.repeat(MAX_OLD_ASSISTANT_CHARS))
  })
})

describe('compactHistory', () => {
  it('compacts only assistant messages outside the verbatim tail; user turns never change', () => {
    const msgs = [
      { role: 'user', content: 'u1' }, { role: 'assistant', content: LONG },
      { role: 'user', content: 'u2' }, { role: 'assistant', content: LONG },
      { role: 'user', content: 'u3' },
    ]
    const out = compactHistory(msgs)
    expect(out[1].content).not.toBe(LONG)
    expect(out.slice(-VERBATIM_TAIL).map(m => m.content)).toEqual(msgs.slice(-VERBATIM_TAIL).map(m => m.content))
    expect(out[0]).toEqual(msgs[0]); expect(out[2]).toEqual(msgs[2])
  })
})
