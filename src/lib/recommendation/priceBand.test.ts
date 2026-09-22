import { describe, expect, it } from 'vitest'
import { amountWithinBand, bandFromRow, bandFromStructuredRange, formatPriceBandText, parsePriceBand } from './priceBand'

// Phase 7 small item (2026-09-22): "1-100.000 ₫" on the card read as "from one đồng".
describe('formatPriceBandText', () => {
  it('an open lower bound is "dưới"', () => {
    expect(formatPriceBandText('1-100.000 ₫', 'vi')).toBe('dưới 100.000 ₫')
    expect(formatPriceBandText('1-100.000 ₫', 'en')).toBe('under 100,000 ₫')
  })
  it('closed and open-above bands', () => {
    expect(formatPriceBandText('100-200 N ₫', 'vi')).toBe('100.000–200.000 ₫')
    expect(formatPriceBandText('Trên 1 Tr ₫', 'vi')).toBe('trên 1 triệu ₫')
    expect(formatPriceBandText('200.000-1.500.000 ₫', 'vi')).toBe('200.000–1,5 triệu ₫')
  })
  it('an unknown shape is shown verbatim, never hidden', () => {
    expect(formatPriceBandText('$$', 'vi')).toBe('$$')
    expect(formatPriceBandText('', 'vi')).toBeNull()
  })
})

describe('parsePriceBand — the provider strings seen in the 2026-09-17 V3 capture', () => {
  it('"100-200 N ₫" is 100 000 – 200 000', () => {
    expect(parsePriceBand('100-200 N ₫')).toEqual({ lo: 100000, hi: 200000, open: null, currency: 'VND', source: '100-200 N ₫' })
  })
  it('"200-600 N ₫", "100-700 N ₫"', () => {
    expect(parsePriceBand('200-600 N ₫')).toMatchObject({ lo: 200000, hi: 600000, open: null })
    expect(parsePriceBand('100-700 N ₫')).toMatchObject({ lo: 100000, hi: 700000, open: null })
  })
  it('"1-100.000 ₫" is UP TO 100 000 — the leading 1 is a placeholder, so the band is open below', () => {
    expect(parsePriceBand('1-100.000 ₫')).toMatchObject({ lo: 0, hi: 100000, open: 'below' })
  })
  it('"Trên 1 Tr ₫" is at least 1 000 000, open above', () => {
    expect(parsePriceBand('Trên 1 Tr ₫')).toMatchObject({ lo: 1000000, hi: Infinity, open: 'above' })
  })
  it('"1-2 Tr ₫" and "1,5-3 Tr ₫" scale by a million', () => {
    expect(parsePriceBand('1-2 Tr ₫')).toMatchObject({ lo: 1000000, hi: 2000000, open: null })
    expect(parsePriceBand('1,5-3 Tr ₫')).toMatchObject({ lo: 1500000, hi: 3000000, open: null })
  })
  it('"Dưới 100 N ₫" is open below', () => {
    expect(parsePriceBand('Dưới 100 N ₫')).toMatchObject({ lo: 0, hi: 100000, open: 'below' })
  })
  it('anything else is no evidence, never a guess', () => {
    for (const s of ['', '   ', '$$', '₫₫', 'Giá hợp lý', '100-200', '200-100 N ₫', '0-0 N ₫', 'abc ₫']) {
      expect(parsePriceBand(s), s).toBeNull()
    }
    expect(parsePriceBand(null)).toBeNull()
    expect(parsePriceBand(undefined)).toBeNull()
  })
})

describe('bandFromStructuredRange / bandFromRow — Google Places rows', () => {
  it('reads {low, high, currency: VND}', () => {
    expect(bandFromStructuredRange({ low: 100000, high: 200000, currency: 'VND' })).toMatchObject({ lo: 100000, hi: 200000, open: null })
  })
  it('a low of 1 is the open-below placeholder; a missing high is open above', () => {
    expect(bandFromStructuredRange({ low: 1, high: 100000, currency: 'VND' })).toMatchObject({ lo: 0, hi: 100000, open: 'below' })
    expect(bandFromStructuredRange({ low: 1000000, currency: 'VND' })).toMatchObject({ lo: 1000000, hi: Infinity, open: 'above' })
  })
  it('a non-VND range is not a band for this guard', () => {
    expect(bandFromStructuredRange({ low: 10, high: 20, currency: 'USD' })).toBeNull()
  })
  it('bandFromRow prefers the structured range, then the text, then nothing', () => {
    expect(bandFromRow({ price_range: { low: 100000, high: 200000, currency: 'VND' }, price_range_text: '1-2 Tr ₫' })).toMatchObject({ lo: 100000, hi: 200000 })
    expect(bandFromRow({ price_range_text: '1-2 Tr ₫' })).toMatchObject({ lo: 1000000, hi: 2000000 })
    expect(bandFromRow({ name: 'x' })).toBeNull()
  })
})

describe('amountWithinBand — fully inside, no tolerance (owner rule)', () => {
  const band = parsePriceBand('100-200 N ₫')!
  it('a range inside the band is supported; the band itself is supported', () => {
    expect(amountWithinBand(100000, 200000, band)).toBe(true)
    expect(amountWithinBand(120000, 180000, band)).toBe(true)
    expect(amountWithinBand(150000, 150000, band)).toBe(true)
  })
  it('partial overlap is unsupported, even by 1 ₫', () => {
    expect(amountWithinBand(100000, 200001, band)).toBe(false)
    expect(amountWithinBand(99999, 200000, band)).toBe(false)
    expect(amountWithinBand(50000, 150000, band)).toBe(false)
    expect(amountWithinBand(500000, 1000000, band)).toBe(false)
  })
  it('open sides are unbounded', () => {
    const below = parsePriceBand('1-100.000 ₫')!
    expect(amountWithinBand(30000, 100000, below)).toBe(true)
    expect(amountWithinBand(100000, 100001, below)).toBe(false)
    const above = parsePriceBand('Trên 1 Tr ₫')!
    expect(amountWithinBand(1000000, 5000000, above)).toBe(true)
    expect(amountWithinBand(900000, 2000000, above)).toBe(false)
  })
})
