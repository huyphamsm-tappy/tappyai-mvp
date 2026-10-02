import { describe, it, expect } from 'vitest'
import { shoppingMarkerRecords } from './consultBrain'
import { guardMoneyClaimsInText } from '../moneyGuard'

// Replay SHOP-2 (29/09, level A): a shopping PLAN calls no tool, the money guard had no evidence and every
// invented amount for the extras shipped. The newest card's prices are now its evidence.
const card = '[TAPPY_SHOPPING]' + JSON.stringify({ v: 1, entities: [{ key: 'k0', name: 'Set Quà Tặng Bạn Gái Dễ Thương', priceLow: 70000, priceHigh: 70000, offers: [{ seller: 'Shopee', price: 70000 }] }], recommendation: null }) + '[/TAPPY_SHOPPING]'

describe('shopping plan money evidence', () => {
  it('reads the newest card into { title, price, source }', () => {
    expect(shoppingMarkerRecords(['no card', `**Mình chọn: Set**\n${card}`])).toEqual([{ title: 'Set Quà Tặng Bạn Gái Dễ Thương', price: '70.000 ₫', source: 'Shopee' }])
    expect(shoppingMarkerRecords(['no card'])).toEqual([])
  })
  it('with it, the guard keeps the product price and removes the invented extras', () => {
    const plan = ['**Tổng chi phí**', '- 1 × 70.000đ = 70.000đ (giá tại Shopee lúc tìm).', '- **Giấy gói quà**: ~20.000đ (tùy nơi bán).', '- **Tổng: ~105.000đ**'].join('\n')
    const out = guardMoneyClaimsInText(plan, shoppingMarkerRecords([card]), ['Set Quà Tặng Bạn Gái Dễ Thương']).text
    expect(out).toContain('70.000đ')
    expect(out).not.toContain('20.000đ')
    expect(out).not.toContain('105.000đ')
  })
})
