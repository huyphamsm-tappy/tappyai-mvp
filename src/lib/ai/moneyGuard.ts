// ── Deterministic money-claim guard (C3-B.10) ────────────────────────────────
//
// Three phases of measurement established that the model asserts a price
// whenever it believes one is expected, regardless of the evidence:
//
//   C3-B.5  prompt rule "say you did not find a price"   → fired 0/9
//   C3-B.6  payload signal `price_evidence: NOT_VERIFIED` → fabrication 6 → 9
//   C3-B.7  removing the contaminated evidence entirely   → still claimed "~7-8M"
//
// So the claim is checked after generation instead of asked for beforehand.
// C3-B.9 proved this works on same-turn structured evidence: 0 false accepts,
// 0 accessory false accepts, 0 variant false accepts over 16 claims.
//
// No model, no network, no I/O — a pure function over text + tool records.

export type ClaimVerdict = 'VERIFIED' | 'UNVERIFIED' | 'ACCESSORY' | 'AMBIGUOUS'

/** One record as it arrives from the shopping tool. `price` is AUTHORITATIVE. */
export interface EvidenceRecord {
  title?: string
  /** Structured price string, e.g. "6.490.000 ₫". Never parsed out of title/snippet. */
  price?: string
  source?: string
  link?: string
}

export interface MoneyClaim {
  raw: string
  kind: 'single' | 'range'
  lo: number
  hi: number
  currency: 'VND' | 'USD'
  start: number
  end: number
  verdict: ClaimVerdict
  entity: string | null
  reason?: string
}

/** POLICY R1 — a claim may round a structured price by at most this much. */
export const ROUNDING_TOLERANCE = 0.02

const strip = (s: string): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

// Blocks that are machine-read, plus links — every one of them carries digits
// that are not prices (marketplace ids, query strings, plan prices already
// rendered elsewhere). Parsing them would invent claims out of markup.
//
// ONE pattern, used by both proseOnly() and the extractor. They were separate
// copies at first, which meant a mutation removing the URL rule from one left
// the other still guarding — the test passed while the code was wrong.
const NON_PROSE_RE =
  /\[CTA_BUTTONS\][\s\S]*?(?:\[\/CTA_BUTTONS\]|$)|\[FOLLOWUPS\][\s\S]*?(?:\[\/FOLLOWUPS\]|$)|\[TAPPY_PLAN\][\s\S]*?(?:\[\/TAPPY_PLAN\]|$)|!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g

export function proseOnly(text: string): string {
  return text.replace(NON_PROSE_RE, ' ')
}

/** Same removal, but length-preserving so claim offsets stay valid. */
function maskNonProse(text: string): string {
  return text.replace(NON_PROSE_RE, (m) => ' '.repeat(m.length))
}

// A currency unit is MANDATORY: a bare number is never a money claim. That one
// rule is what keeps "iPhone 15", "128GB", "4.8 sao", "40 giờ", "2026", "50%"
// and "5G" out. JS \b is ASCII-only and treats Vietnamese "à" as a non-word
// character, so "2 màu" matched `M\b` as 2 million — every unit boundary is a
// Unicode lookahead instead.
// P0 2026-08-28 — "đồng" spelled out. `đ` was already here, so the engine matched the "đ" of
// "đồng" and then the mandatory boundary above saw "ồ" and threw the match away; no other
// alternative could match the word, so "40.000 - 60.000 đồng/tô" was invisible and an invented
// price reached production. Ten other money forms were probed and already seen — even "1,2 triệu
// đồng", via "triệu" — which is why reading this line was not enough to notice.
//
// It cannot simply be added, because "đồng" also opens compounds and proper nouns that follow a
// number in perfectly correct replies:
//
//   "5 đồng hồ Casio"        a watch — the shopping vocabulary itself
//   "20 Đồng Khởi, Quận 1"   a street number, in every places reply that prints an address
//
// and a false claim is not harmless: the guard REMOVES the sentence carrying it, so a careless
// widening deletes addresses and product names from correct answers.
//
// What separates them is the shape of the AMOUNT, not the word: a VND price is written in
// thousands ("40.000", "500.000"), while a street number or a count is bare ("20", "5"). So the
// word counts as a unit only behind a grouped number. Case cannot be used for this — these
// patterns carry the `i` flag, which makes `\p{Lu}` match lowercase too, so a "next word is
// capitalised" rule would silently match everything. The one compound that does take a grouped
// number ("3.000 đồng hồ") is excluded by name.
const DONG = '(?<=[.,]\\d{3}\\s*)(?:đồng|dong)(?!\\s*(?:hồ|ho|phục|phuc)(?![\\p{L}]))'
const UNIT_ALT = `triệu|trieu|tr|million|M|k|nghìn|nghin|ngàn|ngan|₫|${DONG}|đ|VNĐ|VND|USD|dollars?`
const UNIT = `(${UNIT_ALT})(?![\\p{L}\\d])`
const NUM = '(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d{1,2})?)'
const RANGE_RE = new RegExp(`${NUM}\\s*[–—-]\\s*${NUM}\\s*${UNIT}`, 'giu')
const SINGLE_RE = new RegExp(`${NUM}\\s*${UNIT}`, 'giu')
// C3-B.10.2 / F1 — a currency symbol can come BEFORE the number: Shopee itself
// renders "₫6.490.000". Handling only the suffix form left prefix prices
// invisible to the guard, so they could never be redacted and reached the user.
const PREFIX_UNIT = '(₫|VNĐ|VND|US\\$|\\$)'
const PREFIX_RE = new RegExp(`${PREFIX_UNIT}\\s*${NUM}`, 'giu')

const SCALE: Record<string, number> = {
  'triệu': 1e6, trieu: 1e6, tr: 1e6, million: 1e6, m: 1e6,
  k: 1e3, 'nghìn': 1e3, nghin: 1e3, 'ngàn': 1e3, ngan: 1e3,
}
const unitScale = (u: string): number => SCALE[u.toLowerCase().trim()] ?? 1
const isUSD = (u: string): boolean => /usd|dollar|[$]/i.test(u)

/** "7.790.000" → 7790000 · "7,5"/"7.5" with a scale unit → 7.5 */
function toNumber(raw: string, hasScaleUnit: boolean): number {
  const seps = raw.match(/[.,]/g) || []
  if (seps.length >= 2) return parseFloat(raw.replace(/[.,]/g, ''))
  if (seps.length === 1) {
    const frac = raw.split(/[.,]/)[1]
    if (frac.length === 3 && !hasScaleUnit) return parseFloat(raw.replace(/[.,]/g, ''))
    return parseFloat(raw.replace(',', '.'))
  }
  return parseFloat(raw)
}

/** Every monetary claim in the prose, with its offsets in the ORIGINAL text. */
export function extractMoneyClaims(text: string): Array<Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>> {
  // Blank the machine blocks in place so offsets stay aligned with `text`.
  const masked = maskNonProse(text)
  const out: Array<Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>> = []
  for (const m of masked.matchAll(RANGE_RE)) {
    const unit = m[3]
    const scale = unitScale(unit)
    out.push({
      raw: m[0].trim(), kind: 'range',
      lo: toNumber(m[1], scale > 1) * scale, hi: toNumber(m[2], scale > 1) * scale,
      currency: isUSD(unit) ? 'USD' : 'VND', start: m.index!, end: m.index! + m[0].length,
    })
  }
  const overlaps = (i: number) => out.some(c => i >= c.start && i < c.end)
  // Prefix form first, so "₫7,500,000" is claimed as a whole before the suffix
  // pass could see the bare number.
  for (const m of masked.matchAll(PREFIX_RE)) {
    if (overlaps(m.index!)) continue
    const unit = m[1]
    const v = toNumber(m[2], false)
    out.push({
      raw: m[0].trim(), kind: 'single', lo: v, hi: v,
      currency: isUSD(unit) ? 'USD' : 'VND', start: m.index!, end: m.index! + m[0].length,
    })
  }
  for (const m of masked.matchAll(SINGLE_RE)) {
    if (overlaps(m.index!)) continue
    const unit = m[2]
    const scale = unitScale(unit)
    const v = toNumber(m[1], scale > 1) * scale
    out.push({
      raw: m[0].trim(), kind: 'single', lo: v, hi: v,
      currency: isUSD(unit) ? 'USD' : 'VND', start: m.index!, end: m.index! + m[0].length,
    })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** The structured price of a record, in VND. Never read from title/snippet. */
export function structuredPrice(rec: EvidenceRecord): number | null {
  if (!rec.price) return null
  const digits = String(rec.price).replace(/\D/g, '')
  if (digits.length < 4) return null
  return parseInt(digits, 10)
}

// Nouns that make a listing an accessory FOR something, rather than the thing.
const ACCESSORY_RE = /\b(op lung|op |dem tai|dem |mieng dem|cap |day |hop dung|tui |bao da|mieng dan|kinh cuong luc|gia do|ban le|dau tai|nut tai|foam|case|cover|pouch|pad|cushion|cable|charger|adapter|protector|skin|strap|stand|holder|phu kien|thay the|replacement|phim bao ve)\b/
/** Suffixes that make a record a DIFFERENT product from the bare model name.
 *  "+" is matched on its own: `\b\+\b` can never fire, because "+" is not a
 *  word character — which let "Galaxy S24+" pass as an exact "Galaxy S24". */
const VARIANT_RE = /\b(ultra|plus|pro|max|fe|mini|se|earbuds|headphones?|gen ?2|2nd|\d+tb)\b|\+/g
/** Words the model appends to a query that are not part of the product name. */
const QUERY_NOISE = /\b(price|prices|gia|giá|cost|vietnam|viet nam|vn|mua|buy|where|o dau|ở đâu|best|latest|moi nhat|chinh hang|good|tot|bao nhieu)\b/g

/** The product the request is actually about — derived from the tool query. */
export function requestedEntity(toolQuery: string): string {
  return strip(toolQuery).replace(QUERY_NOISE, ' ').replace(/\s+/g, ' ').trim()
}

const entityTokens = (entity: string): string[] =>
  strip(entity).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !['tai', 'nghe', 'dien', 'thoai', 'cho', 'san', 'pham'].includes(w))

export type Identity = 'EXACT_PRODUCT' | 'VARIANT' | 'ACCESSORY' | 'UNRELATED' | 'AMBIGUOUS'

/**
 * Which product a record is, relative to what was requested.
 *
 * POLICY R4: when the REQUEST is itself for an accessory ("đệm tai cho
 * WH-1000XM5"), accessory records are the exact thing asked for — a generic
 * "accessory ⇒ not the product" rule wrongly redacts a correct answer, which
 * C3-B.9 observed on T5. Decided from the request wording, never from price.
 *
 * POLICY R5: variants are never collapsed. S24 ≠ S24+ ≠ S24 FE ≠ S24 Ultra.
 */
export function classifyIdentity(entity: string, rec: EvidenceRecord): Identity {
  const title = strip(rec.title ?? '')
  if (!title) return 'AMBIGUOUS'
  const entityIsAccessory = ACCESSORY_RE.test(strip(entity))
  const recordIsAccessory = ACCESSORY_RE.test(title)
  if (recordIsAccessory && !entityIsAccessory) return 'ACCESSORY'
  if (entityIsAccessory && !recordIsAccessory) return 'UNRELATED'

  const need = entityTokens(entity)
  if (need.length === 0) return 'AMBIGUOUS'
  const present = need.filter(w => title.includes(w))
  const requestedVariants = new Set(strip(entity).match(VARIANT_RE) ?? [])
  const extraVariant = (title.match(VARIANT_RE) ?? []).filter(v => !requestedVariants.has(v))
  if (present.length === need.length) return extraVariant.length > 0 ? 'VARIANT' : 'EXACT_PRODUCT'
  const mostSpecific = need[need.length - 1]
  if (mostSpecific && title.includes(mostSpecific)) return 'VARIANT'
  return 'UNRELATED'
}

/** POLICY R1 — equal, or within ±2% of a structured price. */
const withinTolerance = (claimed: number, evidence: number): boolean =>
  claimed === evidence || Math.abs(claimed - evidence) <= evidence * ROUNDING_TOLERANCE

interface Judgement { verdict: ClaimVerdict; reason?: string }

function judge(
  claim: Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>,
  entity: string,
  records: EvidenceRecord[],
  verifiedValues: number[],
): Judgement {
  const priced = records
    .map(r => ({ rec: r, vnd: structuredPrice(r), id: classifyIdentity(entity, r) }))
    .filter((r): r is { rec: EvidenceRecord; vnd: number; id: Identity } => r.vnd !== null)

  // POLICY R2 — a derived difference is verifiable only when BOTH operands are
  // already verified. Never used to turn an unsupported price into a verified one.
  if (claim.kind === 'single' && verifiedValues.length >= 2) {
    for (let i = 0; i < verifiedValues.length; i++) {
      for (let j = 0; j < verifiedValues.length; j++) {
        if (i === j) continue
        const diff = Math.abs(verifiedValues[i] - verifiedValues[j])
        if (diff > 0 && withinTolerance(claim.lo, diff)) {
          return { verdict: 'VERIFIED', reason: 'derived difference of two verified prices' }
        }
      }
    }
  }

  const matches = (v: number) => priced.filter(p => withinTolerance(v, p.vnd))
  const exact = (v: number) => matches(v).filter(p => p.id === 'EXACT_PRODUCT')

  if (claim.kind === 'range') {
    // POLICY R1 — a range needs BOTH endpoints supported. One endpoint is never enough.
    if (exact(claim.lo).length > 0 && exact(claim.hi).length > 0) return { verdict: 'VERIFIED' }
    const anyAcc = [...matches(claim.lo), ...matches(claim.hi)].filter(p => p.id === 'ACCESSORY')
    if (anyAcc.length > 0) return { verdict: 'ACCESSORY', reason: anyAcc[0].rec.title }
    const anyVar = [...matches(claim.lo), ...matches(claim.hi)].filter(p => p.id === 'VARIANT')
    if (anyVar.length > 0) return { verdict: 'AMBIGUOUS', reason: `variant-only match: ${anyVar[0].rec.title ?? ''}` }
    return { verdict: 'UNVERIFIED', reason: 'range endpoints not both supported' }
  }

  const hits = matches(claim.lo)
  if (hits.some(p => p.id === 'EXACT_PRODUCT')) return { verdict: 'VERIFIED' }
  if (hits.length > 0 && hits.every(p => p.id === 'ACCESSORY')) {
    return { verdict: 'ACCESSORY', reason: hits[0].rec.title }
  }
  if (hits.some(p => p.id === 'VARIANT')) {
    return { verdict: 'AMBIGUOUS', reason: `variant-only match: ${hits.find(p => p.id === 'VARIANT')!.rec.title ?? ''}` }
  }
  return { verdict: 'UNVERIFIED' }
}

/**
 * Judge every monetary claim in `text` against `records`.
 *
 * `entities` are the product terms actually requested — in production the
 * search_products query arguments, one per tool call.
 */
export function judgeMoneyClaims(text: string, records: EvidenceRecord[], entities: string[]): MoneyClaim[] {
  const found = extractMoneyClaims(text)
  if (found.length === 0) return []
  const usable = entities.map(requestedEntity).filter(Boolean)
  if (usable.length === 0) {
    return found.map(c => ({ ...c, verdict: 'AMBIGUOUS' as const, entity: null, reason: 'no requested entity available' }))
  }

  // Attribute each claim to an entity by the sentence it sits in. A
  // single-entity turn has only one thing a price can refer to.
  const sentenceOf = (pos: number): string => {
    const start = Math.max(text.lastIndexOf('.', pos), text.lastIndexOf('\n', pos), text.lastIndexOf('!', pos), text.lastIndexOf('?', pos)) + 1
    let end = text.length
    for (const ch of ['.', '\n', '!', '?']) {
      const i = text.indexOf(ch, pos)
      if (i !== -1 && i < end) end = i
    }
    return text.slice(start, end)
  }

  // Two passes: the first establishes which values are verified, so POLICY R2
  // can check a derived difference against them in the second.
  const attribute = (pos: number): string | null => {
    if (usable.length === 1) return usable[0]
    const s = strip(sentenceOf(pos))
    const named = usable.filter(e => entityTokens(e).every(w => s.includes(w)))
    if (named.length === 1) return named[0]
    if (named.length > 1) return null
    const loose = usable.filter(e => { const tk = entityTokens(e); return tk.length > 0 && s.includes(tk[tk.length - 1]) })
    return loose.length === 1 ? loose[0] : null
  }

  const first = found.map(c => {
    const entity = attribute(c.start)
    if (!entity) return { ...c, verdict: 'AMBIGUOUS' as const, entity: null, reason: 'attribution: 0 or >1 requested entity in sentence' }
    const j = judge(c, entity, records, [])
    return { ...c, entity, ...j }
  })
  const verifiedValues = first.filter(c => c.verdict === 'VERIFIED').flatMap(c => c.kind === 'range' ? [c.lo, c.hi] : [c.lo])

  return first.map(c => {
    if (c.verdict !== 'UNVERIFIED' || !c.entity) return c
    const j = judge(c, c.entity, records, verifiedValues)
    return { ...c, ...j }
  })
}

/**
 * POLICY R3 — remove only the unsupported monetary assertion.
 *
 * Never substitutes a value, never softens a claim, never writes a new
 * sentence: every output character comes from the input. Removal is attempted
 * at the smallest scope first (the clause containing the amount), falling back
 * to the whole sentence when the clause cannot be dropped cleanly.
 */
const HAS_LETTER = /\p{L}/u
/** Hedges that only exist to introduce the amount, so they go with it. */
const HEDGE_BEFORE = /(?:\b(?:khoảng|tầm|chừng|cỡ|độ|around|about|approximately|roughly|only|chỉ|từ|from)\b|~)\s*$/iu

/** Spans that are machine payload, not prose — never removed, never split on. */
function protectedSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const m of text.matchAll(NON_PROSE_RE)) spans.push([m.index!, m.index! + m[0].length])
  return spans
}

/** Sentence spans, bounded so a sentence can never swallow a machine block. */
export function sentenceSpans(text: string): Array<[number, number]> {
  const prot = protectedSpans(text)
  const inProtected = (i: number) => prot.some(([a, b]) => i >= a && i < b)
  const bounds = new Set<number>([0, text.length])
  for (const [a, b] of prot) { bounds.add(a); bounds.add(b) }
  for (let i = 0; i < text.length; i++) {
    if (inProtected(i)) continue
    if (text[i] === '\n') { bounds.add(i + 1); continue }
    if (text[i] !== '.' && text[i] !== '!' && text[i] !== '?') continue
    // A '.' inside a number is a thousands separator, not a sentence end.
    // Splitting on it cut "7.99–10.99M" in half and left "99–10.99M" behind as
    // a brand-new claim — caught by the C3-B.9 fixtures.
    const next = text[i + 1]
    if (next !== undefined && !/\s/.test(next)) continue
    bounds.add(i + 1)
  }
  const sorted = [...bounds].sort((x, y) => x - y)
  const spans: Array<[number, number]> = []
  for (let i = 0; i < sorted.length - 1; i++) spans.push([sorted[i], sorted[i + 1]])
  return spans
}

/**
 * POLICY R3, as locked by the owner in C3-B.10.2.
 *
 * Default: remove the WHOLE SENTENCE containing an unsupported amount. That is
 * what stops the dangling-connective output the audit found ("và phù hợp…").
 *
 * Widen only when that would leave no prose at all: then remove just the amount
 * and the hedge that introduces it, so a one-sentence reply degrades to its
 * remaining words instead of to "" — which the stream filter would drop
 * entirely, giving the user an empty answer.
 *
 * Both paths write nothing: every character of the output comes from the input.
 */
export function redactUnsupportedClaims(text: string, claims: MoneyClaim[]): string {
  const bad = claims.filter(c => c.verdict !== 'VERIFIED')
  if (bad.length === 0) return text

  const tidy = (s: string) => s.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim()

  // 1) sentence-level removal
  const spans = sentenceSpans(text)
  const doomed = new Set<number>()
  spans.forEach(([a, b], i) => { if (bad.some(c => c.start >= a && c.start < b)) doomed.add(i) })
  const sentenceLevel = tidy(spans.filter((_, i) => !doomed.has(i)).map(([a, b]) => text.slice(a, b)).join(''))
  if (HAS_LETTER.test(sentenceLevel)) return sentenceLevel

  // 2) removing the sentences would leave nothing — take only the amounts.
  let out = text
  for (const claim of [...bad].sort((a, b) => b.start - a.start)) {
    const head = out.slice(0, claim.start).replace(HEDGE_BEFORE, '')
    out = head + out.slice(claim.end)
  }
  return tidy(out)
}

/**
 * The guard as the stream filter uses it.
 *
 * Inert unless the evidence carries STRUCTURED prices. With the organic
 * retrieval currently in production no record has a `price` field, and treating
 * that as "nothing is supported" would redact prices that are in fact grounded.
 * The guard therefore enforces only where it can actually verify.
 */
export function guardMoneyClaimsInText(
  text: string,
  records: EvidenceRecord[],
  entities: string[],
): { text: string; claims: MoneyClaim[]; enforced: boolean } {
  const hasStructuredPrice = records.some(r => structuredPrice(r) !== null)
  if (!hasStructuredPrice) return { text, claims: [], enforced: false }
  const claims = judgeMoneyClaims(text, records, entities)
  const unsupported = claims.filter(c => c.verdict !== 'VERIFIED')
  if (unsupported.length === 0) return { text, claims, enforced: true }
  return { text: redactUnsupportedClaims(text, claims), claims, enforced: true }
}
