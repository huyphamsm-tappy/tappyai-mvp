// ── Local tips in a trip plan: grounded or gone (UAT3 P2, 2026-09-27) ───────────────────────────
//
// The travel planning block may carry `local_tips` — what to order at a stop, when to go, what to
// avoid. An invented local tip is the same failure as an invented showtime, and a prompt rule alone
// has not held that line before (a reworded claim passed it twice — project_food_prose_provenance),
// so every tip passes THIS deterministic check before it reaches a client:
//
//   · shape: `{ text, basis: 'tool', place }` or `{ text, basis: 'general' }`; anything else goes.
//   · basis 'tool': `place` must be a stop of THIS plan whose name was retrieved THIS turn.
//   · no digits at all — prices, hours, dates, ratings, addresses and phone numbers live on the
//     stops, where their own guards judge them; a tip is advice, not a number.
//   · no fact words that need evidence: price, opening hours, showtimes, tickets, ratings, and
//     quality superlatives ("ngon nhất", "tươi sống nhất").
//   · a 'general' tip may not name a venue ("quán Bà Ba", "hẻm 102"); a 'tool' tip may name only
//     its own stop. Advice about a specific place needs that place in the plan.
//   · at most 4; none left ⇒ the field is removed (the card then shows no tips section).
//
// Deterministic, no model call, no network. Edits the PARSED plan and re-serializes, the same way
// `guardPlanPrices` and `injectPlanPhotos` do — never string-splices JSON.

import { normalizeVN } from './intent'

export const MAX_LOCAL_TIPS = 4
const MIN_TIP = 12
const MAX_TIP = 220

export type LocalTip = { text: string; basis: 'tool'; place: string } | { text: string; basis: 'general' }

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim()

// 🚨 Matched on the ORIGINAL text (NFC, lowercased), never on folded text: folding merges words
// with different senses — `giá` (price) / `gia` (gia đình), `quán` (eatery) / `quận` (district),
// `sạp` (stall) / `sắp` (soon). And a word boundary does not work next to a Vietnamese letter,
// so the boundaries are explicit letter look-arounds.
const bounded = (words: string[]) => new RegExp(String.raw`(?<!\p{L})(?:${words.join('|')})(?!\p{L})`, 'u')
const nfc = (s: string) => s.normalize('NFC').toLowerCase()

/** Claims a tip may not make: each needs evidence a tip does not carry. */
const FACT_WORDS = bounded([
  'giá', 'giá vé', 'nghìn', 'ngàn', 'triệu', 'mở cửa', 'đóng cửa', 'giờ mở', 'suất chiếu', 'lịch chiếu', 'còn vé', 'hết vé', 'đặt vé', 'đánh giá',
  'rating', 'price', 'prices', 'cost', 'costs', 'opens', 'closes', 'closed', 'opening hours', 'showtime', 'showtimes', 'ticket', 'tickets', 'review', 'reviews',
  // Quality superlatives are claims about a place nobody measured (golden uat3-tips-after: "tươi sống nhất").
  'ngon nhất', 'tươi nhất', 'tươi sống nhất', 'rẻ nhất', 'nổi tiếng nhất', 'chuẩn nhất', 'đỉnh nhất', 'best', 'cheapest', 'most famous', 'freshest',
])

/** A venue noun followed by a Capitalised name = the tip names a specific place. */
const VENUE_NOUNS = ['quán', 'tiệm', 'nhà hàng', 'hẻm', 'khách sạn', 'resort', 'homestay', 'cafe', 'cà phê', 'xe đẩy', 'sạp', 'restaurant', 'stall', 'alley', 'hotel']

/** The capitalised names that follow a venue noun in `text`, each as folded text. */
export function namedVenues(text: string): string[] {
  const words = text.normalize('NFC').split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    for (const noun of VENUE_NOUNS) {
      const n = noun.split(' ').length
      if (nfc(words.slice(i, i + n).join(' ').replace(/[^\p{L}\s]/gu, '')) !== noun) continue
      const run: string[] = []
      for (let j = i + n; j < words.length && /^[\p{Lu}\p{N}]/u.test(words[j]); j++) run.push(words[j].replace(/[^\p{L}\p{N}]/gu, ''))
      if (run.length) out.push(fold(run.join(' ')))
    }
  }
  return out
}

/** Why a tip is dropped, or null when it stays. Exported for tests. */
export function tipRejection(tip: unknown, stops: string[], retrieved: Set<string>): string | null {
  if (!tip || typeof tip !== 'object') return 'shape'
  const t = tip as Record<string, unknown>
  if (typeof t.text !== 'string') return 'shape'
  const text = t.text.trim()
  if (text.length < MIN_TIP || text.length > MAX_TIP) return 'length'
  if (t.basis !== 'tool' && t.basis !== 'general') return 'basis'
  if (/\d/.test(text)) return 'number'
  if (FACT_WORDS.test(nfc(text))) return 'fact'
  const venues = namedVenues(text)
  if (t.basis === 'general') return venues.length ? 'venue' : null
  const place = typeof t.place === 'string' ? fold(t.place) : ''
  if (!place || !stops.includes(place) || !retrieved.has(place)) return 'place'
  if (venues.some(v => !place.includes(v))) return 'venue'
  return null
}

/**
 * Validates `local_tips` inside the `[TAPPY_PLAN]` block of `fullText`. `retrievedNames` are the
 * place names the tools returned this turn. Returns the text unchanged when there is no block, it
 * does not parse, or it has no tips.
 */
export function guardPlanLocalTips(fullText: string, retrievedNames: string[]): { text: string; kept: number; dropped: number; reasons: string[] } {
  const open = '[TAPPY_PLAN]'
  const close = '[/TAPPY_PLAN]'
  const start = fullText.indexOf(open)
  const end = fullText.indexOf(close)
  const none = { text: fullText, kept: 0, dropped: 0, reasons: [] as string[] }
  if (start === -1 || end === -1 || end < start) return none
  let plan: Record<string, unknown>
  try { plan = JSON.parse(fullText.slice(start + open.length, end).trim()) } catch { return none }
  if (!plan || typeof plan !== 'object' || !('local_tips' in plan)) return none

  const stops: string[] = []
  for (const day of (Array.isArray(plan.days) ? plan.days : []) as Array<{ items?: Array<{ name?: unknown }> }>) {
    for (const item of day?.items ?? []) if (typeof item?.name === 'string') stops.push(fold(item.name))
  }
  const retrieved = new Set(retrievedNames.filter(n => typeof n === 'string').map(fold))
  const wasArray = Array.isArray(plan.local_tips)
  const raw: unknown[] = wasArray ? (plan.local_tips as unknown[]) : []
  const kept: LocalTip[] = []
  const reasons: string[] = []
  for (const tip of raw) {
    const why = tipRejection(tip, stops, retrieved)
    if (why) { reasons.push(why); continue }
    if (kept.length >= MAX_LOCAL_TIPS) { reasons.push('cap'); continue }
    const t = tip as Record<string, string>
    kept.push(t.basis === 'tool' ? { text: t.text.trim(), basis: 'tool', place: t.place } : { text: t.text.trim(), basis: 'general' })
  }
  if (kept.length) plan.local_tips = kept
  else delete plan.local_tips
  const dropped = wasArray ? raw.length - kept.length : 1
  const block = `${open}\n${JSON.stringify(plan)}\n${close}`
  return { text: fullText.slice(0, start) + block + fullText.slice(end + close.length), kept: kept.length, dropped, reasons }
}
