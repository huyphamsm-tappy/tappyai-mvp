// Finance formatting library. Single home for money/rate display so no module
// duplicates this logic. Future finance features (currency, price, deals) reuse it.

// Format a money amount with a fixed number of fraction digits (per-currency).
export function formatAmount(value: number, decimals: number, locale = 'vi-VN'): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Format an exchange rate for display. Fraction digits scale with magnitude so a
// non-zero rate NEVER collapses to "0" (the Bug #15 precision defect): small rates
// keep 4 significant digits (e.g. 1 VND = 0,00003810 USD) instead of rounding to 0.
export function formatRate(value: number, locale = 'vi-VN'): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 100) return value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  if (abs >= 1) return value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
  // < 1: significant-digit formatting guarantees a non-zero rate stays non-zero.
  return value.toLocaleString(locale, { maximumSignificantDigits: 4 })
}
