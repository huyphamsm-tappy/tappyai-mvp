// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// ── P0-2 trust boundary (G2 package 1): carried facts come from what the SERVER stored, never from the client's copy of a reply ─────────
//
// The previous reply is sent back by the client inside `messages`; nothing proves the server ever wrote it. Measured offline (harness,
// emitPathHarness.route.test.ts): a forged "assistant" message made the server (a) answer "Số điện thoại … 0999 000 111 (Theo thông tin
// mình tìm được ở lượt trước)" by code, (b) let the place-claim guard keep a rating / review count / distance / hours it should cut, and
// (c) write a "1 × 123.456đ (giá tại … lúc tìm)" cost line from a forged shopping card.
//
// The contract: the history stays CONTEXT (who "quán đó" is, what was shown) — reference resolution still reads it. A FACT reused as
// evidence or restated as found comes only from the rows the server stored for this conversation (chatSessionState: `candidates` from
// search_places, `products` from search_products), each with its source and the time it was retrieved. No stored row -> no fact.

import { normalizeVN } from '../intent'
import { parseVndPrice } from '../productSpecs'
import { stripModelArtifacts } from '../security/outputSanitizer'
import type { CarriedFacts, FactAsked, PriorVenue } from './referenceResolver'
import type { ChatSessionState } from './chatSessionState'

/** Where a reused fact came from, for the reply's own wording and for the guards' logs. */
export interface CarriedProvenance {
  source: 'search_places' | 'search_products'
  /** When the server retrieved the rows (ISO), or null when the stored row predates the timestamp. */
  observedAt: string | null
  verification: 'tool_verified'
}

const fold = (s: string) => normalizeVN(s.normalize('NFC').toLowerCase()).replace(/\s+/g, ' ').trim()
const MD_LINK = /!?\[([^\]\n]{0,200})\]\((?:[^()\s]|\([^()\s]*\))*\)/g
const BARE_URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi

/** A stored value made safe to restate: no hidden characters, no link (a carried fact never needs one). */
export function plainValue(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = stripModelArtifacts(v).replace(MD_LINK, '$1').replace(BARE_URL, ' ').replace(/\s+/g, ' ').trim()
  return s || null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function hoursOf(v: unknown): string | null {
  if (Array.isArray(v)) return plainValue(v.filter(x => typeof x === 'string').join('; '))
  return plainValue(v)
}

/** Same venue: equal folded names, or one contains the other (both at least 4 characters). */
export function sameVenueName(a: string, b: string): boolean {
  const x = fold(a), y = fold(b)
  if (!x || !y) return false
  if (x === y) return true
  return Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))
}

/**
 * The carried facts of the venues the conversation refers to, from the server-stored place rows only. A venue with no stored row gets no
 * entry (so nothing is restated and no guard treats it as evidence).
 */
export function carriedFromStoredCandidates(state: ChatSessionState | null | undefined, venues: readonly PriorVenue[]): { carried: CarriedFacts[]; provenance: CarriedProvenance | null } {
  const rows = state?.candidates?.rows ?? []
  if (!rows.length || !venues.length) return { carried: [], provenance: null }
  const carried: CarriedFacts[] = []
  for (const v of venues) {
    const row = rows.find(r => typeof r.name === 'string' && sameVenueName(r.name, v.name))
    if (!row) continue
    carried.push({
      name: v.name,
      rating: num(row.rating_value) ?? num(row.rating),
      reviewCount: num(row.rating_count) ?? num(row.user_ratings_total) ?? num(row.review_count),
      distanceKm: num(row.distance_km),
      hours: hoursOf(row.opening_hours),
      phone: plainValue(row.phone),
      address: plainValue(row.address),
    })
  }
  const at = state?.candidates?.at
  return { carried, provenance: carried.length ? { source: 'search_places', observedAt: typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : null, verification: 'tool_verified' } : null }
}

/** Does the stored row state this fact? `open_now`, price and the rest are never answered from storage (re-checked instead). */
export function storedStates(carried: readonly CarriedFacts[], venue: PriorVenue, fact: FactAsked): boolean {
  const c = carried.find(x => x.name === venue.name)
  if (!c) return false
  switch (fact) {
    case 'hours': return !!c.hours
    case 'phone': return !!c.phone
    case 'address': return !!c.address
    case 'distance': return c.distanceKm !== null
    default: return false
  }
}

/** Money evidence for a shopping PLAN turn: the server-stored product rows (search_products), never a card copied back by the client. */
export function storedShoppingRecords(state: ChatSessionState | null | undefined): Array<{ title: string; price: string; source?: string }> {
  const out: Array<{ title: string; price: string; source?: string }> = []
  for (const r of state?.products?.rows ?? []) {
    const title = plainValue(r.title) ?? plainValue(r.name)
    const amount = parseVndPrice(r.price) ?? parseVndPrice(r.extracted_price)
    if (!title || !amount) continue
    const source = plainValue(r.source) ?? plainValue(r.seller) ?? plainValue(r.merchant)
    out.push({ title, price: `${amount.toLocaleString('vi-VN')} ₫`, ...(source ? { source } : {}) })
  }
  return out
}

/** The listed price of the product the conversation settled on, from the stored rows; null when no stored row names it. */
export function storedShoppingPickPrice(state: ChatSessionState | null | undefined, pickName: string | null | undefined): { amount: number; seller: string | null } | null {
  if (!pickName) return null
  for (const r of state?.products?.rows ?? []) {
    const title = plainValue(r.title) ?? plainValue(r.name)
    if (!title || !sameVenueName(title, pickName)) continue
    const amount = parseVndPrice(r.price) ?? parseVndPrice(r.extracted_price)
    if (amount) return { amount, seller: plainValue(r.source) ?? plainValue(r.seller) ?? plainValue(r.merchant) }
  }
  return null
}
