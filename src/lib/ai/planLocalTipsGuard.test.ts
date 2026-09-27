import { describe, it, expect } from 'vitest'
import { guardPlanLocalTips, tipRejection, namedVenues, MAX_LOCAL_TIPS } from './planLocalTipsGuard'

const plan = (tips: unknown) => ({
  type: 'trip',
  title: 'Quy Nhơn 3N2Đ',
  days: [{ label: 'Ngày 1', items: [
    { time: '07:00', emoji: '🍜', category: 'food', name: 'Bánh xèo tôm nhảy Bà Đệ', price: 'chưa có giá' },
    { time: '16:00', emoji: '🏖️', category: 'entertainment', name: 'Eo Gió', price: 'chưa có giá' },
  ] }],
  local_tips: tips,
})
const wrap = (p: unknown) => `Kế hoạch đây!\n[TAPPY_PLAN]\n${JSON.stringify(p)}\n[/TAPPY_PLAN]\nChúc vui!`
const retrieved = ['Bánh xèo tôm nhảy Bà Đệ', 'Eo Gió', 'Kỳ Co']
const parse = (text: string) => JSON.parse(text.slice(text.indexOf('[TAPPY_PLAN]') + 12, text.indexOf('[/TAPPY_PLAN]')))

describe('guardPlanLocalTips', () => {
  it('keeps a tip tied to a retrieved stop and a flagged general tip', () => {
    const tips = [
      { text: 'Gọi bánh xèo tôm nhảy ăn kèm rau sống và nước chấm ớt xanh.', basis: 'tool', place: 'Bánh xèo tôm nhảy Bà Đệ' },
      { text: 'Đi Eo Gió lúc chiều muộn để ngắm hoàng hôn, mang theo nước.', basis: 'tool', place: 'Eo Gió' },
      { text: 'Buổi trưa nắng gắt, nên để các điểm ngoài trời vào sáng sớm hoặc chiều.', basis: 'general' },
    ]
    const r = guardPlanLocalTips(wrap(plan(tips)), retrieved)
    expect(r.kept).toBe(3)
    expect(r.dropped).toBe(0)
    expect(parse(r.text).local_tips).toEqual(tips)
    expect(r.text.startsWith('Kế hoạch đây!\n')).toBe(true)
    expect(r.text.endsWith('\nChúc vui!')).toBe(true)
  })

  it('drops an invented venue, a price, an hour, a showtime and a stop that is not in the plan', () => {
    const tips = [
      { text: 'Ghé quán Bà Ba trong hẻm gần chợ, bánh căn ở đó rất đáng thử.', basis: 'general' }, // invented venue
      { text: 'Bánh xèo ở đây chỉ khoảng 30k một đĩa, rất rẻ.', basis: 'tool', place: 'Bánh xèo tôm nhảy Bà Đệ' }, // price
      { text: 'Quán mở cửa từ sáng sớm nên đi sớm cho đỡ đông.', basis: 'tool', place: 'Bánh xèo tôm nhảy Bà Đệ' }, // hours claim
      { text: 'Rạp gần đó vẫn còn vé suất chiếu tối cho cuối tuần.', basis: 'general' }, // tickets
      { text: 'Đi cano ra Kỳ Co buổi sáng khi biển êm hơn.', basis: 'tool', place: 'Kỳ Co' }, // retrieved, not a stop
      { text: 'Ăn ở Hải sản Năm Tý là chuẩn vị địa phương nhất.', basis: 'tool', place: 'Hải sản Năm Tý' }, // never retrieved
      { text: 'Tip không có basis thì không được hiển thị.' },
      { text: 'Hải sản ở đây tươi sống nhất vào buổi tối, nên đặt trước.', basis: 'tool', place: 'Bánh xèo tôm nhảy Bà Đệ' }, // superlative (measured)
    ]
    const r = guardPlanLocalTips(wrap(plan(tips)), retrieved)
    expect(r.kept).toBe(0)
    expect(r.dropped).toBe(tips.length)
    expect(r.reasons).toEqual(['venue', 'number', 'fact', 'fact', 'place', 'place', 'basis', 'fact'])
    // Nothing left ⇒ no section at all.
    expect('local_tips' in parse(r.text)).toBe(false)
  })

  it('a tool tip may name its own stop but not another venue', () => {
    const stops = ['banh xeo tom nhay ba de']
    const set = new Set(stops)
    expect(tipRejection({ text: 'Ở quán Bánh xèo tôm nhảy Bà Đệ nên gọi thêm bánh căn.', basis: 'tool', place: 'Bánh xèo tôm nhảy Bà Đệ' }, stops, set)).toBeNull()
    expect(tipRejection({ text: 'Ăn xong ghé tiệm Chè Xanh bên cạnh để tráng miệng.', basis: 'tool', place: 'Bánh xèo tôm nhảy Bà Đệ' }, stops, set)).toBe('venue')
  })

  it('does not confuse words that fold together (giá/gia, quán/quận, sạp/sắp)', () => {
    expect(tipRejection({ text: 'Đi cùng gia đình thì chọn buổi sáng, trẻ nhỏ đỡ mệt hơn.', basis: 'general' }, [], new Set())).toBeNull()
    expect(tipRejection({ text: 'Ở quận Ninh Kiều nên đi bộ dọc bến vào buổi tối cho mát.', basis: 'general' }, [], new Set())).toBeNull()
    // "tốt nhất" (best TIME to go) is advice, not a quality claim about a venue.
    expect(tipRejection({ text: 'Cầu Vàng tốt nhất đi vào buổi chiều để chụp ảnh đẹp.', basis: 'general' }, [], new Set())).toBeNull()
    expect(tipRejection({ text: 'Sắp Tết thì biển đông khách, nên đặt chỗ ở sớm.', basis: 'general' }, [], new Set())).toBeNull()
    expect(namedVenues('ghé sạp Cô Lan ở chợ')).toEqual(['co lan'])
  })

  it(`caps at ${MAX_LOCAL_TIPS}`, () => {
    const tip = { text: 'Mang theo áo khoác mỏng vì tối gió biển khá lạnh.', basis: 'general' }
    const r = guardPlanLocalTips(wrap(plan(Array(6).fill(tip))), retrieved)
    expect(r.kept).toBe(MAX_LOCAL_TIPS)
    expect(r.reasons).toEqual(['cap', 'cap'])
  })

  it('leaves a plan without tips, a malformed block and plain text untouched', () => {
    const noTips = wrap({ ...plan([]), local_tips: undefined })
    expect(guardPlanLocalTips(noTips, retrieved).text).toBe(noTips)
    const broken = 'x [TAPPY_PLAN]{not json[/TAPPY_PLAN]'
    expect(guardPlanLocalTips(broken, retrieved).text).toBe(broken)
    expect(guardPlanLocalTips('no plan here', retrieved).text).toBe('no plan here')
  })

  it('a non-array local_tips is removed', () => {
    const r = guardPlanLocalTips(wrap(plan('ăn hải sản đi')), retrieved)
    expect('local_tips' in parse(r.text)).toBe(false)
    expect(r.dropped).toBe(1)
  })
})
