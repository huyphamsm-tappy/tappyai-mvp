// ── Deterministic evidence boundary for SNIPPET prices (A5) ──────────────────
//
// Food/Spa menu & service prices come only from Serper snippets
// (`price_search_results`), never a structured price field — so unlike Shopping
// there is nothing authoritative to validate against, and unlike Travel there is
// no fetched fare. The live audit found the model stating "~50.000 VND/tô" from
// such a snippet with no deterministic check at all.
//
// This is the boundary: a monetary amount in the reply must at least TRACE to a
// price that actually appeared in a retrieved snippet. A number present in NO
// snippet is fabricated (reconstructed from general knowledge or unrelated
// context) and is removed. A snippet-traceable price survives — it is weak,
// REVIEW-level evidence and the prompt frames it as "giá tham khảo", never an
// authoritative FACT — but it can never be a number the search never returned.
//
// Pure: reuses the money guard's audited currency extractor and its
// writes-nothing, sentence-scope redaction. Only the verdict rule is A5's:
// traceable-to-snippet (or user-stated) ⇒ keep; otherwise ⇒ remove.

import { extractMoneyClaims, redactUnsupportedClaims, type MoneyClaim } from './moneyGuard'

// Snippets round loosely ("khoảng 50k", "45–55k"), so allow a wider match than
// the shopping guard's 2%. Still far tighter than "any number goes".
const ROUNDING = 0.05

const near = (v: number, prices: number[]): boolean =>
  prices.some(p => Math.abs(v - p) <= Math.max(p * ROUNDING, 1000))

/** Extract the VND amounts that appear in the retrieved price snippets — the only
 *  evidence a food/spa price may trace to. Currency-mandatory, so addresses and
 *  phone numbers in the snippet text are not mistaken for prices. */
export function pricesFromSnippets(snippets: string[]): number[] {
  const out: number[] = []
  for (const s of snippets) {
    for (const c of extractMoneyClaims(s || '')) {
      if (c.currency === 'VND') { out.push(c.lo); if (c.hi !== c.lo) out.push(c.hi) }
    }
  }
  return out
}

/**
 * @param text        the settled reply prose
 * @param evidencePrices  VND amounts that appeared in retrieved snippets (empty ⇒
 *                        every stated price is unsupported and removed)
 * @param userText    the user's own message — numbers in it are never redacted
 */
export function guardSnippetPricesInText(
  text: string,
  evidencePrices: number[],
  userText: string,
): { text: string; redacted: number } {
  const claims = extractMoneyClaims(text)
  if (claims.length === 0) return { text, redacted: 0 }
  const userClaims = extractMoneyClaims(userText || '')
  const judged: MoneyClaim[] = claims.map(c => {
    const traceable = c.currency === 'VND' && near(c.lo, evidencePrices) && near(c.hi, evidencePrices)
    const userEcho = userClaims.some(u => u.currency === c.currency && u.lo === c.lo && u.hi === c.hi)
    return { ...c, entity: null, verdict: (traceable || userEcho) ? 'VERIFIED' : 'UNVERIFIED' }
  })
  const bad = judged.filter(j => j.verdict !== 'VERIFIED').length
  if (bad === 0) return { text, redacted: 0 }
  return { text: redactUnsupportedClaims(text, judged), redacted: bad }
}
