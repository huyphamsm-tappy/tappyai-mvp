// ── The "Kiểm tra giá & tình trạng" link (web only) ───────────────────────────────────────────────────────────────────────────────
//
// A realtime offer Tappy holds gets ONE extra link in the reply: `<site>/booking/recheck#<payload>`. On the web the chat intercepts a tap on it,
// POSTs the payload to /api/booking/recheck and shows the answer beside the link — the user then taps the booking CTA. The payload is only what the
// route needs to re-ask the provider (offer id + the stay + the price to compare against); it carries no credential and nothing the server trusts:
// the route re-validates every field. Native clients never get this link (it is emitted only for platform 'web'), so no client shows a dead link.
// Pure and dependency-free: shared by the server (to build it) and the browser (to read it).

export const RECHECK_PATH = '/booking/recheck'

export interface RecheckPayload {
  v: 1
  provider: 'agoda' | 'booking'
  providerItemId: string
  title?: string
  previousPrice: number | null
  currency?: 'VND' | 'USD'
  stay: { destination?: string; checkIn: string; checkOut: string; adults: number; rooms?: number }
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

export function buildRecheckUrl(siteBase: string, payload: RecheckPayload): string {
  return `${siteBase.replace(/\/$/, '')}${RECHECK_PATH}#${b64(JSON.stringify(payload))}`
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Read a recheck href. Anything that is not exactly a well-formed payload → null (the href came from message text: never trust it). */
export function parseRecheckHref(href: string): RecheckPayload | null {
  try {
    const u = new URL(href)
    if (u.pathname !== RECHECK_PATH || !u.hash || u.hash.length < 8 || u.hash.length > 2000) return null
    const p = JSON.parse(unb64(u.hash.slice(1))) as Partial<RecheckPayload>
    if (!p || p.v !== 1 || (p.provider !== 'agoda' && p.provider !== 'booking') || !/^\d{1,12}$/.test(String(p.providerItemId))) return null
    const s = p.stay
    if (!s || !ISO.test(String(s.checkIn)) || !ISO.test(String(s.checkOut)) || !(s.checkOut > s.checkIn) || !Number.isInteger(s.adults) || s.adults < 1 || s.adults > 20) return null
    return {
      v: 1,
      provider: p.provider,
      providerItemId: String(p.providerItemId),
      ...(typeof p.title === 'string' ? { title: p.title.slice(0, 200) } : {}),
      previousPrice: typeof p.previousPrice === 'number' && p.previousPrice >= 0 ? p.previousPrice : null,
      ...(p.currency === 'VND' || p.currency === 'USD' ? { currency: p.currency } : {}),
      stay: {
        ...(typeof s.destination === 'string' ? { destination: s.destination.slice(0, 80) } : {}),
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        adults: s.adults,
        ...(Number.isInteger(s.rooms) && (s.rooms as number) >= 1 && (s.rooms as number) <= 9 ? { rooms: s.rooms } : {}),
      },
    }
  } catch {
    return null
  }
}

export interface RecheckNote {
  status: 'ok' | 'price_changed' | 'unavailable' | 'unchecked'
  sentence: string
  bookingUrl?: string
}

const PAGE_SENTENCE = 'Giá và tình trạng được kiểm tra trên trang nhà cung cấp khi bạn mở trang.'

/** Tap handler core (browser): payload → POST → the note to show. Never throws; a failure is "unchecked" and the booking CTA still works. */
export async function runRecheck(href: string, fetchImpl: typeof fetch = fetch): Promise<RecheckNote | null> {
  const p = parseRecheckHref(href)
  if (!p) return null
  try {
    const res = await fetchImpl('/api/booking/recheck', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: p.provider, providerItemId: p.providerItemId, title: p.title, previousPrice: p.previousPrice, currency: p.currency, stay: p.stay }),
    })
    if (!res.ok) throw new Error('http')
    const j = (await res.json()) as { status?: string; sentence?: string; bookingUrl?: string }
    const status = j.status === 'ok' || j.status === 'price_changed' || j.status === 'unavailable' ? j.status : 'unchecked'
    const sentence = typeof j.sentence === 'string' && j.sentence ? j.sentence.slice(0, 300) : PAGE_SENTENCE
    const bookingUrl = typeof j.bookingUrl === 'string' && /^https:\/\//.test(j.bookingUrl) ? j.bookingUrl : undefined
    return { status, sentence, ...(bookingUrl ? { bookingUrl } : {}) }
  } catch {
    return { status: 'unchecked', sentence: PAGE_SENTENCE }
  }
}
