import { describe, it, expect } from 'vitest'
import { crossRate, MissingCurrencyError } from './exchange'

// USD-based table (units per 1 USD). Covers the owner's list EXCEPT IDR, which is
// deliberately absent to exercise the missing-currency guard (item 3).
const rates: Record<string, number> = { USD: 1, VND: 26250, JPY: 157, KRW: 1380, TWD: 32.2 }

describe('crossRate — A→USD→B', () => {
  it('computes correct cross rates across VND / JPY / KRW / TWD / USD', () => {
    expect(crossRate(rates, 'USD', 'VND')).toBeCloseTo(26250, 5)
    expect(crossRate(rates, 'VND', 'USD')).toBeCloseTo(1 / 26250, 12)
    expect(crossRate(rates, 'JPY', 'KRW')).toBeCloseTo(1380 / 157, 8)
    expect(crossRate(rates, 'KRW', 'TWD')).toBeCloseTo(32.2 / 1380, 10)
    expect(crossRate(rates, 'TWD', 'JPY')).toBeCloseTo(157 / 32.2, 8)
    expect(crossRate(rates, 'VND', 'VND')).toBe(1) // identity
  })

  it('throws MissingCurrencyError for an absent currency (IDR) — never silently returns 1', () => {
    expect(() => crossRate(rates, 'VND', 'IDR')).toThrow(MissingCurrencyError)
    expect(() => crossRate(rates, 'IDR', 'USD')).toThrow(MissingCurrencyError)
    try {
      crossRate(rates, 'VND', 'IDR')
    } catch (e) {
      expect(e).toBeInstanceOf(MissingCurrencyError)
      expect((e as MissingCurrencyError).code).toBe('IDR')
    }
  })

  it('rejects invalid rates (0 / NaN) instead of dividing by them', () => {
    expect(() => crossRate({ USD: 1, ZED: 0 }, 'ZED', 'USD')).toThrow(MissingCurrencyError)
    expect(() => crossRate({ USD: 1, ZED: NaN }, 'USD', 'ZED')).toThrow(MissingCurrencyError)
  })
})
