// Compact VND price for the shopping decision card. Locale-aware so an English
// session reads "25.8M" while a Vietnamese one reads "25,8 triệu". Number
// FORMATTING, not translatable UI copy — it lives here, outside src/components,
// on purpose.

export type PriceLocale = 'vi' | 'en'

/**
 * A short, human price. Returns null when there is no number, so the caller can
 * show an honest "unknown" label instead of a fabricated figure.
 */
export function formatVndShort(n: number | null | undefined, locale: PriceLocale): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  if (n >= 1_000_000) {
    const millions = Math.round((n / 1_000_000) * 10) / 10
    return locale === 'vi'
      ? `${millions.toString().replace('.', ',')} triệu`
      : `${millions}M`
  }
  return `${n.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}₫`
}

/** A price RANGE (low–high), collapsing to a single value when they match. */
export function formatVndRange(
  low: number | null,
  high: number | null,
  locale: PriceLocale,
  noPrice: string,
): string {
  const lo = formatVndShort(low, locale)
  const hi = formatVndShort(high, locale)
  if (lo === null && hi === null) return noPrice
  if (lo !== null && hi !== null && low !== high) return `${lo} – ${hi}`
  return (lo ?? hi) as string
}
