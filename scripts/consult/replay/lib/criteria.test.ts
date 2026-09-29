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
