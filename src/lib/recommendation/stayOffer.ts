import type { StayOffer } from './entity'

// A stay card's reference-price line (owner, 19/11/2026): the price the provider's realtime check returned for THIS hotel, with the platform
// and the check time. The numbers are only ever the provider's structured fields; nothing here computes or guesses a price.

/** Accept an attached offer only when every field the line needs is a real structured value; anything else means no price line. */
export function readStayOffer(v: unknown): StayOffer | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount <= 0) return null
  if (o.currency !== 'VND' && o.currency !== 'USD') return null
  if (o.unit !== 'per_night' && o.unit !== 'total') return null
  if (typeof o.platform !== 'string' || !o.platform.trim()) return null
  if (typeof o.checkedAt !== 'string' || !Number.isFinite(Date.parse(o.checkedAt))) return null
  const guests = typeof o.guests === 'number' && Number.isInteger(o.guests) && o.guests >= 1 && o.guests <= 30 ? o.guests : undefined
  const nights = typeof o.nights === 'number' && Number.isInteger(o.nights) && o.nights >= 1 && o.nights <= 30 ? o.nights : undefined
  return { platform: o.platform.trim(), amount: o.amount, currency: o.currency, unit: o.unit, ...(nights ? { nights } : {}), ...(guests ? { guests } : {}), checkedAt: o.checkedAt }
}

type T = (key: string, params?: Record<string, string>) => string

function money(o: StayOffer, locale: string): string {
  if (o.currency === 'USD') return `${o.amount} USD`
  const n = Math.round(o.amount)
  return locale === 'vi' ? `${n.toLocaleString('vi-VN')}đ` : `${n.toLocaleString('en-US')} VND`
}

/** hh:mm and dd/mm/yyyy of the check, in Vietnam time (the stay's own clock). */
function checkParts(iso: string): { time: string; date: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const hour = g('hour') === '24' ? '00' : g('hour')
  return { time: `${hour}:${g('minute')}`, date: `${g('day')}/${g('month')}/${g('year')}` }
}

/** The one reference-price line, or null when the card has no offer to state. */
export function stayOfferLine(offer: StayOffer | null | undefined, t: T, locale: string): string | null {
  const o = readStayOffer(offer)
  if (!o) return null
  const { time, date } = checkParts(o.checkedAt)
  const guests = o.guests ? t('v206.card.stayGuests', { n: String(o.guests) }) : ''
  return t(o.unit === 'per_night' ? 'v206.card.stayPriceNight' : 'v206.card.stayPriceTotal', { price: money(o, locale), guests, platform: o.platform, time, date })
}
