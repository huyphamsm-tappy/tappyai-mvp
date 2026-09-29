import { describe, it, expect } from 'vitest'
import { alternativeNames } from './criteria'

describe('alternativeNames — the pick\'s reasons are not alternatives (replay r25 FOOD-3 / ENT-2)', () => {
  it('counts the bold alternatives only, not "- Địa chỉ: …" / "- Giá: …" under the pick', () => {
    const text = [
      '**Mình chọn: Cửu Vân Quán ✅** vì:', '', '- Địa chỉ: 35 Nguyễn Cửu Vân', '- Giá: 100–700k/người', '- Mở cả ngày', '',
      'Hai lựa chọn khác:', '- **Nhà Của Piêu**: 4.9 sao', '- **QUÁN THUỲ LINH**: 100–400k/người', '',
    ].join('\n')
    expect(alternativeNames(text)).toEqual(['Nhà Của Piêu', 'QUÁN THUỲ LINH'])
  })
  it('plain alternatives after the header still count; bold labels do not', () => {
    const text = ['**Mình chọn: A**', '- **Giờ mở:** 10–22h', '- **Mở tới 22h**: tối muộn vẫn ghé', 'Hai lựa chọn khác:', '- Quán B: rẻ hơn', '- Quán C: gần hơn', '- Quán D: xa'].join('\n')
    expect(alternativeNames(text)).toEqual(['Quán B', 'Quán C', 'Quán D'])
  })
})

describe('flight turns (owner Q10, 29/09)', () => {
  it('passes a tracked Traveloka link with route, date and sub1; flags invented prices', async () => {
    const { flightShape } = await import('./criteria')
    const link = 'https://go.isclix.com/deep_link/6277265300509373567/6654251588167732819?url=' + encodeURIComponent('https://www.traveloka.com/vi-VN/flight/fullsearch?ap=SGN.HAN&dt=15-10-2026.null&ps=1.0.0&sc=ECONOMY') + '&utm_source=tappyai&utm_medium=ccp&sub1=4cd9952b50a24c125c75cf0f'
    const ok = flightShape(`Xem giá trên Traveloka: [Traveloka](${link})`)
    expect(ok.traveloka.ok).toBe(true)
    expect(ok.money).toEqual([])
    expect(flightShape(`[Traveloka](${link.replace(/&sub1=[0-9a-f]+/, '')})`).traveloka.ok).toBe(false)
    expect(flightShape('Vé thường 1.200.000đ, [Traveloka](https://www.traveloka.com/vi-VN/flight/fullsearch?ap=SGN.HAN&dt=15-10-2026.null)').money).toEqual(['1.200.000đ'])
    expect(flightShape('Chuyến bay 1 người, bay sáng').money).toEqual([])
  })
})

describe('flight money: fares only (B1 false positives)', () => {
  it('ignores review counts, sourced venue bands and line breaks; catches an invented fare', async () => {
    const { flightShape } = await import('./criteria')
    expect(flightShape('Quán Ăn Ngon 4.4⭐ (6.075 đánh giá)').money).toEqual([])
    expect(flightShape('- 1 người × 200.000đ–600.000đ/người = 200.000đ–600.000đ (mức giá Google Maps)').money).toEqual([])
    expect(flightShape('Chuyến 10\n\nTrả phòng').money).toEqual([])
    expect(flightShape('bay sáng thường khởi hành 6h–9h, giá từ 800k–2M+ tùy hãng').money.length).toBeGreaterThan(0)
  })
})
