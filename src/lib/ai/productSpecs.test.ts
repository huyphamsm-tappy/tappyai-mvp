import { describe, expect, it } from 'vitest'
import { parseProductSpecs, parseVndPrice } from './productSpecs'

/** Titles taken verbatim from a live google.serper.dev/shopping response. */
const LIVE = {
  full: 'Macbook Pro 14 inch M1 Pro 32GB / 512GB 【USED】',
  usedOnly: 'Macbook Pro M1 13 inch Cũ -Hàng 95%',
  bare: 'Macbook Pro M1 13 inch 2020 - USED',
}

describe('price', () => {
  it.each([
    ['11.990.000 ₫', 11_990_000],
    ['29.900.000 ₫', 29_900_000],
    ['₫14,500,000', 14_500_000],
    [24900000, 24_900_000],
  ])('reads %s', (raw, expected) => {
    expect(parseVndPrice(raw)).toBe(expected)
  })

  it.each([['', null], ['Liên hệ', null], [undefined, null], ['₫12', null]])(
    'returns null for %s rather than a guess', (raw, expected) => {
      expect(parseVndPrice(raw as never)).toBe(expected)
    },
  )
})

describe('specs come from the seller\'s text or not at all', () => {
  it('reads the 32GB / 512GB pair the way sellers write it', () => {
    expect(parseProductSpecs(LIVE.full)).toMatchObject({
      ram_gb: 32, storage_gb: 512, condition: 'used', spec_source: LIVE.full,
    })
  })

  it('records the exact source text for every value it produced', () => {
    const out = parseProductSpecs(LIVE.full)
    expect(out.spec_source).toBe(LIVE.full)
    expect(out.spec_source).toContain('32GB / 512GB')
  })

  it('leaves RAM and storage UNKNOWN when the title does not state them', () => {
    // This is the whole point: Apple sold an M1 Pro 14" with 16GB and with
    // 32GB. Filling either in from model knowledge is the fabrication the
    // previous run produced.
    for (const t of [LIVE.usedOnly, LIVE.bare, 'MacBook Pro M1 Pro']) {
      const out = parseProductSpecs(t)
      expect(out.ram_gb).toBeUndefined()
      expect(out.storage_gb).toBeUndefined()
    }
  })

  it.each([
    ['Macbook Pro M1 13 inch Cũ -Hàng 95%', 'used'],
    ['Macbook Pro M1 13 inch 2020 - USED', 'used'],
    ['MacBook Air M2 like new 99%', 'used'],
    ['MacBook Pro M3 nguyên seal', 'new'],
  ])('reads condition from %s', (title, condition) => {
    expect(parseProductSpecs(title).condition).toBe(condition)
  })

  it('does NOT read "chính hãng" as new — it means genuine, not unused', () => {
    expect(parseProductSpecs('MacBook Pro M1 chính hãng Apple').condition).toBeUndefined()
  })

  it('reads labelled specs, and 1TB as 1024GB', () => {
    expect(parseProductSpecs('MacBook Pro M1 Pro RAM 32GB SSD 1TB')).toMatchObject({ ram_gb: 32, storage_gb: 1024 })
  })

  it('never invents a spec_source when it found nothing', () => {
    expect(parseProductSpecs('Laptop')).toEqual({})
    expect(parseProductSpecs('')).toEqual({})
    expect(parseProductSpecs(undefined)).toEqual({})
  })

  it('does not mistake a lone storage figure for RAM', () => {
    const out = parseProductSpecs('MacBook Air 512GB SSD')
    expect(out.storage_gb).toBe(512)
    expect(out.ram_gb).toBeUndefined()
  })
})

describe('Vietnamese word boundaries — the ASCII \b trap', () => {
  it.each([
    'MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ',   // measured live: read as UNKNOWN
    'Macbook Pro 16 inch 2019 Silver (MVVL2) - i7 2.6/ 32GB/ 512G - Likenew',
    'MacBook Air M4 13 Inch 24GB 512GB Cũ',
  ])('reads "cũ"/"Likenew" as used in %s', title => {
    expect(parseProductSpecs(title).condition).toBe('used')
  })

  it('does not read "cũng" as second-hand', () => {
    expect(parseProductSpecs('Laptop này cũng tốt').condition).toBeUndefined()
  })
})

/**
 * Condition integrity. The measured fabrication: a reply compared "hàng 95% vs
 * 98%" when neither figure existed in any candidate, and described a listing as
 * "tình trạng 98%" purely from the label "Like New".
 */
describe('condition is the seller\'s label, never a percentage we invented', () => {
  it('keeps "Like New" as words and produces no number', () => {
    const out = parseProductSpecs('Macbook Pro 13 2020 - Core i7/32GB/512GB - Like New')
    expect(out.condition).toBe('used')
    expect(out.condition_label).toMatch(/like new/i)
    expect(JSON.stringify(out)).not.toMatch(/9\d\s*%/)
  })

  it('keeps a percentage ONLY when the seller published one', () => {
    const out = parseProductSpecs('Macbook Pro M1 13 inch Cũ -Hàng 95%')
    expect(out.condition).toBe('used')
    expect(out.condition_label).toMatch(/cũ|95/i)
  })

  it('never turns "used"/"cũ" into 95% or 98%', () => {
    for (const t of ['MacBook Pro 14 M1 Pro 32GB/512GB cũ', 'Macbook Pro M1 13 inch 2020 - USED']) {
      const out = parseProductSpecs(t)
      expect(out.condition).toBe('used')
      expect(out.condition_label).not.toMatch(/%/)
    }
  })

  it('reports no condition at all when the seller stated none', () => {
    const out = parseProductSpecs('MacBook Pro 16 inch M1 Max (10CPU/32GPU) 32GB/512GB')
    expect(out.condition).toBeUndefined()
    expect(out.condition_label).toBeUndefined()
  })
})
