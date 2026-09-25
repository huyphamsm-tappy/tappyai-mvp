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

import { extractMoneyClaims, extractMoneyClaimsDetailed, redactUnsupportedClaims, sentenceSpans, proseOnly, type MoneyClaim } from './moneyGuard'
import { placeTokensFor, textNamesPlace, attributePlace, placesNamedIn, fold } from '@/lib/links/placeAttribution'
import { amountWithinBand, type PriceBand } from '@/lib/recommendation/priceBand'
import { normalizeVN } from './intent'

/**
 * F-086 (owner decision 2026-09-25, restoring 15dd7c6's prose half): 🚨 A USER NUMBER ECHOED AS A
 * COST IS NOT THE USER'S NUMBER ANY MORE. Measured 2026-09-15 on the planning UAT: "budget 3 triệu"
 * came back as "Tổng ước tính 3.000.000 VND cho cả tối" under two venues with no price at all. The
 * amount is the user's, the CLAIM is not — it presents the envelope as what the evening costs,
 * which is inventing money (same class as inventing showtimes). So the echo exemption holds only
 * while the sentence frames the number as a budget, or frames it as nothing in particular; a
 * sentence that frames it as a total / estimate / spend / remainder — and does not say budget —
 * is judged like any other claim, and with no evidence behind it, it goes. Applied at BOTH echo
 * exemptions (v1 and G2): an exemption on one path only would leave the other open.
 */
const COST_FRAME_RE = /\btong\b|\btotal\b|\buoc tinh\b|\bestimated?\b|\bestimate\b|\bchi phi\b|\bcost\b|\bspend\b|\bcon lai\b|\bcon du\b|\bremaining\b|\bhet\b/
const BUDGET_FRAME_RE = /\bngan sach\b|\bbudget\b|\btam gia\b|\btrong khoang\b|\btoi da\b/

function framedAsCost(text: string, spans: Array<[number, number]>, pos: number): boolean {
  const span = spans.find(([a, b]) => pos >= a && pos < b)
  if (!span) return false
  const sentence = normalizeVN(text.slice(span[0], span[1]).toLowerCase())
  return COST_FRAME_RE.test(sentence) && !BUDGET_FRAME_RE.test(sentence)
}

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
/** G2 options. Omitted ⇒ v1, byte-identical to every shipped caller. */
export interface SnippetPriceOptions {
  /** SNIPPET_PRICE_GUARD_V2: band evidence, identity attribution, R3′ clause cut. */
  v2?: boolean
  /** rowName → the provider's own price band (`price_range_text` / `price_range`). */
  priceBandsByEntity?: Map<string, PriceBand>
}

/** G2 telemetry — counts only, never text, never a venue name. */
export interface SnippetPriceStats {
  claims: number
  user_echo: number
  /** F-086: the user's own amount restated as a total / estimate / remainder — judged, not exempt. */
  user_echo_as_cost: number
  supported_by_band: number
  supported_by_snippet: number
  unsupported: number
  clause_cut: number
  sentences_removed: number
  lowercase_m_skipped: number
  attributed: number
  multi: number
}

export function guardSnippetPricesInText(
  text: string,
  evidencePrices: number[],
  userText: string,
  scope?: SnippetPriceScope,
  opts?: SnippetPriceOptions,
): { text: string; redacted: number; stats?: SnippetPriceStats } {
  if (opts?.v2) return guardSnippetPricesV2(text, evidencePrices, userText, scope, opts)
  const claims = extractMoneyClaims(text)
  if (claims.length === 0) return { text, redacted: 0 }
  const userClaims = extractMoneyClaims(userText || '')
  const echoSpans = userClaims.length > 0 ? sentenceSpans(text) : []

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

  const judged: MoneyClaim[] = claims.map(c => {
    const userEcho = userClaims.some(u => u.currency === c.currency && u.lo === c.lo && u.hi === c.hi)
    if (userEcho && !framedAsCost(text, echoSpans, c.start)) return { ...c, entity: null, verdict: 'VERIFIED' as const }

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

// ── G2 · SNIPPET_PRICE_GUARD_V2 ───────────────────────────────────────────────
//
// 🚨 THE MODEL WAS NOT INVENTING PRICES. Measured on the 2026-09-17 V3 capture:
// 13 of the 17 price sentences this guard removed quoted the venue's own Serper
// band (`price_range_text` "100-200 N ₫" → "giá khoảng 100-200k"). The card
// showed the band, the model copied it, and the guard — whose only evidence was
// `price_search_results` snippets — deleted the sentence, taking the true rating
// and review count beside it (R3 whole-sentence removal). Same defect as the
// place guard's `rating_value` (G1-F1), one field over.
//
// Under the flag: (Q3) the provider band is entity-level evidence and a stated
// amount must lie FULLY inside it — partial overlap is unsupported, no tolerance;
// attribution uses the G1 identity ladder + paragraph anaphora, and a comparison
// sentence checks each amount against the named venues' own bands; (Q1) R3′ — a
// clause that holds nothing but the price (+ hedge/connector) is cut instead of
// the whole sentence, only when what remains is verified, carries an
// evidence-backed fact, and passes the G1 anti-fragment rules; (Q2) metres are
// handled in the extractor for v1 and v2 alike.

/** "/người", "/phần"… after an amount: the unit of account, not a claim (owner remark 4). */
const UNIT_OF_ACCOUNT_RE = /^\s*\/\s*(?:người|nguoi|phần|phan|tô|to|suất|suat|ly|khách|khach|món|mon|pax|person|pp)(?![\p{L}])/iu
/** Words that only introduce a price. A clause whose residue is made of these (and nothing else) is price-only. */
const CONNECTOR_TOKENS = new Set(['gia', 'voi', 'khoang', 'tam', 'chung', 'chi', 'tu', 'den', 'duoi', 'tren', 'ca', 'muc', 'moi', 'la', 'around', 'about', 'from', 'only', 'price', 'prices', 'at', 'roughly', 'approximately', 'per', 'vnd', 'd'])
/** Where a price clause may START inside a sentence: punctuation, or the connector that introduces the price. */
const CLAUSE_START_RE = /[,;:—–(]|\s-\s|\s(?:với|voi|và|va|giá|gia)(?=\s)/giu
/** Where it ENDS: punctuation only — a connector after the price belongs to the NEXT clause (owner: any other content ⇒ whole sentence). */
const CLAUSE_END_RE = /[,;—–)]|\s-\s|[.!?…]\s*$|$/gu
/** An evidence-backed, non-money fact the remainder must still carry for a cut to be worth it. */
const KEPT_FACT_RE = /\d(?:[.,]\d)?\s*(?:⭐|★|sao(?![\p{L}])|\/\s*5|stars?(?![\p{L}]))|đánh giá|danh gia|reviews?(?![\p{L}])|(?<!\d)\d{1,2}[:h]\d{2}(?!\d)|(?<!\d)\d{1,2}h(?![\p{L}\d])|(?<![\p{L}])km(?![\p{L}])|\d\s?m(?![\p{L}])/iu
const DANGLING_END_RE = /(?:[,;:—–(-]|\s(?:và|va|với|voi|hoặc|hoac|nhưng|nhung|vì|vi|nên|nen|giá|gia|and|or|but|because|with|at|from))\s*[.!?…]?\s*$/iu
const HAS_LETTER = /\p{L}/u
const tidy = (s: string): string => s.replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;!?)])/g, '$1').replace(/\(\s+/g, '(').replace(/\n{3,}/g, '\n\n').trim()

/** The residue of a clause once the claim (and its unit of account) is taken out — is it connector words only? */
function priceOnlyResidue(clause: string, claimStart: number, claimEnd: number): boolean {
  const after = clause.slice(claimEnd)
  const unit = UNIT_OF_ACCOUNT_RE.exec(after)
  const residue = clause.slice(0, claimStart) + after.slice(unit ? unit[0].length : 0)
  const tokens = residue.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return tokens.every(t => CONNECTOR_TOKENS.has(fold(t.toLowerCase())))
}

/**
 * 🚨 A DELIMITER INSIDE A BOLD VENUE NAME IS NOT A CLAUSE BOUNDARY. Measured E6 2026-09-19:
 * "Mình chọn **Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm** cho nhóm bạn — …, giá khoảng
 * 100-200k/người và mở cửa cả ngày" — the price clause was opened at the " - " INSIDE the name,
 * so the cut took the name's tail and the closing `**` with it: "**Karaoke ICOOL và mở cửa cả
 * ngày". Names carry " - ", " – ", " — ", "(", "," ("Quán Ăn Ngon - Phan Bội Châu", "Nhà hàng
 * (Chi nhánh 2)"); a marker that falls inside `**…**` is skipped as a start AND as an end.
 */
function boldSpans(sentence: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const m of sentence.matchAll(/\*\*[^*\n]+\*\*/g)) out.push([m.index!, m.index! + m[0].length])
  return out
}
const insideAny = (spans: Array<[number, number]>, i: number): boolean => spans.some(([a, b]) => i > a && i < b)

/**
 * The span of `sentence` to remove for one unsupported claim, or null when no
 * price-only clause contains it. Tried innermost first: a parenthetical, then a
 * comma segment inside it, then the punctuation/connector-bounded clause.
 */
function priceClauseSpan(sentence: string, s: number, e: number): [number, number] | null {
  const bold = boldSpans(sentence)
  // 1) parenthetical
  const open = sentence.lastIndexOf('(', s)
  const close = sentence.indexOf(')', e)
  if (open !== -1 && close !== -1 && !insideAny(bold, open) && !insideAny(bold, close) && !sentence.slice(open + 1, s).includes(')') && !sentence.slice(e, close).includes('(')) {
    const inner = sentence.slice(open + 1, close)
    if (priceOnlyResidue(inner, s - open - 1, e - open - 1)) {
      let a = open; while (a > 0 && /\s/.test(sentence[a - 1])) a--
      return [a, close + 1]
    }
    // a comma segment inside the parenthetical
    const rel = s - open - 1
    const segStart = inner.lastIndexOf(',', rel) // -1 ⇒ first segment
    const segEndIdx = inner.indexOf(',', e - open - 1)
    const segEnd = segEndIdx === -1 ? inner.length : segEndIdx
    const seg = inner.slice(segStart + 1, segEnd)
    if (priceOnlyResidue(seg, rel - (segStart + 1), e - open - 1 - (segStart + 1))) {
      // take the leading comma when there is one, otherwise the trailing comma + spaces
      if (segStart !== -1) return [open + 1 + segStart, open + 1 + segEnd]
      let b = open + 1 + segEnd; if (sentence[b] === ',') { b++; while (/\s/.test(sentence[b] ?? '')) b++ }
      return [open + 1, b]
    }
    return null
  }
  // 2) sentence-level clause: the WIDEST price-only clause ending at the first end
  //    marker after the claim. Start markers are tried from the nearest outwards:
  //    "… mở đến 23h với giá khoảng 500-900k." has markers at " với" and " giá";
  //    stopping at " giá" would leave "… 23h với." dangling, so the search widens
  //    while the residue stays connector-only and stops at the first marker that
  //    would pull other content in.
  CLAUSE_END_RE.lastIndex = e
  let endM = CLAUSE_END_RE.exec(sentence)
  while (endM && endM[0].length > 0 && insideAny(bold, endM.index)) endM = CLAUSE_END_RE.exec(sentence)
  const end = endM ? endM.index : sentence.length
  const starts: Array<{ at: number; len: number }> = [{ at: 0, len: 0 }]
  for (const m of sentence.matchAll(CLAUSE_START_RE)) {
    if (m.index! >= s) break
    if (insideAny(bold, m.index!)) continue   // " - " inside **Karaoke ICOOL - Trần Não** is part of the name
    starts.push({ at: m.index!, len: m[0].length })
  }
  let chosen: { at: number; len: number } | null = null
  for (let k = starts.length - 1; k >= 0; k--) {
    const { at, len } = starts[k]
    if (!priceOnlyResidue(sentence.slice(at + len, end), s - at - len, e - at - len)) break
    chosen = starts[k]
  }
  if (!chosen) return null
  if (chosen.len > 0) return [chosen.at, end]     // remove the delimiter/connector with the clause
  // clause opens the sentence: remove it with the delimiter that follows
  let b = end; if (/[,;—–]/.test(sentence[b] ?? '')) { b++; while (/\s/.test(sentence[b] ?? '')) b++ }
  return [chosen.at, b]
}

/** G1 anti-fragment rules on a trimmed sentence (owner remark 3). */
function standsAlone(remainder: string, original: string): boolean {
  const r = tidy(remainder)
  if ((r.match(/\p{L}/gu) ?? []).length < 12) return false
  if ((r.match(/\(/g) ?? []).length !== (r.match(/\)/g) ?? []).length) return false
  if (DANGLING_END_RE.test(r)) return false
  const body = r.replace(/^[\s*_>-]+/, '')
  const origBody = original.replace(/^[\s*_>-]+/, '')
  if (/^[.,;:!?…)]/.test(body)) return false
  if (/^\p{Ll}/u.test(body) && !/^\p{Ll}/u.test(origBody)) return false
  return KEPT_FACT_RE.test(proseOnly(r))
}

function guardSnippetPricesV2(
  text: string,
  evidencePrices: number[],
  userText: string,
  scope: SnippetPriceScope | undefined,
  opts: SnippetPriceOptions,
): { text: string; redacted: number; stats: SnippetPriceStats } {
  const stats: SnippetPriceStats = { claims: 0, user_echo: 0, user_echo_as_cost: 0, supported_by_band: 0, supported_by_snippet: 0, unsupported: 0, clause_cut: 0, sentences_removed: 0, lowercase_m_skipped: 0, attributed: 0, multi: 0 }
  const { claims, lowercase_m_skipped } = extractMoneyClaimsDetailed(text)
  stats.lowercase_m_skipped = lowercase_m_skipped
  stats.claims = claims.length
  if (claims.length === 0) return { text, redacted: 0, stats }
  const userClaims = extractMoneyClaims(userText || '')
  const bands = opts.priceBandsByEntity ?? new Map<string, PriceBand>()
  const names = scope?.placeNames ?? []
  const spans = sentenceSpans(text)

  const namedIn = (sentence: string): string | null => attributePlace(proseOnly(sentence), names)?.name ?? null
  /**
   * The venue a sentence is about — its own name, else the last named in the
   * paragraph (G1 anaphora), else the reply's single subject so far.
   *
   * 🔑 THE SINGLE-SUBJECT REPLY. The model's real layout is "Mình chọn **X** …",
   * a bold rating line, an address line, then a paragraph "Quán có … Mở cửa …, giá
   * khoảng 200-600k/người." Blank lines end paragraph anaphora, so that price sat
   * unattributed and the row's own band could not support it (replay run 2 #0).
   * When every sentence before this one has named at most ONE distinct venue, the
   * reply has one subject and the sentence inherits it. A second venue named
   * anywhere earlier ends that — a comparison needs the paragraph rule.
   */
  const entityAt = (idx: number): { name: string; carried: boolean } | null => {
    const own = namedIn(text.slice(spans[idx][0], spans[idx][1]))
    if (own) return { name: own, carried: false }
    const paragraphStart = text.lastIndexOf('\n\n', spans[idx][0])
    for (let j = idx - 1; j >= 0 && spans[j][0] > paragraphStart; j--) {
      const prev = namedIn(text.slice(spans[j][0], spans[j][1]))
      if (prev) return { name: prev, carried: false }
    }
    const before = new Set<string>()
    for (let j = 0; j < idx; j++) {
      const s = proseOnly(text.slice(spans[j][0], spans[j][1]))
      const n = namedIn(s); if (n) before.add(n)
      for (const g of placesNamedIn(s, names)) before.add(g)
      if (before.size > 1) return null
    }
    // Carried across a blank line: the subject is inferred, not stated. Such a
    // sentence may also be an area remark ("Giá dịch vụ spa ở TP.HCM thường …"), so
    // when the subject's own evidence cannot support it the caller still lets the
    // area-level rule (v1's rule for an unattributed sentence) have its say.
    return before.size === 1 ? { name: [...before][0], carried: true } : null
  }
  const supportedBy = (c: { lo: number; hi: number; currency: string }, venue: string): 'band' | 'snippet' | null => {
    if (c.currency !== 'VND') return null
    const band = bands.get(venue)
    if (band && amountWithinBand(c.lo, c.hi, band)) return 'band'
    const pool = scope?.byEntity.get(venue) ?? []
    if (pool.length > 0 && near(c.lo, pool) && near(c.hi, pool)) return 'snippet'
    return null
  }

  const judged: MoneyClaim[] = claims.map(c => {
    if (userClaims.some(u => u.currency === c.currency && u.lo === c.lo && u.hi === c.hi)) {
      if (!framedAsCost(text, spans, c.start)) { stats.user_echo++; return { ...c, entity: null, verdict: 'VERIFIED' as const } }
      stats.user_echo_as_cost++
    }
    const idx = spans.findIndex(([a, b]) => c.start >= a && c.start < b)
    // A sentence that names SEVERAL venues by identity is a comparison — judged first,
    // before any anaphora could hand it the previous sentence's subject: each amount
    // may rest on any of THEIR bands/prices.
    const group = idx >= 0 ? placesNamedIn(proseOnly(text.slice(spans[idx][0], spans[idx][1])), names) : []
    if (group.length >= 2) {
      stats.multi++
      const hows = group.map(g => supportedBy(c, g)).filter(Boolean)
      if (hows.includes('band')) stats.supported_by_band++; else if (hows.length > 0) stats.supported_by_snippet++; else stats.unsupported++
      return { ...c, entity: null, verdict: hows.length > 0 ? ('VERIFIED' as const) : ('UNVERIFIED' as const) }
    }
    const subject = idx >= 0 ? entityAt(idx) : null
    if (subject) {
      stats.attributed++
      let how: 'band' | 'snippet' | null = supportedBy(c, subject.name)
      if (!how && subject.carried && c.currency === 'VND' && near(c.lo, evidencePrices) && near(c.hi, evidencePrices)) how = 'snippet'
      if (how === 'band') stats.supported_by_band++; else if (how === 'snippet') stats.supported_by_snippet++; else stats.unsupported++
      return { ...c, entity: subject.name, verdict: how ? ('VERIFIED' as const) : ('UNVERIFIED' as const), ...(how ? {} : { reason: 'no band or snippet price for the named place' }) }
    }
    // Unattributed: area-level snippet evidence only (bands are entity evidence).
    const ok = c.currency === 'VND' && near(c.lo, evidencePrices) && near(c.hi, evidencePrices)
    if (ok) stats.supported_by_snippet++; else stats.unsupported++
    return { ...c, entity: null, verdict: ok ? ('VERIFIED' as const) : ('UNVERIFIED' as const) }
  })
  const bad = judged.filter(j => j.verdict !== 'VERIFIED')
  if (bad.length === 0) return { text, redacted: 0, stats }

  // R3′: per sentence, cut price-only clauses; anything less clean ⇒ the whole sentence.
  const verifiedRaw = new Set(judged.filter(j => j.verdict === 'VERIFIED').map(j => j.raw))
  const replacement = new Map<number, string>()
  const doomed = new Set<number>()
  spans.forEach(([a, b], i) => {
    const mine = bad.filter(c => c.start >= a && c.start < b)
    if (mine.length === 0) return
    const original = text.slice(a, b)
    let work = original
    let ok = true
    for (const c of [...mine].sort((x, y) => y.start - x.start)) {
      const span = priceClauseSpan(work, c.start - a, c.end - a)
      if (!span) { ok = false; break }
      work = work.slice(0, span[0]) + work.slice(span[1])
    }
    if (ok) {
      const remainder = tidy(work)
      const leftover = extractMoneyClaims(remainder).some(c => !verifiedRaw.has(c.raw))
      ok = !leftover && standsAlone(remainder, original)
      if (ok) {
        // keep the sentence's own leading space and trailing newline(s) so the
        // paragraph structure survives ("chuẩn.Mở cửa" was the alternative)
        const lead = original.match(/^\s*/)?.[0] ?? ''
        const trail = original.match(/\s*$/)?.[0] ?? ''
        replacement.set(i, lead + remainder + trail)
        stats.clause_cut += mine.length
      }
    }
    if (!ok) doomed.add(i)
  })
  stats.sentences_removed = doomed.size
  const out = tidy(spans.map(([a, b], i) => doomed.has(i) ? '' : replacement.get(i) ?? text.slice(a, b)).join(''))
  // Never hand an unsupported price back: an emptied body is the honest result (G1b fills it downstream).
  return { text: HAS_LETTER.test(out) ? out : '', redacted: bad.length, stats }
}
