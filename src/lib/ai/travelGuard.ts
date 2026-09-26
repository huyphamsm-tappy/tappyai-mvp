// ── Deterministic fail-closed guard for DYNAMIC TRAVEL FACTS (P0) ─────────────
//
// Production fabricated a fare — "Flights are typically 200k–400k VND" — with no
// tool evidence. The money guard could not catch it: it is scoped to shopping
// records and is INERT when no structured price exists (moneyGuard.ts:392-393),
// which is exactly the state of a travel turn (flights are a raw passthrough,
// hotels return snippets, and a no-tool turn has nothing at all).
//
// This guard INVERTS that contract for travel. On a travel-intent turn a dynamic
// fact — a fare/price, a specific schedule time, an availability claim — is
// SAYABLE only when it traces to structured, live evidence; absence of evidence
// means REDACT, not "allow". Prompt rules are advisory; this is the fail-closed
// boundary that runs after generation and before the bytes reach the user.
//
// Pure: no model, no network, no I/O. It reuses the money guard's currency-
// mandatory extractor and its "writes-nothing, sentence-scope" redaction so a
// travel price is judged and removed by the same audited machinery as a shopping
// price — only the VERDICT rule differs (fail-closed instead of inert).

import { extractMoneyClaims, redactUnsupportedClaims, type MoneyClaim } from './moneyGuard'

/** A live, fetched travel price in VND. Only a FETCHED_LIVE value authorizes a
 *  current-price claim — a search URL or a prose snippet never does. */
export interface TravelPriceEvidence {
  priceVnd: number
}

/** A claimed amount may round a live fare by at most this, matching money guard R1. */
const ROUNDING = 0.02

const near = (v: number, fares: number[]): boolean =>
  fares.some(f => Math.abs(v - f) <= Math.max(f * ROUNDING, 1000))

/** A money claim is grounded iff BOTH ends trace to a live VND fare. USD claims
 *  are never matchable against VND fares, so they can only be user-echoed. */
function tracesToLiveFare(c: { lo: number; hi: number; currency: string }, fares: number[]): boolean {
  if (c.currency !== 'VND' || fares.length === 0) return false
  return near(c.lo, fares) && near(c.hi, fares)
}

/** The user's own stated numbers are theirs to restate — never redact a budget
 *  the user gave ("vé dưới 500k"). Matched exactly by value+currency+shape. */
function echoesUser(c: { lo: number; hi: number; currency: string }, userClaims: ReturnType<typeof extractMoneyClaims>): boolean {
  return userClaims.some(u => u.currency === c.currency && u.lo === c.lo && u.hi === c.hi)
}

/**
 * 🚨 THE USER'S BUDGET, HANDED BACK AS THE HOTEL'S PRICE.
 *
 * MEASURED on "Khach san dep o Da Nang gan bien khoang 2 trieu": the rows
 * carried title/link/snippet and NO price field of any kind, and the reply said
 * "Gia tham khao trong tam 2 trieu VND/dem". Every number in that sentence came
 * from the question, not from the retrieval - but `echoesUser` marked it
 * VERIFIED, because echoing the user is normally exactly right.
 *
 * The amount is not the problem; the FRAMING is. "Ban dang nham ngan sach 2
 * trieu" is a constraint the reply should absolutely restate. "Gia phong khoang
 * 2 trieu" is a fact about the property that nothing retrieved supports.
 *
 * So the exemption is withdrawn for exactly one case: a sentence that
 * ATTRIBUTES the amount as a price, on a turn where no live fare exists. With
 * fares present the guard behaves exactly as before, and a budget stated as a
 * budget survives in both cases.
 */
const ATTRIBUTES_PRICE = /(gia phong|giá phòng|gia tham khao|giá tham khảo|co gia|có giá|gia khoang|giá khoảng|gia chi|giá chỉ|gia tu|giá từ|gia la|giá là|muc gia|mức giá|\/\s*(?:dem|đêm|night)|per night|room rate|priced at|costs?\b)/iu

/**
 * A user-stated budget said back AS a budget, not as the property's price.
 *
 * Deliberately EXPLICIT. "trong tầm" was here first and had to go: it means
 * only "in the range of" and sits happily inside the very attribution this
 * rescues from — the measured sentence is literally "Giá tham khảo trong tầm 2
 * triệu VND/đêm", so a vague range word let the defect through its own escape
 * hatch. What survives names the budget or names the user.
 */
const FRAMED_AS_BUDGET = /(ngan sach|ngân sách|budget|ban nham|bạn nhắm|ban muon|bạn muốn|yeu cau cua ban|yêu cầu của bạn|muc ban|mức bạn|ban dang|bạn đang)/iu

/**
 * The user-echo exemption, scoped to the sentence the amount sits in.
 *
 * Kept when the sentence frames the number as the user's budget, or makes no
 * price attribution at all. Withdrawn only for an attributed price on a turn
 * with no live fare - the measured defect.
 */
function userEchoStandsHere(
  c: { lo: number; hi: number; currency: string; start: number },
  userClaims: ReturnType<typeof extractMoneyClaims>,
  text: string,
  fares: number[],
): boolean {
  if (!echoesUser(c, userClaims)) return false
  if (fares.length > 0) return true
  const span = sentenceSpans(text).find(([a, b]) => c.start >= a && c.start < b)
  const sentence = span ? text.slice(span[0], span[1]) : text
  if (!ATTRIBUTES_PRICE.test(sentence)) return true
  return FRAMED_AS_BUDGET.test(sentence)
}

// A specific clock time asserted in a departure/arrival context, e.g. "bay lúc
// 8h", "khởi hành 8 giờ sáng", "leaves around 8 AM", "departs at 08:30". The time
// token is mandatory (a bare "sáng"/"morning" is not a schedule claim), and a
// travel/flight verb must be in the same sentence — checked per-sentence below.
// C1 (2026-09-20): a bare colon form ("22:00", "08:30") is a clock time too — the coach / rail
// snippets and the prose both write it that way; the departure context is still required.
// The unit must END the token: JS `\b` after "h" is satisfied by a following "à" (non-ASCII is
// non-word to `\b`), so "nhập thông tin 2 hành khách" read as the time "2h" and a whole
// Trip.com link line was cut (C1 live probe, 2026-09-20). A letter/digit lookahead closes that.
// E1 (2026-09-20): the Vietnamese minute forms ("10h30", "8 giờ 30", "8 giờ rưỡi") and a trailing
// period word ("5h chiều" = 17:00, "9 giờ đêm" = 21:00) — a venue's hours are written that way, and a
// guard that read "5h chiều" as 5:00 against a row's "17:00" would cut a true sentence.
const TIME_RE = /\b(?:2[0-3]|[01]?\d):[0-5]\d\b|\b(?:2[0-3]|[01]?\d)(?::[0-5]\d)?\s*(?:h(?:[0-5]\d)?|giờ(?:\s*(?:[0-5]\d|rưỡi))?|gio(?:\s*(?:[0-5]\d|ruoi))?|am|pm|a\.m\.|p\.m\.)(?:\s*(?:sáng|sang|trưa|trua|chiều|chieu|tối|toi|đêm|dem))?(?![\p{L}\p{N}])/iu
const DEPART_CTX = /\b(?:bay|chuyến bay|chuyen bay|khởi hành|khoi hanh|cất cánh|cat canh|hạ cánh|ha canh|departs?|departure|leaves?|arri(?:ves?|val)|flight)\b/iu
// C3 (2026-09-20): the SCHEDULE + TICKET unit for a venue — a screening / show time. No showtime
// provider is wired, so on a ticket turn a stated time next to one of these is unverifiable.
// No trailing `\b` after the Vietnamese words (the same Unicode-boundary trap as AVAIL_RE).
const SHOW_CTX = /(?:^|\s)(?:suất|suat|chiếu|chieu|screening|showtimes?|show)(?:\s|$|[.,:;])/iu
// Availability assertions we can never verify without a live source.
// No trailing \b after a Vietnamese noun — JS \b treats "ỗ" as a non-word char,
// so "còn 3 chỗ\b" never matches (the same Unicode-boundary trap the money guard
// documents). A leading (^|\s) keeps "con" from firing inside another word.
const AVAIL_RE = /(?:^|\s)(?:còn|con)\s+\d+\s*(?:chỗ|cho|vé|ve|ghế|ghe|phòng|phong)|(?:^|\s)(?:hết|het)\s+(?:vé|ve|phòng|phong|chỗ|cho)|\d+\s*(?:seats?|rooms?)\s+(?:left|available|remaining)|(?:sold\s*out|fully\s*booked|còn trống|con trong|hết chỗ|het cho)/iu

/** Sentence spans. The schedule/availability patterns require a flight verb or an
 *  explicit availability phrase, so a URL's digits can't masquerade as a claim. */
function sentenceSpans(text: string): Array<[number, number]> {
  const bounds = new Set<number>([0, text.length])
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') { bounds.add(i + 1); continue }
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    const next = text[i + 1]
    if (next !== undefined && !/\s/.test(next)) continue // "8.30" / "1.200.000" are not sentence ends
    bounds.add(i + 1)
  }
  const sorted = [...bounds].sort((a, b) => a - b)
  const spans: Array<[number, number]> = []
  for (let i = 0; i < sorted.length - 1; i++) spans.push([sorted[i], sorted[i + 1]])
  return spans
}

/** The clock times a text states, normalised ("8h", "08:30", "8 giờ sáng" → "8:00", "8:30"). */
export function scheduleTimesIn(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(new RegExp(TIME_RE.source, 'giu'))) {
    const t = m[0].toLowerCase()
    const hm = t.match(/(2[0-3]|[01]?\d)(?::([0-5]\d))?/)
    if (!hm) continue
    let h = parseInt(hm[1], 10)
    // Minutes: ":30", "10h30", "8 giờ 30", "8 giờ rưỡi".
    const after = t.slice(hm.index! + hm[0].length)
    const mm = hm[2] ?? after.match(/^\s*(?:h|giờ|gio)\s*([0-5]\d)/)?.[1] ?? (/rưỡi|ruoi/.test(after) ? '30' : '00')
    const min = mm.padStart(2, '0')
    if (/pm|p\.m\.|chiều|chieu|tối|toi/.test(t) && h < 12) h += 12
    else if (/đêm|dem/.test(t) && h >= 6 && h < 12) h += 12
    out.add(`${h}:${min}`)
  }
  return [...out]
}

/**
 * Remove whole sentences that assert an unverifiable schedule time or availability.
 *
 * C1 (2026-09-20): a time is VERIFIABLE when it traces to a fetched row — the coach / rail
 * snippets carry "khởi hành 22:00" — so a sentence whose every stated time is in `evidenceTimes`
 * stays; anything else is still fail-closed. Availability has no source and is always removed.
 * Writes nothing new; if removal would empty the reply, leaves it.
 */
function redactScheduleAvailability(text: string, evidenceTimes: readonly string[] = [], ctx: RegExp = DEPART_CTX): { text: string; removed: number } {
  const spans = sentenceSpans(text)
  const doomed = new Set<number>()
  const known = new Set(evidenceTimes)
  spans.forEach(([a, b], i) => {
    const s = text.slice(a, b)
    const sched = TIME_RE.test(s) && ctx.test(s) && !(known.size > 0 && scheduleTimesIn(s).every(t => known.has(t)))
    if (sched || AVAIL_RE.test(s)) doomed.add(i)
  })
  if (doomed.size === 0) return { text, removed: 0 }
  const kept = spans.filter((_, i) => !doomed.has(i)).map(([a, b]) => text.slice(a, b)).join('')
  const tidy = kept.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim()
  // If we'd leave nothing, keep the original — a monetary redaction / the prompt
  // fallback handles the "whole reply was the fabrication" case without emptiness.
  return /\p{L}/u.test(tidy) ? { text: tidy, removed: doomed.size } : { text, removed: 0 }
}

/**
 * The guard as the stream filter uses it. Runs ONLY on travel-intent turns.
 *
 * @param text   the settled reply prose
 * @param fares  live, fetched VND fares this turn (empty ⇒ every travel price is UNKNOWN)
 * @param userText  the user's own message this turn — numbers in it are never redacted
 * @param opts.unit  'travel' (default: fares, departures) or 'ticket' — C3 (2026-09-20): a venue's
 *                   SCHEDULE + TICKET unit (cinema showtimes, admission). Same fail-closed money rule;
 *                   the schedule context is a screening word and the hedge points at the venue page.
 */
export function guardTravelClaimsInText(
  text: string,
  fares: number[],
  userText: string,
  opts: { evidenceTimes?: readonly string[]; lang?: string; unit?: 'travel' | 'ticket' } = {},
): { text: string; redacted: number; enforced: boolean } {
  const ticketUnit = opts.unit === 'ticket'
  let out = text
  let redacted = 0

  // 1) Money claims — fail-closed: keep only what a live fare (or the user) backs.
  const claims = extractMoneyClaims(out)
  if (claims.length > 0) {
    const userClaims = extractMoneyClaims(userText || '')
    const judged: MoneyClaim[] = claims.map(c => ({
      ...c,
      entity: null,
      verdict: (tracesToLiveFare(c, fares) || userEchoStandsHere(c, userClaims, out, fares)) ? 'VERIFIED' : 'UNVERIFIED',
    }))
    const bad = judged.filter(j => j.verdict !== 'VERIFIED').length
    if (bad > 0) { out = redactUnsupportedClaims(out, judged); redacted += bad }
  }

  // 2) Schedule/availability — we have no live source for either, so any specific
  //    assertion on a travel turn is unverifiable and removed.
  const sa = redactScheduleAvailability(out, opts.evidenceTimes ?? [], ticketUnit ? SHOW_CTX : DEPART_CTX)
  out = sa.text; redacted += sa.removed

  // C1: what was cut is said, once, with where to look — never left as a silent gap.
  if (redacted > 0) {
    const hedge = ticketUnit
      ? (opts.lang === 'en'
        ? 'Exact showtimes and ticket prices are not confirmed by a fetched source — check them on the venue or ticket page.'
        : 'Suất chiếu và giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang rạp hoặc trang bán vé.')
      : (opts.lang === 'en'
        ? 'Exact times and fares here are not confirmed by a fetched source — check them on the booking page.'
        : 'Giờ chạy và giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang đặt vé.')
    if (!out.includes(hedge)) {
      const markerAt = (() => { let end = out.length; for (const m of ['[CTA_BUTTONS]', '[FOLLOWUPS]', '[TAPPY_PLAN]', '[TAPPY_SHOPPING]', '[TAPPY_PLACES]']) { const i = out.indexOf(m); if (i !== -1 && i < end) end = i } return end })()
      const head = out.slice(0, markerAt).replace(/\s+$/, '')
      const tail = out.slice(markerAt)
      out = `${head}${head ? '\n\n' : ''}${hedge}${tail ? `\n\n${tail}` : ''}`
    }
  }

  return { text: out, redacted, enforced: true }
}
