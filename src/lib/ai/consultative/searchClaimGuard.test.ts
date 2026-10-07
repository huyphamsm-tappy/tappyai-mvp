import { describe, it, expect } from 'vitest'
import { guardSearchClaims } from './searchClaimGuard'

// Consultative V1 §3 — a claim of having searched / checked on a turn that ran
// no tool is removed. With a tool call (or a named re-search) nothing is touched.

describe('guardSearchClaims', () => {
  it('removes a first-person past-tense search/check claim on a no-tool turn', () => {
    const r = guardSearchClaims('Mình đã kiểm tra lại, quán mở đến 22h. Bạn nên đi sớm.', { madeToolCall: false })
    expect(r.removed).toBe(1)
    expect(r.text).toBe('Bạn nên đi sớm.')
  })
  it('folded / English variants', () => {
    expect(guardSearchClaims('minh vua tim lai roi, gia khoang 80k. Con lai giu nguyen.', { madeToolCall: false }).text).toBe('Con lai giu nguyen.')
    expect(guardSearchClaims("I've just checked and it is open. Enjoy!", { madeToolCall: false }).text).toBe('Enjoy!')
    expect(guardSearchClaims('Theo kết quả tìm kiếm mới nhất thì quán đã đóng. Bạn thử chỗ khác nhé.', { madeToolCall: false }).text).toBe('Bạn thử chỗ khác nhé.')
  })
  it('an offer, a request to the user, and a recommendation are not claims', () => {
    const keep = [
      'Để mình kiểm tra giúp bạn nhé?',
      'Bạn kiểm tra lại giờ mở trước khi đi.',
      'Mình không tìm thấy giờ mở của quán này.',
      'Mình nghĩ quán đầu tiên hợp hơn.',
    ]
    for (const s of keep) expect(guardSearchClaims(s, { madeToolCall: false }).text).toBe(s)
  })
  it('untouched when the turn made a tool call', () => {
    const s = 'Mình đã kiểm tra lại, quán mở đến 22h.'
    expect(guardSearchClaims(s, { madeToolCall: true })).toEqual({ text: s, removed: 0 })
  })
  it('machine blocks are never touched', () => {
    const s = 'Ok.\n\n[FOLLOWUPS] mình đã kiểm tra | b'
    expect(guardSearchClaims(s, { madeToolCall: false }).text).toBe(s)
  })
})
