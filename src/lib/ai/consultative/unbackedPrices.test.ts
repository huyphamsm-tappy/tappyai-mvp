import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { labelUnbackedPrices, PRICE_EVIDENCE_TOLERANCE } from './unbackedPrices'

// 30/10 (owner + ChatGPT review): in one brain the shopping money step ran in shadow mode, so a price no listing or page carried reached the person
// unchanged and unmarked. It is now LABELLED "chưa xác minh" - only the figure - and nothing else in the answer is touched.

const L = 'chưa xác minh'
const E = [17_490_000, 16_650_000, 24_990_000, 19_890_000]

describe('labelUnbackedPrices', () => {
  it('a price a tool result carried stays, to the figure', () => {
    const t = 'Phúc Khang Mobile niêm yết **16.650.000đ**, CellphoneS 24,99 triệu.'
    const r = labelUnbackedPrices(t, E, L)
    expect(r.text).toBe(t)
    expect(r.labelled).toBe(0)
  })
  it('an invented price is replaced by the label; the name, the bullet and the rest of the line stay', () => {
    const t = '- **Cửa hàng X:** giá **5.550.000đ**, bảo hành 12 tháng, còn hàng.\n- **Phúc Khang Mobile:** 16.650.000đ.'
    const r = labelUnbackedPrices(t, E, L)
    expect(r.text).toBe('- **Cửa hàng X:** giá **chưa xác minh**, bảo hành 12 tháng, còn hàng.\n- **Phúc Khang Mobile:** 16.650.000đ.')
    expect(r.labelled).toBe(1)
  })
  it('the hedge word before the figure goes with it, and a table row keeps its cells', () => {
    const t = '| Cửa hàng | Giá |\n|---|---|\n| Shop A | khoảng 9 triệu |\n| Shop B | 17.490.000đ |'
    const r = labelUnbackedPrices(t, E, L)
    expect(r.text).toBe('| Cửa hàng | Giá |\n|---|---|\n| Shop A | chưa xác minh |\n| Shop B | 17.490.000đ |')
  })
  it('a figure rounded within the tolerance is backed ("17,5 triệu" for 17.490.000đ)', () => {
    expect(PRICE_EVIDENCE_TOLERANCE).toBeLessThanOrEqual(0.05)
    expect(labelUnbackedPrices('Khoảng 17,5 triệu.', E, L).labelled).toBe(0)
    expect(labelUnbackedPrices('Khoảng 12 triệu.', E, L).labelled).toBe(1)
  })
  it('a range is backed only when both ends are', () => {
    expect(labelUnbackedPrices('Giá 16,65–24,99 triệu.', E, L).labelled).toBe(0)
    expect(labelUnbackedPrices('Giá 16,65–31 triệu.', E, L).labelled).toBe(1)
  })
  it('a difference or a sum of two backed figures is backed (the model\'s own arithmetic)', () => {
    expect(labelUnbackedPrices('Chênh nhau khoảng 7,5 triệu giữa hàng mới và máy cũ.', [24_990_000, 17_490_000], L).labelled).toBe(0) // 24.99 - 17.49
    expect(labelUnbackedPrices('Mua hai món hết 42,48 triệu.', [24_990_000, 17_490_000], L).labelled).toBe(0) // sum
    expect(labelUnbackedPrices('Chênh nhau khoảng 3 triệu.', [24_990_000, 17_490_000], L).labelled).toBe(1)
  })
  it('an amount the person wrote counts as evidence (budget talk is not a claim)', () => {
    expect(labelUnbackedPrices('Trong ngân sách 20 triệu của bạn.', [20_000_000, ...E], L).labelled).toBe(0)
  })
  it('links, machine blocks and query strings are not prose: untouched', () => {
    const t = 'Xem [trang](https://shop.example/p?id=5550000&price=9990000) rồi chọn.\n[TAPPY_SHOPPING]{"priceLow":5550000}[/TAPPY_SHOPPING]'
    expect(labelUnbackedPrices(t, E, L).text).toBe(t)
  })
  it('a foreign-currency figure is not judged against VND evidence', () => {
    const t = 'Giá quốc tế khoảng $1,199.'
    expect(labelUnbackedPrices(t, E, L).text).toBe(t)
  })
  it('works for any product family and any evidence set (nothing names one)', () => {
    const r = labelUnbackedPrices('Máy giặt LG 9kg giá 8.490.000đ; máy sấy 12.000.000đ.', [8_490_000], L)
    expect(r.text).toBe('Máy giặt LG 9kg giá 8.490.000đ; máy sấy chưa xác minh.')
  })
  it('a small number a tool carried (a rating count, a year) is not a price and backs nothing', () => {
    expect(labelUnbackedPrices('Chỉ 1.000đ một món.', [1000 - 1, 17_490_000], L).labelled).toBe(1)
    expect(labelUnbackedPrices('Chỉ 2.000đ một món.', [2, 600, 17_490_000], L).labelled).toBe(1)
  })
  it('counts claims and labelled figures', () => {
    const r = labelUnbackedPrices('A 1.234.000đ, B 17.490.000đ, C 2.222.000đ.', E, L)
    expect({ claims: r.claims, labelled: r.labelled }).toEqual({ claims: 3, labelled: 2 })
  })
})

describe('wiring in the stream', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/ai/streamEnrichment.ts'), 'utf8')
  it('one brain labels unbacked shopping prices after the (shadow) money step, only when a product search ran and the answer is not a plan', () => {
    expect(src).toContain("import { labelUnbackedPrices } from './consultative/unbackedPrices'")
    expect(src).toContain('collector?.oneBrain === true && productRecords.length > 0 && !collector.planBlock && !collector.planTurn')
  })
})
