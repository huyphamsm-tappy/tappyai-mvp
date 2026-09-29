import { describe, it, expect } from 'vitest'
import { stripStepNarration } from './stepNarration'

describe('stripStepNarration (R9)', () => {
  it('removes the measured web + Android narration', () => {
    const web = 'Để lập kế hoạch chi tiết, mình cần tìm khách sạn và quán ăn. Chờ một chút nhé! 🏖️ Bây giờ mình sẽ lập kế hoạch cho bạn.\n\n**Tóm tắt chuyến**\nBa ngày ở biển.'
    const out = stripStepNarration(web)
    expect(out.text).toBe('**Tóm tắt chuyến**\nBa ngày ở biển.')
    expect(out.removed).toBe(3)
  })
  it('removes replay forms', () => {
    expect(stripStepNarration('Đang tìm nhà hàng hải sản, khách sạn và thời tiết Đà Nẵng...\n\n[TAPPY_PLAN]{}[/TAPPY_PLAN]').text).toBe('[TAPPY_PLAN]{}[/TAPPY_PLAN]')
    expect(stripStepNarration('Mình gọi tool để tìm khách sạn ngay.\nNội dung.').text).toBe('Nội dung.')
    expect(stripStepNarration('Tuyệt vời! Mình đã tìm được đủ thông tin.\nNội dung.').text).toBe('Nội dung.')
  })
  it('keeps sentences that carry content, and plain advice', () => {
    const keep = 'Mình chọn **M Hotel** vì sát biển. Đang mùa mưa nên mang áo mưa. Mình sẽ tìm thêm nếu bạn muốn đổi khu? '
    expect(stripStepNarration('**Mình chọn: M Hotel** — 4,8⭐.').removed).toBe(0)
    expect(stripStepNarration('Tháng 10 là mùa mưa, mang áo mưa.').removed).toBe(0)
    expect(stripStepNarration(keep).text).toContain('**M Hotel**')
  })
})

describe('R9 form seen in replay 29/09', () => {
  it('"Gọi tool tìm nhà hàng…" without a subject', () => {
    expect(stripStepNarration('Gọi tool tìm nhà hàng, thời tiết và xác nhận giá phòng...\n\n**Tóm tắt chuyến**').text).toBe('**Tóm tắt chuyến**')
  })
})
