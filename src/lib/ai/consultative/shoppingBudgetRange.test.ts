import { describe, it, expect } from 'vitest'
import { extractBudget } from '../budget'
import { deriveShoppingConstraints, validateShoppingCandidates } from './shoppingConstraints'

// Owner 30/09 night (B on the Luna review page, SHOP-2 t2 / t6): "sếp nam 40 tuổi, thích cà phê, tầm 1-2 triệu" — the pick
// was a 172.000đ box (t2) and a 100.940đ box (t6). Root cause: "1-2 triệu" was read as 1.000đ–2.000.000đ, so every cheap
// listing passed as "in budget". Listings below are the real t2 search rows (titles and prices verbatim).
const T2 = [
  ['Hộp quà tặng cao cấp Hạt A Cafe Premium Gift Box Coffee 3 loại cà phê hòa tan 288g - 16 stick', 172000],
  ['Quà Tặng 3 Gói Cà Phê Bất Kỳ', 20000],
  ['Set quà tặng cà phê cao cấp - máy xay cầm tay cổ điển kèm cốc sứ, thiệp viết', 466000],
  ['Hộp quà tặng cà phê GU ĐẬM Greenfields Coffee', 200000],
  ['Quà Tặng 6 Gói Cà Phê Bất Kỳ', 40000],
  ['Hộp Quà Tặng Cà Phê K Coffee Hạnh Phúc Happy Life Box', 480283],
] as const
const cand = (name: string, price: number) => ({ name, raw: { title: name }, attrs: { priceVnd: price } }) as never
const name = (c: unknown) => (c as { name: string }).name
const users = ['sếp sinh nhật mua gì', 'sếp nam 40 tuổi, thích cà phê, tầm 1-2 triệu']
const k = () => deriveShoppingConstraints(users.map(content => ({ role: 'user', content })), extractBudget(users[1]))

describe('SHOP-2 — a stated range "1-2 triệu" is 1.000.000đ–2.000.000đ', () => {
  it('the unit written once belongs to both numbers', () => {
    expect(extractBudget('tầm 1-2 triệu')).toEqual({ min: 1_000_000, max: 2_000_000, type: 'range' })
    expect(extractBudget('300-500k')).toEqual({ min: 300_000, max: 500_000, type: 'range' })
    expect(extractBudget('từ 500k đến 1 triệu')).toEqual({ min: 500_000, max: 1_000_000, type: 'range' })
  })
  it('t2 (real rows): nothing is in the range → ONE closest listing is kept and flagged, never the 172k box', () => {
    const r = validateShoppingCandidates(T2.map(([n, p]) => cand(n, p)), k())
    expect(r.kept.map(name)).toEqual(['Hộp Quà Tặng Cà Phê K Coffee Hạnh Phúc Happy Life Box'])
    expect(r.nearestBelowBudget?.priceVnd).toBe(480283)
    expect(r.nearestBelowBudget?.rangeMin).toBe(1_000_000)
  })
  it('a listing inside the range wins; the cheap boxes (172k, 100.940đ — t6) are dropped', () => {
    const rows = [cand('Hộp quà tặng cao cấp Hạt A Cafe Premium Gift Box', 172000), cand('Hộp Mix 3 Vị 18 Gói Cà phê Hòa Tan Cộng Cà Phê', 100940),
      cand('Set quà tặng 2026 Cộng Cà Phê kèm túi đựng - Bộ quà Tươi Vui', 1_250_000), cand('Máy pha cà phê mini kèm hộp quà', 1_890_000)]
    const r = validateShoppingCandidates(rows, k())
    expect(r.kept.map(name)).toEqual(['Set quà tặng 2026 Cộng Cà Phê kèm túi đựng - Bộ quà Tươi Vui', 'Máy pha cà phê mini kèm hộp quà'])
    expect(r.nearestBelowBudget).toBeUndefined()
  })
  it('an "under" budget never keeps anything over it', () => {
    const r = validateShoppingCandidates([cand('Hộp quà', 2_500_000)], deriveShoppingConstraints([{ role: 'user', content: 'quà tặng sếp dưới 2 triệu' }], extractBudget('dưới 2 triệu')))
    expect(r.kept).toHaveLength(0)
    expect(r.nearestBelowBudget).toBeUndefined()
  })
})
