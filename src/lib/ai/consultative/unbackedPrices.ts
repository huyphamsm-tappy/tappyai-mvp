// ── One brain · a shopping price no tool carried is LABELLED, not shown as fact and not cut (30/10/2026) ────────────────────────
//
// In one brain the shopping money step runs in shadow mode (it logs what it would cut and keeps the text), so an invented price reached the person
// unchanged. Cutting the sentence is what the owner ruled out (a valid answer must not lose its useful remainder). This replaces ONLY the figure with a
// label ("chưa xác minh"): the product name, the bullet, the table row and the rest of the line stay.
//
// A figure is backed when it is within PRICE_EVIDENCE_TOLERANCE of any number a tool result carried this turn (listing prices, page figures, calculator
// results) or of the sum or the difference of two of them (the model's own arithmetic: "chênh nhau 7,5 triệu"). The person's own amounts are in the
// evidence list too. Links, machine blocks and foreign-currency figures are not judged. Known limit: a wrong price within the tolerance of a real one
// passes. Pure; no words.

import { extractMoneyClaims, labelUnsupportedAmounts } from '../moneyGuard'

/** A figure may differ from the evidence by at most this share (the R1 rounding policy is 2%; 5% leaves room for "khoảng 17 triệu" beside 17,49 triệu). */
export const PRICE_EVIDENCE_TOLERANCE = 0.05
/** Evidence values that are not money (a year, a count, a rating) are small: only amounts from 1.000 up are evidence. */
const MIN_EVIDENCE = 1000
const MAX_PAIRWISE = 120

const near = (v: number, e: number): boolean => e > 0 && Math.abs(v - e) <= PRICE_EVIDENCE_TOLERANCE * e

export function labelUnbackedPrices(text: string, evidence: readonly number[], label: string): { text: string; labelled: number; claims: number } {
  const values = [...new Set(evidence.filter(n => Number.isFinite(n) && n >= MIN_EVIDENCE).map(n => Math.round(n)))]
  const pair = values.slice(0, MAX_PAIRWISE)
  const derived: number[] = []
  for (let i = 0; i < pair.length; i++) for (let j = i + 1; j < pair.length; j++) derived.push(pair[i] + pair[j], Math.abs(pair[i] - pair[j]))
  const backed = (v: number): boolean => values.some(e => near(v, e)) || derived.some(e => near(v, e))
  const claims = extractMoneyClaims(text).filter(c => c.currency === 'VND')
  const judged = claims.map(c => ({ start: c.start, end: c.end, verdict: backed(c.lo) && backed(c.hi) ? 'VERIFIED' : 'UNSUPPORTED' }))
  const labelled = judged.filter(c => c.verdict !== 'VERIFIED').length
  if (labelled === 0) return { text, labelled: 0, claims: claims.length }
  return { text: labelUnsupportedAmounts(text, judged, label), labelled, claims: claims.length }
}
