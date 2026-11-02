// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { stripClosingInvite, isGenericInvite } from './closingInvite'

const BODY = 'Vũng Tàu hợp cho chuyến cuối tuần. Đi xe khoảng hai tiếng từ TP.HCM. Chiều ghé Bãi Sau.'

describe('stripClosingInvite', () => {
  it.each([
    'Nếu bạn thích mình có thể gợi ý thêm quán ăn.',
    'Nếu bạn muốn, mình có thể lập lịch chi tiết hơn.',
    'Bạn muốn mình tìm thêm khách sạn không?',
    'Cần mình đặt lịch giúp không?',
    'Mình có thể gợi ý thêm nếu bạn cần.',
    'Cứ nói mình biết nếu bạn cần chỉnh lại.',
  ])('drops: %s', last => {
    expect(stripClosingInvite(`${BODY} ${last}`)).toBe(BODY)
  })
  it('keeps a specific next step, a figure, a short reply, and a link', () => {
    for (const keep of ['Cho mình biết nơi xuất phát để chỉnh giờ xe nhé.', 'Nếu bạn muốn, mình có thể đặt xe lúc 7 giờ.', 'Xem giá tại [Trip.com](https://trip.com).']) {
      expect(stripClosingInvite(`${BODY} ${keep}`)).toBe(`${BODY} ${keep}`)
    }
    const short = 'Có. Nếu bạn thích mình có thể gợi ý thêm.'
    expect(stripClosingInvite(short)).toBe(short)
  })
  it('machine blocks after the prose are untouched', () => {
    const t = `${BODY} Nếu bạn thích mình có thể gợi ý thêm.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]`
    expect(stripClosingInvite(t)).toBe(`${BODY}\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]`)
  })
  it('an invitation in the middle of the reply is not touched', () => {
    const t = 'Nếu bạn thích mình có thể gợi ý thêm. Vũng Tàu hợp. Đi xe hai tiếng.'
    expect(stripClosingInvite(t)).toBe(t)
  })
  it('classifier', () => {
    expect(isGenericInvite('Bạn có muốn mình gợi ý thêm không?')).toBe(true)
    expect(isGenericInvite('Bạn đi mấy người?')).toBe(false)
  })
})
