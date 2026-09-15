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

import { extractMoneyClaims, redactUnsupportedClaims, sentenceSpans, type MoneyClaim } from './moneyGuard'
import { placeTokensFor, textNamesPlace } from '@/lib/links/placeAttribution'
import { normalizeVN } from './intent'

// Snippets round loosely ("khoảng 50k", "45–55k"), so allow a wider match than
// the shopping guard's 2%. Still far tighter than "any number goes".
const ROUNDING = 0.05

/** Words that present an amount as what something COSTS, and the words that name it as a budget. */
const COST_FRAME_RE = /\btong\b|\btotal\b|\buoc tinh\b|\bestimated?\b|\bestimate\b|\bchi phi\b|\bcost\b|\bspend\b|\bcon lai\b|\bcon du\b|\bremaining\b|\bhet\b/
const BUDGET_FRAME_RE = /\bngan sach\b|\bbudget\b|\btam gia\b|\btrong khoang\b|\btoi da\b/

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
 * Which prices are evidence about WHICH place — the scope axis.
 *
 * 🚨 THE HOLE THIS CLOSES, MEASURED ON LOCALHOST 2026-09-09. The guard below
 * used to set `entity: null` and ask one question: did this number appear in
 * ANY retrieved snippet? For "bún bò ở Quận 1" the answer was yes — the snippet
 * was a listicle called "Danh sách quán bún bò Quận 1" — and the reply passed
 * with "Bún Bò Huế Đông Ba — Giá tham khảo khoảng 25.000–50.000 đồng/phần".
 * A price about a DISTRICT had become a price about a RESTAURANT, and every
 * axis the pipeline had (REVIEW_SUPPORTED, from a real snippet) said fine.
 *
 * 🔑 THIS IS THE RULE THE SHOPPING MONEY GUARD ALREADY USES. `judgeMoneyClaims`
 * attributes each claim to an entity by the sentence it sits in and returns
 * AMBIGUOUS when a sentence names 0 or >1 of them. Food/spa snippets skipped
 * that step; this restores it rather than inventing a second scheme.
 */
export interface SnippetPriceScope {
  /** placeName → the VND amounts from snippets whose own text NAMED that place. */
  byEntity: Map<string, number[]>
  /** Every place name in the batch — needed to tell that a sentence names one. */
  placeNames: string[]
}

/**
 * @param text        the settled reply prose
 * @param evidencePrices  VND amounts that appeared in retrieved snippets (empty ⇒
 *                        every stated price is unsupported and removed)
 * @param userText    the user's own message — numbers in it are never redacted
 * @param scope       optional: which snippet prices were about which place.
 *
 * 🚨 `scope` IS ADDITIVE AND FAIL-OPEN-BY-OMISSION ON PURPOSE. Omitting it
 * reproduces exactly the behaviour every shipped caller and test already relies
 * on. When it IS supplied, a sentence that NAMES one of the places may only keep
 * a price that traces to a snippet about THAT place — area-level evidence stops
 * supporting entity-level sentences, which is the whole point.
 */
export function guardSnippetPricesInText(
  text: string,
  evidencePrices: number[],
  userText: string,
  scope?: SnippetPriceScope,
): { text: string; redacted: number } {
  const claims = extractMoneyClaims(text)
  if (claims.length === 0) return { text, redacted: 0 }
  const userClaims = extractMoneyClaims(userText || '')

  // Attribute each claim to a place by the sentence it sits in — the same shape
  // `judgeMoneyClaims` uses. A sentence naming two places is a comparison, not a
  // claim about either, so it is treated as unattributed (area-level).
  const spans = scope ? sentenceSpans(text) : []
  const tokens = scope ? placeTokensFor(scope.placeNames) : []
  const namedIn = (sentence: string): string | null => {
    const named = tokens.filter(t => textNamesPlace(sentence, '', t))
    return named.length === 1 ? named[0].name : null
  }
  /**
   * 🚨 THE PRICE SENTENCE DOES NOT HAVE TO NAME THE PLACE — MEASURED.
   *
   * The production reply was two sentences:
   *
   *   "Mình chọn **Bún Bò Huế Đông Ba** cho bạn — quán này gần nhất ..."
   *   "Giá tham khảo khoảng 25.000–50.000 đồng/phần."
   *
   * The second names nobody, so pure sentence attribution calls it unattributed
   * and lets area-level evidence support it — which is precisely the claim being
   * fixed. A reader attributes that price to the restaurant named one sentence
   * earlier, and so must the guard.
   *
   * So the subject CARRIES FORWARD within a paragraph: a sentence that names no
   * place inherits the last place named before it. A blank line ends that scope,
   * because a new paragraph is where a reply stops talking about one venue.
   */
  const placeNamedAt = (pos: number): string | null => {
    const idx = spans.findIndex(([a, b]) => pos >= a && pos < b)
    if (idx < 0) return null
    const own = namedIn(text.slice(spans[idx][0], spans[idx][1]))
    if (own) return own
    const paragraphStart = text.lastIndexOf('\n\n', spans[idx][0])
    for (let i = idx - 1; i >= 0 && spans[i][0] > paragraphStart; i--) {
      const prev = namedIn(text.slice(spans[i][0], spans[i][1]))
      if (prev) return prev
    }
    return null
  }

  /**
   * 🚨 A USER NUMBER ECHOED AS A COST IS NOT THE USER'S NUMBER ANY MORE — measured
   * 2026-09-15 on the planning UAT: "budget 3 triệu" came back as "Tổng ước tính
   * 3.000.000 VND cho cả tối" under two venues with no price at all. The amount is
   * the user's, the CLAIM is not: it presents the envelope as what the evening
   * costs. So the echo exemption holds only while the sentence frames the number
   * as a budget (or frames it as nothing in particular); a sentence that frames it
   * as a total, an estimate, a spend or a remainder — and does not say budget —
   * is judged like any other claim, and with no snippet behind it, it goes.
   */
  const echoSpans = sentenceSpans(text)
  const sentenceAt = (pos: number): string => {
    const span = echoSpans.find(([a, b]) => pos >= a && pos < b)
    return span ? normalizeVN(text.slice(span[0], span[1]).toLowerCase()) : ''
  }
  const framedAsCost = (pos: number): boolean => {
    const s = sentenceAt(pos)
    return COST_FRAME_RE.test(s) && !BUDGET_FRAME_RE.test(s)
  }

  const judged: MoneyClaim[] = claims.map(c => {
    const userEcho = userClaims.some(u => u.currency === c.currency && u.lo === c.lo && u.hi === c.hi)
    if (userEcho && !framedAsCost(c.start)) return { ...c, entity: null, verdict: 'VERIFIED' as const }

    const entity = scope ? placeNamedAt(c.start) : null
    // A sentence about ONE named place may only rest on evidence about that
    // place. No entity-scoped price for it ⇒ nothing supports the sentence.
    const pool = entity ? (scope?.byEntity.get(entity) ?? []) : evidencePrices
    const traceable = c.currency === 'VND' && near(c.lo, pool) && near(c.hi, pool)
    return {
      ...c,
      entity,
      verdict: traceable ? ('VERIFIED' as const) : ('UNVERIFIED' as const),
      ...(entity && !traceable ? { reason: 'area-level evidence attributed to a named place' } : {}),
    }
  })
  const bad = judged.filter(j => j.verdict !== 'VERIFIED').length
  if (bad === 0) return { text, redacted: 0 }
  return { text: redactUnsupportedClaims(text, judged), redacted: bad }
}
