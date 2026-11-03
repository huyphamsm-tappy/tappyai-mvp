import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_CURRENCY,
  MAX_AMOUNT,
  MoneyError,
  assertAmount,
  formatAmount,
  isSupportedCurrency,
  lineTotal,
  minorUnitExponent,
  sumAmounts,
} from './money'

// Tappy Business — the money invariant.
//
// The load-bearing assertion in this file is a single number: VND's minor-unit
// exponent is 0. Everything else follows from it.
//
// It is worth a test file of its own because the failure mode is invisible. A
// target commerce engine that assumes exponent 2 reads every stored price as
// one hundredth of its value; a migration that "converts" by multiplying reads
// it as one hundred times. Neither throws. Neither shows up in a row count.
// Both are only caught by comparing monetary totals, which is why §41 requires
// reconciliation to do exactly that.

describe('VND exponent — the migration invariant', () => {
  it('is 0, because the đồng has no subunit in circulation', () => {
    expect(minorUnitExponent('VND')).toBe(0)
  })

  it('stores 45000 as forty-five thousand đồng, not 450.00 and not 4,500,000', () => {
    const price = assertAmount(45_000)
    expect(price).toBe(45_000)
    // The two mistakes this invariant exists to prevent, written out so a
    // future edit that reintroduces either one fails here first.
    expect(price).not.toBe(450)
    expect(price).not.toBe(4_500_000)
    expect(formatAmount(price)).toBe('45.000₫')
  })

  it('refuses a currency whose exponent has not been declared', () => {
    // Assuming 2 is the single most likely way this invariant gets broken, so
    // an unknown currency is a loud failure rather than a quiet default.
    expect(() => minorUnitExponent('USD')).toThrow(MoneyError)
    expect(isSupportedCurrency('USD')).toBe(false)
    expect(isSupportedCurrency(DEFAULT_CURRENCY)).toBe(true)
  })

  it('the schema documents the same invariant', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260908_tappy_business_p0.sql'),
      'utf8'
    )
    // A comment can drift from the code it describes; this makes the drift fail
    // a test instead of surviving into a migration runbook.
    expect(sql).toContain('45000 means 45,000 VND')
    expect(sql).toMatch(/VND has exponent 0/i)
  })
})

describe('amounts are integers, never floats', () => {
  it('accepts whole minor units', () => {
    expect(assertAmount(0)).toBe(0)
    expect(assertAmount(1)).toBe(1)
    expect(assertAmount(MAX_AMOUNT)).toBe(MAX_AMOUNT)
  })

  it('rejects a float rather than rounding it into a plausible total', () => {
    expect(() => assertAmount(45.5)).toThrow(MoneyError)
    expect(() => assertAmount(0.1 + 0.2)).toThrow(MoneyError)
  })

  it('rejects NaN, Infinity, negatives and non-numbers', () => {
    expect(() => assertAmount(Number.NaN)).toThrow(MoneyError)
    expect(() => assertAmount(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
    expect(() => assertAmount(-1)).toThrow(MoneyError)
    expect(() => assertAmount('45000')).toThrow(MoneyError)
    expect(() => assertAmount(null)).toThrow(MoneyError)
    expect(() => assertAmount(undefined)).toThrow(MoneyError)
  })

  it('rejects anything past the safe integer range', () => {
    expect(() => assertAmount(MAX_AMOUNT + 2)).toThrow(MoneyError)
  })
})

describe('lineTotal mirrors the database CHECK', () => {
  it('multiplies in integers', () => {
    expect(lineTotal(45_000, 2)).toBe(90_000)
    expect(lineTotal(0, 3)).toBe(0)
  })

  it('requires a positive integer quantity', () => {
    expect(() => lineTotal(45_000, 0)).toThrow(MoneyError)
    expect(() => lineTotal(45_000, -1)).toThrow(MoneyError)
    expect(() => lineTotal(45_000, 1.5)).toThrow(MoneyError)
  })

  it('throws when the product leaves the safe range instead of losing precision', () => {
    // Both operands are individually valid; only the result is not. Trusting
    // the multiplication is how a silently wrong total gets written.
    expect(() => lineTotal(MAX_AMOUNT, 2)).toThrow(MoneyError)
  })
})

describe('sumAmounts — the order total', () => {
  it('sums line totals', () => {
    expect(sumAmounts([45_000, 90_000, 15_000])).toBe(150_000)
    expect(sumAmounts([])).toBe(0)
  })

  it('names the offending element when one is invalid', () => {
    expect(() => sumAmounts([45_000, 12.5])).toThrow(/amounts\[1\]/)
  })
})

describe('formatAmount', () => {
  it('renders VND without a fractional part', () => {
    // If this ever produces "450,00₫" someone has divided by 100.
    expect(formatAmount(45_000)).toBe('45.000₫')
    expect(formatAmount(0)).toBe('0₫')
    expect(formatAmount(1_250_000)).toBe('1.250.000₫')
  })

  it('refuses to format an invalid amount', () => {
    expect(() => formatAmount(45.5)).toThrow(MoneyError)
  })
})
