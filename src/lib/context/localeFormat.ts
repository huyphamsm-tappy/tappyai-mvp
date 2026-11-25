// R13 §7.3 locale formatting, the small pure part: BCP 47 locale, ISO 4217 currency, IANA timezone, number/date/unit formatting by market and locale.
// A source price keeps its ORIGINAL currency; a conversion is a presentation value that always carries its rate source and timestamp.
// Business rule (R13 §7.3): the Vietnamese subscription price is fixed in VND by the current business decision and its rounding rule; NOTHING here converts a USD price into VND
// or changes that rounding. International market prices are configured separately. Pure; Intl only; browser-safe.

import { DEFAULT_REGISTRY, type Registry } from '@/lib/market/marketGate'

export interface MarketFormat { locale: string; currency: string; timeZone: string }

export function isValidLocaleTag(tag: string): boolean {
  try { return Intl.getCanonicalLocales(tag).length === 1 } catch { return false }
}
export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}
export const isIso4217 = (code: string): boolean => /^[A-Z]{3}$/.test(code)

/** The formatting defaults of a market from the registry (locale, currency, timezone); null for an unknown market. */
export function marketFormat(marketId: string | null | undefined, registry: Registry = DEFAULT_REGISTRY): MarketFormat | null {
  const m = marketId ? registry.markets.find(x => x.marketId === marketId) : undefined
  return m ? { locale: m.defaultLocale, currency: m.defaultCurrency, timeZone: m.timezone } : null
}

export function formatNumber(value: number, locale: string, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(isValidLocaleTag(locale) ? locale : 'en', opts).format(value)
}

/** An amount in its own currency, in the reader's locale. VND has no minor unit. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  if (!isIso4217(currency)) throw new RangeError(`not an ISO 4217 code: ${currency}`)
  return new Intl.NumberFormat(isValidLocaleTag(locale) ? locale : 'en', { style: 'currency', currency }).format(amount)
}

export function formatDateTime(date: Date, locale: string, timeZone: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  return new Intl.DateTimeFormat(isValidLocaleTag(locale) ? locale : 'en', { ...opts, timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC' }).format(date)
}

export function formatDistance(meters: number, locale: string): string {
  const l = isValidLocaleTag(locale) ? locale : 'en'
  return meters < 1000
    ? new Intl.NumberFormat(l, { style: 'unit', unit: 'meter', maximumFractionDigits: 0 }).format(meters)
    : new Intl.NumberFormat(l, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(meters / 1000)
}

export interface PresentedConversion {
  /** the source price, untouched */
  original: { amount: number; currency: string }
  /** a presentation value, never the stored price */
  converted: { amount: number; currency: string }
  rate: number
  rateSource: string
  /** ISO timestamp the rate was observed */
  asOf: string
}

/** A conversion is only presentable with its rate, its source and its timestamp (R13 §7.3). Throws when any is missing. */
export function presentConversion(original: { amount: number; currency: string }, to: string, rate: { value: number; source: string; asOf: string }): PresentedConversion {
  if (!isIso4217(original.currency) || !isIso4217(to)) throw new RangeError('currency must be ISO 4217')
  if (!(rate.value > 0) || !rate.source || Number.isNaN(Date.parse(rate.asOf))) throw new RangeError('a conversion needs a positive rate, its source and its timestamp')
  return { original: { ...original }, converted: { amount: original.amount * rate.value, currency: to }, rate: rate.value, rateSource: rate.source, asOf: rate.asOf }
}
