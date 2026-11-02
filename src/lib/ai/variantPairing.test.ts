// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { noFabricationGate, capacityTokens, variantPriceMismatch } from './noFabricationGate'

// Closure of the Consultative work (2026-10-09): "recognise product variants without silently substituting a different model".
// Reproduced on HEAD af936fe: the 256GB price said for 512GB and for 1TB passed the gate as FACT (the figure is in the evidence; its pairing was
// never checked). The gate now pairs ONE amount + ONE capacity in a sentence with the rows that carry that amount.

const rows = { search_results: [
  { title: 'Apple iPhone 17 Pro Max 256GB', price: '₫33.690.000', source: 'CellphoneS' },
  { title: 'Apple iPhone 17 Pro Max 512GB', price: '₫39.990.000', source: 'CellphoneS' },
  { title: 'Samsung Galaxy S26 Ultra', price: '₫27.000.000', source: 'Hoàng Hà Mobile' },
] }
const ev = { corpus: [JSON.stringify(rows)], userTexts: ['so sánh iPhone 17 Pro Max'], tools: ['search_products'] }
const run = (t: string) => noFabricationGate(t, ev, { lang: 'vi' })

describe('variant pairing of a price', () => {
  it('capacity tokens: GB/TB normalised, TB = 1024 GB, no match inside other words or decimals', () => {
    expect(capacityTokens('bản 256GB và 1 TB, 8 GB RAM')).toEqual(['256', '1024', '8'])
    expect(capacityTokens('4.5GB')).toEqual([])
    expect(capacityTokens('256GBx')).toEqual([])
  })
  it('the figure with its OWN variant stays a FACT', () => {
    const r = run('Bản **iPhone 17 Pro Max 256GB** giá 33.690.000đ tại CellphoneS.')
    expect(r.removedSentences).toBe(0)
    expect(r.counts.FABRICATED).toBe(0)
  })
  it('REGRESSION: the 256GB price said for 512GB / 1TB is removed (the pairing is not in the evidence)', () => {
    for (const t of ['Bản **iPhone 17 Pro Max 512GB** giá 33.690.000đ tại CellphoneS.', 'Bản **iPhone 17 Pro Max 1TB** giá 33.690.000đ tại CellphoneS.']) {
      const r = run(t)
      expect(r.counts.FABRICATED, t).toBe(1)
      expect(r.removedSentences, t).toBe(1)
      expect(r.text).not.toContain('33.690.000')
    }
  })
  it('each variant with its own price in one answer is untouched', () => {
    const r = run('Bản 256GB giá 33.690.000đ.\n\nBản 512GB giá 39.990.000đ.')
    expect(r.removedSentences).toBe(0)
  })
  it('no opinion where the evidence does not pair a capacity: a row without capacity, a sentence without one, two capacities in one sentence', () => {
    expect(run('Galaxy S26 Ultra 512GB giá 27.000.000đ.').removedSentences).toBe(0) // the row names no capacity: nothing to contradict
    expect(run('Mẫu iPhone 17 Pro Max giá 33.690.000đ.').removedSentences).toBe(0)
    expect(run('Bản 256GB giá 33.690.000đ còn bản 512GB giá 39.990.000đ.').removedSentences).toBe(0)
  })
  it('the check judges only a sentence with ONE capacity and ONE amount (a mixed sentence cannot be paired reliably — no false removal)', () => {
    expect(run('Bản 512GB và 1TB có bán, giá từ 33.690.000đ.').removedSentences).toBe(0) // two capacities, one amount
    expect(run('Bản 512GB giá 39.990.000đ, rẻ hơn bản kia 33.690.000đ.').removedSentences).toBe(0) // one capacity, two amounts
  })
  it('pure function: mismatch only when every row with that amount names a different capacity', () => {
    const r = (caps: string[], prices: number[]) => ({ caps: new Set(caps), prices })
    expect(variantPriceMismatch('512GB giá 33.690.000đ', 33_690_000, [r(['256'], [33_690_000])])).toBe(true)
    expect(variantPriceMismatch('512GB giá 33.690.000đ', 33_690_000, [r(['256'], [33_690_000]), r(['512'], [33_690_000])])).toBe(false)
    expect(variantPriceMismatch('512GB giá 33.690.000đ', 33_690_000, [r([], [33_690_000])])).toBe(false)
    expect(variantPriceMismatch('512GB giá 40.000.000đ', 40_000_000, [r(['256'], [33_690_000])])).toBe(false)
  })
})
