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

// A specific clock time asserted in a departure/arrival context, e.g. "bay lúc
// 8h", "khởi hành 8 giờ sáng", "leaves around 8 AM", "departs at 08:30". The time
// token is mandatory (a bare "sáng"/"morning" is not a schedule claim), and a
// travel/flight verb must be in the same sentence — checked per-sentence below.
const TIME_RE = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:h|giờ|gio|am|pm|a\.m\.|p\.m\.|giờ sáng|giờ chiều|giờ tối)\b/iu
const DEPART_CTX = /\b(?:bay|chuyến bay|chuyen bay|khởi hành|khoi hanh|cất cánh|cat canh|hạ cánh|ha canh|departs?|departure|leaves?|arri(?:ves?|val)|flight)\b/iu
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

/** Remove whole sentences that assert an unverifiable schedule time or availability.
 *  Writes nothing new; if removal would empty the reply, leaves it (money-claim
 *  redaction and the prompt still cover the common case). */
function redactScheduleAvailability(text: string): { text: string; removed: number } {
  const spans = sentenceSpans(text)
  const doomed = new Set<number>()
  spans.forEach(([a, b], i) => {
    const s = text.slice(a, b)
    const sched = TIME_RE.test(s) && DEPART_CTX.test(s)
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
 */
export function guardTravelClaimsInText(
  text: string,
  fares: number[],
  userText: string,
): { text: string; redacted: number; enforced: boolean } {
  let out = text
  let redacted = 0

  // 1) Money claims — fail-closed: keep only what a live fare (or the user) backs.
  const claims = extractMoneyClaims(out)
  if (claims.length > 0) {
    const userClaims = extractMoneyClaims(userText || '')
    const judged: MoneyClaim[] = claims.map(c => ({
      ...c,
      entity: null,
      verdict: (tracesToLiveFare(c, fares) || echoesUser(c, userClaims)) ? 'VERIFIED' : 'UNVERIFIED',
    }))
    const bad = judged.filter(j => j.verdict !== 'VERIFIED').length
    if (bad > 0) { out = redactUnsupportedClaims(out, judged); redacted += bad }
  }

  // 2) Schedule/availability — we have no live source for either, so any specific
  //    assertion on a travel turn is unverifiable and removed.
  const sa = redactScheduleAvailability(out)
  out = sa.text; redacted += sa.removed

  return { text: out, redacted, enforced: true }
}
