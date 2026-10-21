// Tappy Business — money.
//
// Contract: docs/tappy-business/PHASE_0_ARCHITECTURE.md §9 (migration
// landmines) and §10/§41 of the architecture contract.
//
// ============================================================================
// 🔑 THE INVARIANT
// ============================================================================
// An amount is an INTEGER COUNT OF THE CURRENCY'S MINOR UNIT.
//
//     price_amount = 45000, currency = 'VND'   means   45,000 ₫
//
// VND's ISO 4217 exponent is **0**. The đồng has no subunit in circulation, so
// the minor unit IS the đồng. This is the single most dangerous fact in the
// schema, because almost every commerce engine defaults to exponent 2:
//
//     a target assuming exponent 2 reads 45000 as        450.00   ← 100× too small
//     a migration "helpfully" multiplying by 100 writes  4500000  ← 100× too large
//
// Either mistake is silent, applies to every historical order at once, and is
// only visible if reconciliation compares MONETARY TOTALS rather than row
// counts. §41 requires exactly that, and this module is where the exponent is
// defined so no caller has to remember it.
//
// ============================================================================
// WHY THERE IS NO FLOATING POINT ANYWHERE BELOW
// ============================================================================
// `0.1 + 0.2 !== 0.3`. Money in a binary float is money that disagrees with
// itself, and the disagreement shows up in a customer's total. Every function
// here takes and returns integers, and rejects a non-integer input loudly
// rather than rounding it into something plausible. The database says the same
// thing a second time: `business_order_items` carries
// `CHECK (line_total_amount = unit_price_amount * quantity)`.

/** ISO 4217 minor-unit exponents for the currencies Tappy Business handles. */
const MINOR_UNIT_EXPONENTS: Readonly<Record<string, number>> = Object.freeze({
  VND: 0,
})

/** The only currency MVP supports. Adding one is a deliberate, tested change. */
export const DEFAULT_CURRENCY = 'VND'

/**
 * `Number.MAX_SAFE_INTEGER` is 9,007,199,254,740,991 — about 9 quadrillion ₫.
 * Amounts stay in `number` rather than `bigint` because the whole range of
 * plausible values is orders of magnitude below that, and because this project
 * targets ES2017 where bigint literals do not compile. Every arithmetic helper
 * re-checks the result anyway, so an overflow throws instead of silently
 * losing precision.
 */
export const MAX_AMOUNT = Number.MAX_SAFE_INTEGER

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/**
 * How many minor units make one major unit of `currency`.
 *
 * Throws on an unknown currency rather than assuming 2, because assuming is the
 * failure this module exists to prevent.
 */
export function minorUnitExponent(currency: string): number {
  const exponent = MINOR_UNIT_EXPONENTS[currency]
  if (exponent === undefined) {
    throw new MoneyError(`unknown currency "${currency}": its minor-unit exponent is not declared`)
  }
  return exponent
}

/** True when `currency` is one this module knows how to handle. */
export function isSupportedCurrency(currency: unknown): currency is string {
  return typeof currency === 'string' && currency in MINOR_UNIT_EXPONENTS
}

/**
 * Narrow an untrusted value to a valid amount, or throw.
 *
 * Rejects: floats (including ones that look like money, e.g. `45.5`), NaN,
 * Infinity, negatives, and anything beyond the safe-integer range. There is no
 * rounding — a caller that produced `45.5` has a bug, and rounding it would
 * hide the bug in a customer's total.
 */
export function assertAmount(value: unknown, label = 'amount'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number`)
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${label} must be an integer count of minor units — got ${value}. ` +
        'Money is never a float; see src/lib/business/money.ts.'
    )
  }
  if (value < 0) throw new MoneyError(`${label} must not be negative — got ${value}`)
  if (value > MAX_AMOUNT) throw new MoneyError(`${label} exceeds the safe integer range`)
  return value
}

/**
 * A line total: unit price × quantity, in minor units.
 *
 * Mirrors the CHECK constraint on `business_order_items`, so a value computed
 * here and a value the database will accept can never diverge.
 */
export function lineTotal(unitPriceAmount: number, quantity: number): number {
  assertAmount(unitPriceAmount, 'unitPriceAmount')
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new MoneyError(`quantity must be a positive integer — got ${quantity}`)
  }
  const total = unitPriceAmount * quantity
  // Multiplication is where a plausible-looking pair silently leaves the safe
  // range, so the result is re-checked rather than trusted.
  return assertAmount(total, 'lineTotal')
}

/**
 * Sum of line totals — the order total.
 *
 * MVP totals cover product items ONLY. Shipping is never included: Tappy does
 * not arrange delivery and must not present a number a customer could mistake
 * for the final amount payable (§17). The customer-facing surface says
 * "Tạm tính — chưa gồm phí vận chuyển" beside whatever this returns.
 */
export function sumAmounts(amounts: readonly number[]): number {
  let total = 0
  for (let i = 0; i < amounts.length; i++) {
    total += assertAmount(amounts[i], `amounts[${i}]`)
  }
  return assertAmount(total, 'total')
}

/**
 * Render an amount for display.
 *
 * This function exists so that no component ever divides by 100. With VND at
 * exponent 0 the division would be wrong, and the only reliable way to stop
 * someone writing it is to give them something correct to call instead.
 */
export function formatAmount(amount: number, currency: string = DEFAULT_CURRENCY): string {
  assertAmount(amount)
  const exponent = minorUnitExponent(currency)
  const major = exponent === 0 ? amount : amount / 10 ** exponent
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(major)
  return currency === 'VND' ? `${formatted}₫` : `${formatted} ${currency}`
}
