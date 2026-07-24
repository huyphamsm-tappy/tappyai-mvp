import { describe, it, expect } from 'vitest'
import { formatRate, formatAmount } from './format'

// Parse a vi-VN formatted number back to Number (thousands '.', decimal ',').
const parseVi = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'))

describe('formatRate — never renders a non-zero rate as 0 (Bug #15)', () => {
  // Weak→strong pairs that previously collapsed to "0,0000".
  const smallRates: Record<string, number> = {
    'VND→USD': 1 / 26250,
    'VND→EUR': 1 / 29900,
    'VND→GBP': 1 / 34900,
    'VND→SGD': 1 / 20330,
    'VND→TWD': 32.2 / 26250,
    'KRW→USD': 1 / 1380,
  }
  for (const [pair, r] of Object.entries(smallRates)) {
    it(`${pair} (${r.toExponential(2)}) formats to a non-zero value`, () => {
      const s = formatRate(r)
      expect(s).not.toBe('0')
      expect(parseVi(s)).toBeGreaterThan(0)
    })
  }

  it('large rates keep 2 fraction digits; small rates keep significant digits', () => {
    expect(parseVi(formatRate(26250.538))).toBeCloseTo(26250.54, 1)
    expect(parseVi(formatRate(1 / 26250))).toBeCloseTo(1 / 26250, 8)
  })

  it('guards zero and non-finite input', () => {
    expect(formatRate(0)).toBe('0')
    expect(formatRate(Infinity)).toBe('—')
    expect(formatRate(NaN)).toBe('—')
  })
})

describe('formatAmount', () => {
  it('applies fixed per-currency decimals', () => {
    expect(parseVi(formatAmount(38.09, 2))).toBeCloseTo(38.09, 2)
    expect(parseVi(formatAmount(26250, 0))).toBe(26250)
    expect(formatAmount(Infinity, 2)).toBe('—')
  })
})
