import { foldedWords, namedInSegments } from './entityNameGuard'
import { ENDS_SENTENCE, isCitationOnly, maskLinks } from './citationTail'

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
/** WS2: options of the money guard. Omitted = the shipped behaviour, byte-identical. */
export interface MoneyGuardOptions {
  /** Agent runtime only: a price in a sentence naming exactly one seller is judged against THAT seller's own listing. */
  sellerAttribution?: boolean
  /** CONSULTATIVE_IN_AGENT: a comma between two digits ("1,7 lít") is a decimal point, not a clause delimiter in the clause cut. */
  decimalSafe?: boolean
  /**
   * CONSULT_V3 (A/B eval 17/10). Measured on every shopping turn: "**Huawei FreeBuds SE 4 (ANC)** — khoảng **790.000đ**" was cut although the
   * listing "Tai nghe Bluetooth True Wireless Huawei Freebuds SE 4 (ANC)" carries 790.000 — the claim is judged against the REQUEST ("tai nghe
   * bluetooth"), and that listing reads as a variant (its "SE"); the user's own "tầm 15 triệu" echoed as "ngân sách khoảng 15 triệu đồng" was cut;
   * the closing question's options "1. Dưới 1,5 triệu 2. 1,5–3 triệu" were cut to "1.2.3.". Three readings, each tighter than the request:
   *   · `namedListing`: an amount in a line that NAMES a listing (its bold name's identifying tokens, or a model number of its title, occur
   *     there) and equals that listing's own price (±2%) is verified by it;
   *   · `userTexts`: an amount the user stated (a budget) is the user's, not a claim;
   *   · `choiceOptions`: the numbered options under a closing question are what the user may answer, not prices of anything.
   */
  namedListing?: boolean
  userTexts?: readonly string[]
  choiceOptions?: boolean
  /**
   * Wave 3 (W4, CONSULT_DETERMINISTIC_MATH): whole-number results of the exact calculator this turn (calcEvidenceNumbers). An amount that equals one of them (within 0.5 %, so "4,3 triệu" for 4.304.128
   * reads as that result) is the turn's own arithmetic, not a claim about a listing: VERIFIED. Absent or empty = no change at all.
   */
  calcValues?: readonly number[]
}

/** The line around a position. */
function lineAt(text: string, pos: number): string {
  const a = text.lastIndexOf('\n', pos - 1) + 1
  const b = text.indexOf('\n', pos)
  return text.slice(a, b === -1 ? text.length : b)
}

/** [start, end) of every numbered option line under a line that ends with a question mark (bold or not). */
export function closingChoiceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  let at = 0, afterQuestion = false
  for (const line of text.split('\n')) {
    const end = at + line.length
    if (/\?\s*(?:\*\*)?\s*$/.test(line)) afterQuestion = true
    else if (afterQuestion && /^\s*\d{1,2}[.)]\s*\S/.test(line)) spans.push([at, end])
    else if (line.trim()) afterQuestion = false
    at = end + 1
  }
  return spans
}

/** Model-number tokens of a listing title: letters AND digits, not a quantity ("ey245310", "18mslvn", "a515" — not "5l", "256gb"). */
const modelNumbers = (title: string): string[] =>
  foldedWords(title).filter(t => /[a-z]/.test(t) && /\d/.test(t) && t.length >= 3 && !/^\d+(?:gb|tb|mb|mah|w|wh|v|hz|mm|cm|kg|g|l|ml|inch|in|k|tr|d|h|p|x|mp|lit)$/.test(t))

/** The sentence around a position (the same bounds the attribution uses). */
function sentenceAt(text: string, pos: number): string {
  let start = 0
  for (const m of text.slice(0, pos).matchAll(/[.!?;](?=\s)|\n/g)) start = m.index! + 1
  let end = text.length
  for (const ch of ['\n', '!', '?', ';']) { const i = text.indexOf(ch, pos); if (i !== -1 && i < end) end = i }
  // A full stop ends the sentence; "4.190.000" and "truonggiang.vn" do not.
  const dot = text.slice(pos).search(/\.(?=\s|$)/); if (dot !== -1 && pos + dot < end) end = pos + dot
  return text.slice(start, end)
}

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

/**
 * G2 (owner Q2) — A LOWERCASE "m" IS NEVER MONEY.
 *
 * `UNIT_ALT` carries `M` (million) and the patterns run with the `i` flag, so
 * "cách bạn chỉ 100m" was 100 000 000 ₫ and the snippet-price guard deleted both
 * recommendation paragraphs of a "quán cafe chill gần đây" reply (2026-09-17 V3
 * capture). Decided on the MATCHED TEXT with `===`, never inside the regex: the
 * "đồng" incident recorded what an `i`-flag rule does silently. Uppercase "M"
 * ("7-8M", "14.7M VND") stays a million.
 *
 * Documented residual: chat slang "tầm 2m" (= 2 triệu) is invisible from now on,
 * so an echoed one passes unchecked. Pinned in moneyGuardMetres.test.ts.
 */
const isLowercaseMetre = (unit: string): boolean => unit === 'm'

/** Every monetary claim in the prose, with its offsets in the ORIGINAL text. */
export function extractMoneyClaims(text: string): Array<Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>> {
  return extractMoneyClaimsDetailed(text).claims
}

/** Same, plus what the extractor deliberately skipped — for guard telemetry. */
export function extractMoneyClaimsDetailed(text: string): { claims: Array<Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>>; lowercase_m_skipped: number } {
  // Blank the machine blocks in place so offsets stay aligned with `text`.
  const masked = maskNonProse(text)
  const out: Array<Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>> = []
  let lowercaseMSkipped = 0
  for (const m of masked.matchAll(RANGE_RE)) {
    const unit = m[3]
    if (isLowercaseMetre(unit)) { lowercaseMSkipped++; continue }
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
    if (isLowercaseMetre(unit)) { lowercaseMSkipped++; continue }
    const scale = unitScale(unit)
    const v = toNumber(m[1], scale > 1) * scale
    out.push({
      raw: m[0].trim(), kind: 'single', lo: v, hi: v,
      currency: isUSD(unit) ? 'USD' : 'VND', start: m.index!, end: m.index! + m[0].length,
    })
  }
  return { claims: out.sort((a, b) => a.start - b.start), lowercase_m_skipped: lowercaseMSkipped }
}

/** The structured price of a record, in VND. Never read from title/snippet. */
export function structuredPrice(rec: EvidenceRecord): number | null {
  if (!rec.price) return null
  const digits = String(rec.price).replace(/\D/g, '')
  if (digits.length < 4) return null
  return parseInt(digits, 10)
}

// Nouns that make a listing an accessory FOR something, rather than the thing.
// UAT 2026-09-28: "day " (a strap) also matched "không dây" (WIRELESS) — "Tai nghe không dây TWS …"
// was read as an accessory and its real price was removed. A strap is "dây" not after "không".
const ACCESSORY_RE = /\b(op lung|op |dem tai|dem |mieng dem|cap |(?<!khong )day |hop dung|tui |bao da|mieng dan|kinh cuong luc|gia do|ban le|dau tai|nut tai|foam|case|cover|pouch|pad|cushion|cable|charger|adapter|protector|skin|strap|stand|holder|phu kien|thay the|replacement|phim bao ve)\b/
/** Suffixes that make a record a DIFFERENT product from the bare model name.
 *  "+" is matched on its own: `\b\+\b` can never fire, because "+" is not a
 *  word character — which let "Galaxy S24+" pass as an exact "Galaxy S24". */
const VARIANT_RE = /\b(ultra|plus|pro|max|fe|mini|se|earbuds|headphones?|gen ?2|2nd|\d+tb)\b|\+/g
/** Words the model appends to a query that are not part of the product name. */
const QUERY_NOISE = /\b(price|prices|gia|giá|cost|vietnam|viet nam|vn|mua|buy|where|o dau|ở đâu|best|latest|moi nhat|chinh hang|good|tot|bao nhieu)\b/g

/** The product the request is actually about — derived from the tool query. */
/**
 * A budget in the query is not part of the product ("tai nghe bluetooth dưới 1 triệu"): kept, its
 * words ("duoi", "trieu") matched no title, every record read UNRELATED and every price was removed
 * (UAT 2026-09-28, the shopping pick lost its real 305.000đ).
 */
const BUDGET_PHRASE = /\b(?:duoi|tren|khoang|tam|toi da|chi|re hon|under|below|around|max)?\s*\d+(?:[.,]\d+)*\s*(?:k|nghin|ngan|tr|trieu|cu|m|million|dong|d|vnd)\b/g
export function requestedEntity(toolQuery: string): string {
  return strip(toolQuery).replace(BUDGET_PHRASE, ' ').replace(QUERY_NOISE, ' ').replace(/\s+/g, ' ').trim()
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
export function judgeMoneyClaims(text: string, records: EvidenceRecord[], entities: string[], opts: MoneyGuardOptions = {}): MoneyClaim[] {
  const found = extractMoneyClaims(text)
  if (found.length === 0) return []
  // WS2 (agent runtime only): "**Viettablet** … khoảng 4,19 triệu" is a claim about THAT seller's listing, and it is verified by that
  // listing's own structured price — whatever the request's wording (measured WS-K1: the query's "USB-C" made every listing a variant
  // and three listing-backed seller prices were deleted). Only when exactly one seller is named and its own row carries the figure.
  const bySeller = (c: Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>): string | null => {
    if (!opts.sellerAttribution) return null
    const s = strip(sentenceAt(text, c.start))
    const sellers = [...new Set(records.map(r => (r.source ?? '').trim()).filter(x => strip(x).replace(/[^a-z0-9]/g, '').length >= 3))]
    const named = sellers.filter(x => { const k = strip(x).replace(/[^a-z0-9.]/g, ''); return k.length >= 3 && s.replace(/[^a-z0-9.]/g, '').includes(k) })
    if (named.length !== 1) return null
    const own = records.filter(r => (r.source ?? '').trim() === named[0]).map(structuredPrice).filter((v): v is number => v !== null)
    const ok = (v: number) => own.some(p => withinTolerance(v, p))
    return ok(c.lo) && ok(c.hi) ? named[0] : null
  }
  // CONSULT_V3 readings (see MoneyGuardOptions): checked first, each one only ever VERIFIES.
  const userValues = (opts.userTexts ?? []).flatMap(t => extractMoneyClaims(t)).flatMap(u => [u.lo, u.hi])
  const choiceSpans = opts.choiceOptions ? closingChoiceSpans(text) : []
  const calcValues = opts.calcValues ?? []
  const v3Reading = (c: Omit<MoneyClaim, 'verdict' | 'entity' | 'reason'>): MoneyClaim | null => {
    if (calcValues.length > 0 && [c.lo, c.hi].every(v => calcValues.some(u => Math.abs(v - u) <= Math.max(1, u * 0.005)))) return { ...c, verdict: 'VERIFIED', entity: null, reason: 'calculated by the exact calculator this turn' }
    if (choiceSpans.some(([a, b]) => c.start >= a && c.start < b)) return { ...c, verdict: 'VERIFIED', entity: null, reason: 'closing question option' }
    if (userValues.length > 0 && [c.lo, c.hi].every(v => userValues.some(u => withinTolerance(v, u)))) return { ...c, verdict: 'VERIFIED', entity: null, reason: 'stated by the user' }
    if (!opts.namedListing) return null
    const line = lineAt(text, c.start)
    const lineWords = foldedWords(line)
    const bolds = [...line.matchAll(/\*\*([^*\n]{3,80})\*\*/g)].map(m => m[1]).filter(b => extractMoneyClaims(b).length === 0)
    for (const r of records) {
      const p = structuredPrice(r)
      if (p === null || !withinTolerance(c.lo, p) || !withinTolerance(c.hi, p)) continue
      const seg = [foldedWords(`${r.title ?? ''} ${r.source ?? ''}`)]
      const byName = bolds.some(b => namedInSegments(b, seg) === true)
      const byModel = modelNumbers(r.title ?? '').some(m => lineWords.includes(m))
      if (byName || byModel) return { ...c, verdict: 'VERIFIED', entity: r.title ?? null, reason: 'the named listing\'s own price' }
    }
    return null
  }
  const usable = entities.map(requestedEntity).filter(Boolean)
  if (usable.length === 0) {
    return found.map(c => v3Reading(c) ?? ({ ...c, verdict: 'AMBIGUOUS' as const, entity: null, reason: 'no requested entity available' }))
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
    const v3 = v3Reading(c)
    if (v3) return v3
    const seller = bySeller(c)
    if (seller) return { ...c, verdict: 'VERIFIED' as const, entity: seller, reason: 'stated by the named seller\'s own listing' }
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

/**
 * Spans that are machine payload, not prose — never removed, never split on.
 *
 * Exported so every guard that walks `sentenceSpans` can tell a machine block
 * from a sentence: `sentenceSpans` keeps each of these whole as ONE span, and a
 * guard that judges that span as prose deletes the whole block. Measured
 * 2026-09-14 in `placeClaimGuard` — a complete [TAPPY_PLAN] deleted because a
 * Google-Maps longitude inside its `maps_link` read as a phone number.
 */
export function protectedSpans(text: string): Array<[number, number]> {
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
    // UAT4 P1-d: two streamed steps glue as "…cho bạn nhé.Mình chọn **X**…" — no space. A
    // lowercase letter, the stop, then an uppercase letter is a sentence end ("TP.HCM" and
    // "7.99" are not: an uppercase or a digit precedes the stop).
    const glued = next !== undefined && /\p{Lu}/u.test(next) && i > 0 && /\p{Ll}/u.test(text[i - 1])
    if (next !== undefined && !/\s/.test(next) && !glued) continue
    bounds.add(i + 1)
  }
  const sorted = [...bounds].sort((x, y) => x - y)
  const spans: Array<[number, number]> = []
  for (let i = 0; i < sorted.length - 1; i++) spans.push([sorted[i], sorted[i + 1]])
  return spans
}

/**
 * 30/10: `sentenceSpans` keeps every link / URL as a span of its own, so "… 120.000đ/người (theo [Vietravel](https://…))." is three spans;
 * removing "the sentence" removed only the first and left "[Vietravel](…))." (measured on localhost, "Vietravel)." on screen). For the
 * removal below, a span boundary that only a LINK made (not a stop, not a line break, not a machine block) is joined back, so the sentence
 * that goes takes its own citation with it. Each guard that reads `sentenceSpans` for judging keeps its spans as they are.
 */
function withInlineLinksJoined(text: string, spans: Array<[number, number]>): Array<[number, number]> {
  const linkEdges = new Set<number>()
  for (const [a, b] of protectedSpans(text)) {
    if (/^\[(?:CTA_BUTTONS|FOLLOWUPS|TAPPY_PLAN)\]/.test(text.slice(a, b))) continue
    linkEdges.add(a); linkEdges.add(b)
  }
  const out: Array<[number, number]> = []
  for (const [a, b] of spans) {
    const last = out[out.length - 1]
    const joinable = last && last[1] === a && linkEdges.has(a) && text[a - 1] !== '\n' && !ENDS_SENTENCE.test(text.slice(last[0], a))
    if (joinable) last[1] = b; else out.push([a, b])
  }
  return out
}

/**
 * POLICY R3 — PROPORTIONAL (owner, 2026-09-20; supersedes the whole-sentence default locked in
 * C3-B.10.2).
 *
 * Measured S7 (3/3 deterministic, GATE 40): a product list — one line per product, each with an
 * amount — lost EVERY line to the whole-sentence rule, leaving "mình gợi ý:" and nothing. The
 * amount was the unsupported part; the product line was not.
 *
 * Order now: (1) the CLAUSE that carries the amount — bounded by `,` `;` `:` a dash or a
 * parenthesis — goes, with the hedge that introduces it; the rest of the sentence stays when it
 * still says something (has letters). (2) When the clause IS the sentence, the sentence goes —
 * that is what stopped the dangling-connective output the audit found ("và phù hợp…"). (3) When
 * that would leave no prose at all, only the amounts go. Every path writes nothing: every output
 * character comes from the input; seams are tidied (a doubled delimiter, a leading connective).
 */
const CLAUSE_DELIM = /[,;:()]|\s[—–-]\s/g
// Same, but a comma flanked by digits on both sides ("1,7 lít", "1,200,000") is part of the number (flag CONSULTATIVE_IN_AGENT).
const CLAUSE_DELIM_DECIMAL = /(?<!\d),|,(?!\d)|[;:()]|\s[—–-]\s/g
// F-092 (2026-09-25): "với" / "with" are NOT here. Sentence-initial they are a PREPOSITION opening a
// complete sentence ("Với hai bạn thì rất vui", "Với ngân sách 3 triệu, …"), and stripping them ate
// the next sentence's first word. Only true conjunctions dangle off a removed sentence.
const LEADING_CONNECTIVE = /^\s*(?:và|hoặc|nhưng|còn|and|or|but)\s+/iu
/**
 * A clause cut that leaves the sentence ending on one of these is a stub ("bạn nên.", "giá là.",
 * measured live 2026-09-20 run 14): the sentence goes whole instead.
 */
const DANGLING_TAIL = /(?:^|\s)(?:nên|và|với|là|có|hoặc|nhưng|hay|để|khi|vì|từ|đến|khoảng|tầm|giá|chỉ|mà|thì|cho|của|and|or|with|for|at|about|around|only|is|are|costs?)$/iu

/**
 * A clause opening with one of these is subordinate: it needs a main clause after it ("Nếu cần chống
 * ồn tốt, …"). `do` is left out on purpose — clause-initial it is as often "made by" as "because".
 */
const SUBORDINATE_HEAD = /^(?:nếu|khi|trong khi|lúc|hễ|vì|bởi vì|bởi|tuy|tuy nhiên nếu|mặc dù|dù|để|if|when|whenever|because|since|although|though|while|unless)(?![\p{L}\p{N}])/iu

/** The last clause of `s` (after its last clause delimiter), without leading space or emphasis. */
export function lastClauseOf(s: string): string {
  // The last NON-EMPTY clause: "Nếu bạn muốn … cao hơn, " ends in its own delimiter, and the empty
  // tail after it hid the conditional (uat @ 1e11b32 still showed "Nếu bạn muốn … cao hơn.").
  const parts = s.split(CLAUSE_DELIM).map(p => p.replace(/^[\s*_>#-]+/u, '').trim()).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/**
 * @param linePrefix the text between the start of this LINE and the sentence. Bold balances per
 *   line, and `sentenceSpans` splits "**1. iPhone…**" after "1.", so the sentence alone sees an
 *   opening `**` its line already holds (golden post-f094 B1, measured with the pre-guard capture).
 */
export function removeClauseAround(sentenceWithBreak: string, at: number, end: number, linePrefix = '', decimalSafe = false): string | null {
  // The line break that closes a list line is structure, not clause: it always survives.
  const brk = sentenceWithBreak.match(/\n+$/)?.[0] ?? ''
  const sentence = sentenceWithBreak.slice(0, sentenceWithBreak.length - brk.length)
  /**
   * UAT 2026-09-28 (shop.t1): the sentence's own STOP is not part of any clause. The last clause
   * used to run to `sentence.length`, so cutting it took the "." too and the kept head glued onto
   * the next sentence: "…từ **Phong Vũ** Rẻ nhất…", "…cao hơn Nếu cần chống ồn tốt…". The last
   * clause now ends before the stop, and the stop stays with whatever the cut keeps.
   */
  const stop = sentence.match(/[.!?…]+[\s"'”’]*$/u)?.index ?? sentence.length
  // Clause bounds inside this sentence: the delimiter before the amount (excluded from what
  // stays) and the delimiter after it (kept, so the remaining clauses still read as a list).
  let a = 0, b = Math.max(stop, end), bDelim = ''
  // 30/10: the brackets of a link are not clause delimiters ("(theo [Vietravel](https://…))." was cut at the link's own "(", leaving
  // "Vietravel)."): the scan runs over the sentence with each link masked, same length, so every offset still holds.
  const scan = maskLinks(sentence)
  for (const m of scan.matchAll(decimalSafe ? CLAUSE_DELIM_DECIMAL : CLAUSE_DELIM)) {
    const i = m.index!
    if (i < at) a = i
    else if (i >= end) { b = i + m[0].length; bDelim = m[0]; break }
  }
  /**
   * A parenthesis that OPENS right after the amount qualifies the amount ("~12 triệu (chưa bao
   * gồm vé máy bay)", "khoảng 12 triệu (xe + khách sạn + ăn)"): it goes with it, through its
   * closing bracket. Phase 7 (2026-09-22, golden T1/G4a plan replies): cutting at the "(" left
   * "**Tổng ước tính(chưa bao gồm vé máy bay)." and "xe + khách sạn + ăn + tham quan)." behind.
   */
  let qualifier = false
  if (bDelim === '(') {
    const close = scan.indexOf(')', b)
    if (close !== -1) { b = close + 1; bDelim = ')'; qualifier = true }
  }
  const before = sentence.slice(0, a).replace(HEDGE_BEFORE, '').replace(/\s+$/, '')
  const after = sentence.slice(b)
  const afterSaysNothing = after.replace(/[\s.!?…]/g, '') === ''
  // The clause ran to the end and what stays ends on a connective / a verb waiting for its object.
  if (afterSaysNothing && DANGLING_TAIL.test(before)) return null
  // …or what stays is only the LABEL the amount hung on ("**Tổng ước tính", "Giá vé"): a heading
  // with nothing under it, or an unclosed bold, says nothing — the sentence goes whole.
  // A complete bold span is content — "- **Sharp FP-J40E** — 4.200.000₫" keeps its product line
  // (B4: the list survives, only the amount goes); a bare label or an unclosed bold does not.
  const boldMarks = ((linePrefix + before).match(/\*\*/g) ?? []).length
  const hasBoldName = boldMarks >= 2 && boldMarks % 2 === 0
  if (afterSaysNothing && (boldMarks % 2 === 1 || (!hasBoldName && before.split(/\s+/).filter(Boolean).length <= 4))) return null
  // F-094 (owner 2026-09-25): a cut that leaves a CLIPPED sentence takes the sentence whole.
  // (a) the kept head opens a bold span the cut closed — "**Tổng ước tính, mua sắm, hoặc nâng cấp."
  //     (golden T1 t3) — whatever follows it;
  if (boldMarks % 2 === 1) return null
  // (b) the head clause went and what stays starts in lower case where the sentence did not —
  //     "nếu bạn ưu tiên **không dây**, …", "bao gồm xe khách khứ hồi, …" (golden B4). A list line
  //     keeps its product and loses only the amount (S7), because there the amount is not the head.
  if (before.length === 0 && startsLower(after) && !startsLower(sentence)) return null
  // (c) the cut itself crosses a bold span — it takes one `**` of a pair and leaves the other:
  //     "**…HAVIT H612BT Pro** — giá chỉ **380.000đ** với đánh giá **4.8⭐ (170 lượt)** từ …" became
  //     "**…Pro**** từ Hoàng Hà Mobile." (golden post-f094 B4 t1, measured with the pre-guard capture).
  if (((sentence.slice(a, b).match(/\*\*/g) ?? []).length % 2) === 1) return null
  // (e) the cut clause is the CONSEQUENCE of a conditional / subordinate clause that stays: "Nếu cần
  //     chống ồn tốt, **X** 990.000đ, nhưng gần chạm ngân sách." became "Nếu cần chống ồn tốt, nhưng
  //     gần chạm ngân sách." (UAT shop.t1 2026-09-28). The clause right before the cut opens with a
  //     subordinator, so what was cut was its main clause: the sentence goes whole.
  if (before.length > 0 && SUBORDINATE_HEAD.test(lastClauseOf(before))) return null
  // A cut HEAD clause keeps the sentence's own leading whitespace — the space that separated it
  // from the previous sentence — or the survivor glues on ("cho bạn.yên tĩnh.", measured).
  const lead = sentence.match(/^\s*/)?.[0] ?? ''
  // (d) an item INSIDE a parenthetical keeps the bracket the cut does not own:
  //     "**táo xanh** (19.19-19.39 triệu VND, đánh giá 5⭐ từ 31 người)" became "**táo xanh**, đánh giá
  //     5⭐ từ 31 người)", "- **ATK N9 Ultra** (980.000đ, 4.6⭐)" became "**ATK N9 Ultra**, 4.6⭐)"
  //     (golden post-f094c B1/B4). First item cut → its "(" stays; last item cut → its ")" stays;
  //     the whole parenthetical cut → both go.
  const opensHere = sentence[a] === '(' && a < at
  let joint = bDelim
  if (bDelim.trim() === ')') joint = opensHere || qualifier ? '' : ')'
  else if (opensHere) joint = ' ('
  const rest = before.length > 0
    ? before + joint + (joint === ' (' ? after.replace(/^\s+/, '') : after)
    : lead + after.replace(/^\s+/, '')
  const letters = (rest.match(/\p{L}/gu) ?? []).length
  if (letters < 3) return null
  return rest + brk
}

/**
 * Round 42 round 3 (commit 3a, PRICE-CUT-RESIDUE-01 / S5): the connectives a travel sentence turns on — the cut point
 * when no clause delimiter separates a verified fare from an unverified one. Matched with the space before it, so
 * the cut keeps the text before the space.
 */
const FARE_CONNECTIVE = /\s+(?:trong khi|trong lúc|còn|nhưng|tuy nhiên|khi đó|hoặc)(?![\p{L}\p{N}])/giu

/**
 * Round 42 round 3 (commit 3a; travelGuard only, through `noAmountOnlyFallback`): a sentence that states a VERIFIED
 * amount next to an unverified one loses the part that carries the unverified amount and keeps every verified one —
 * never the whole sentence, never only the number ("Vietjet 387.000 VND, nhưng cũng có chuyến chỉ." was the
 * residue). Offsets are relative to the sentence; `verified` is sorted by start.
 *
 * - after a verified amount: cut from the clause delimiter before the unverified amount (2a), else from the nearest
 *   connective before it (2c), else from the end of the verified amount — through the sentence's stop, which stays;
 * - another verified amount follows: the cut ends before the next delimiter / connective (S5m2), so it stays;
 * - before every verified amount: the head goes through the delimiter / connective after the unverified amount, the
 *   leading connective with it, and the first letter takes its case back (2b).
 *
 * Returns null when no cut keeps every verified amount — the caller then takes its former path.
 */
function cutAroundVerified(sentenceWithBreak: string, verified: Array<[number, number]>, unverified: Array<[number, number]>, decimalSafe: boolean): string | null {
  const brk = sentenceWithBreak.match(/\n+$/)?.[0] ?? ''
  const sentence = sentenceWithBreak.slice(0, sentenceWithBreak.length - brk.length)
  const stop = sentence.match(/[.!?…]+[\s"'”’]*$/u)?.index ?? sentence.length
  const lead = sentence.match(/^\s*/)?.[0].length ?? 0
  // 30/10: a link's own brackets are not clause delimiters (see removeClauseAround); offsets are unchanged by the mask.
  const scan = maskLinks(sentence)
  const spans = (re: RegExp) => [...scan.matchAll(re)].map(m => [m.index!, m.index! + m[0].length] as [number, number])
  const delims = spans(decimalSafe ? CLAUSE_DELIM_DECIMAL : CLAUSE_DELIM)
  const conns = spans(FARE_CONNECTIVE)
  const within = (from: number, to: number) => (x: [number, number]) => x[0] >= from && x[1] <= to
  // The first boundary after the unverified amount: [where a cut ending before it stops, where a head cut through it stops].
  const firstAfter = (from: number, to: number): [number, number] | null => {
    const d = delims.find(within(from, to)), c = conns.find(within(from, to))
    if (d && (!c || d[0] <= c[0])) return [d[0], d[1]]
    return c ? [c[0], c[1]] : null
  }
  const cuts: Array<[number, number]> = []
  for (const [us, ue] of unverified) {
    const prev = verified.filter(([, e]) => e <= us).pop()
    const next = verified.find(([s]) => s >= ue)
    if (prev) {
      const d = delims.filter(within(prev[1], us)).pop()
      const c = conns.filter(within(prev[1], us)).pop()
      const from = d ? d[0] : c ? c[0] : prev[1]
      const to = next ? (firstAfter(ue, next[0])?.[0] ?? ue) : stop
      cuts.push([from, Math.max(to, ue)])
    } else if (next) {
      cuts.push([lead, firstAfter(ue, next[0])?.[1] ?? ue])
    } else return null
  }
  cuts.sort((x, y) => x[0] - y[0])
  const merged: Array<[number, number]> = []
  for (const c of cuts) {
    const last = merged[merged.length - 1]
    if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]); else merged.push([c[0], c[1]])
  }
  if (merged.some(([f, t]) => verified.some(([s, e]) => s < t && e > f))) return null
  let out = '', at = 0
  for (const [f, t] of merged) { out += sentence.slice(at, f); at = t }
  out += sentence.slice(at)
  if (merged[0][0] <= lead) {
    const head = sentence.slice(0, lead)
    out = head + capitaliseFirst(out.slice(head.length).replace(/^\s+/, '').replace(LEADING_CONNECTIVE, ''))
  }
  if (!HAS_LETTER.test(out)) return null
  return out + brk
}

/** The first letter after leading space, list bullets and emphasis is lower case. */
function startsLower(s: string): boolean {
  return /^\p{Ll}/u.test(s.replace(/^[\s*_>#-]+/u, '').replace(/^[^\p{L}\p{N}]+/u, ''))
}

/** Upper-cases the first letter — the only character a redaction may change, and only its case. */
function capitaliseFirst(s: string): string {
  return s.replace(/^([\s*_>#-]*)(\p{Ll})/u, (_m, lead: string, ch: string) => lead + ch.toLocaleUpperCase('vi'))
}

/**
 * MONEY-GUARD-KEEP-VERIFIED-01 — MONEY_GUARD_KEEP_VERIFIED (default OFF). ON: `redactUnsupportedClaims` (callers without `wholeSentence` /
 * `noAmountOnlyFallback`, i.e. `guardMoneyClaimsInText`) no longer removes a VERIFIED amount only because another amount in the same sentence is
 * not verified. Read at call time, same shape as `snippetPriceGuardV2Enabled` (config/product.ts:443-446) plus a trim: ON only for `1` / `true`.
 */
export function moneyGuardKeepVerifiedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.MONEY_GUARD_KEEP_VERIFIED?.trim()
  return v === '1' || v === 'true'
}

/**
 * keepVerified only: the claim spans of one sentence can be edited by offset only when every claim of the sentence ends inside it and no two
 * claims share a character (a prefix and a suffix currency symbol can: "8.000.000 ₫ 3.000.000" is the claim "8.000.000 ₫" and the claim
 * "₫ 3.000.000"). Otherwise the sentence takes the former path, whose clause cut always removes the clause around the unverified amount.
 */
function claimSpansAreSafe(claims: ReadonlyArray<{ start: number; end: number }>, from: number, to: number): boolean {
  const here = claims.filter(c => c.start >= from && c.start < to)
  if (here.some(c => c.end > to)) return false
  return here.every((c, i) => here.every((d, j) => i === j || c.end <= d.start || d.end <= c.start))
}

/** keepVerified fallback: only the unverified amounts (and the hedge word right before each) are taken out of the sentence; every other character stays. */
function removeAmountsOnly(sentenceWithBreak: string, spans: Array<[number, number]>): string {
  let out = sentenceWithBreak
  for (const [s, e] of [...spans].sort((x, y) => y[0] - x[0])) out = out.slice(0, s).replace(HEDGE_BEFORE, '') + out.slice(e)
  return out
}

export interface RedactOptions {
  /**
   * F-094 (owner 2026-09-25): remove every affected sentence WHOLE — no clause cut. The v1 snippet
   * price guard uses it; its clause cuts produced the headless fragments the golden set measured.
   */
  wholeSentence?: boolean
  /** See MoneyGuardOptions.decimalSafe. */
  decimalSafe?: boolean
  /**
   * Round 42 round 3 (PRICE-CUT-RESIDUE-01): no step (3) "only the amounts go" — a sentence that cannot lose just a clause goes whole, even when that
   * leaves nothing — and a sentence that also states a VERIFIED amount is cut around it first (`cutAroundVerified`), so a verified amount never goes.
   * Only for a caller that always writes its own notice after a cut (travelGuard); off = the former behaviour for every other caller.
   */
  noAmountOnlyFallback?: boolean
}

export function redactUnsupportedClaims(text: string, claims: MoneyClaim[], opts: RedactOptions = {}): string {
  const bad = claims.filter(c => c.verdict !== 'VERIFIED')
  if (bad.length === 0) return text
  // Read here, at call time. Never for `wholeSentence` (snippet guard) or `noAmountOnlyFallback` (travelGuard): those callers keep their own behaviour.
  const keepVerifiedOn = !opts.wholeSentence && !opts.noAmountOnlyFallback && moneyGuardKeepVerifiedEnabled()

  // Seams only, never across a line break: a list bullet after a newline is structure, not a
  // doubled delimiter.
  const tidy = (s: string) => s
    .replace(/([,;:])[ \t]*(?:[,;:—–][ \t]*)+/g, '$1 ')
    .replace(/[ \t][—–-][ \t]*([.!?\n])/g, '$1')
    .replace(/[,;][ \t]*([.!?\n])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim()

  // 1) clause-level removal inside each affected sentence; 2) the sentence when the clause is all of it
  const spans = withInlineLinksJoined(text, sentenceSpans(text))
  let dropped = false // the previous sentence went: a connective opening this one dangles
  let droppedOnLine = false // …and it went on this line, without a line break after it: a citation that follows it is its own
  // F-094: "Và phù hợp bữa trưa…" after a removed sentence became "phù hợp bữa trưa…" — a sentence
  // with no capital. The connective goes and the first letter takes its case back.
  const stripConnective = (s: string) => {
    const stripped = s.replace(LEADING_CONNECTIVE, m => m.replace(/\S+\s+$/, ''))
    return stripped === s ? s : capitaliseFirst(stripped)
  }
  const pieces = spans.map(([a, b]) => {
    const inSentence = bad.filter(c => c.start >= a && c.start < b).sort((x, y) => y.start - x.start)
    const raw = text.slice(a, b)
    const pieceDropped = (): string => { dropped = true; droppedOnLine = !raw.endsWith('\n'); return '' }
    if (inSentence.length === 0) {
      // F-094: what a removed sentence leaves behind that is not prose — the " 🤔" after
      // "… 70-80k để có thêm lựa chọn? 🤔" (golden post-f094b T3 t2) — goes with it.
      if (dropped && raw.trim() && !/[\p{L}\p{N}]/u.test(raw)) return raw.match(/\n+$/)?.[0] ?? ''
      // 30/10: the citation written after it on the same line ("… 120.000đ/người. [Vietravel](https://…)") was the removed sentence's own
      // source, and stood alone once the sentence went. A link on a line of its own is not touched.
      if (droppedOnLine && raw.trim() && isCitationOnly(raw)) { droppedOnLine = !raw.endsWith('\n'); return raw.match(/\n+$/)?.[0] ?? '' }
      const out = dropped && raw.trim() ? stripConnective(raw) : raw
      if (raw.trim()) dropped = false
      if (raw.trim() || raw.includes('\n')) droppedOnLine = false
      return out
    }
    let sentence = raw
    // F-094: a LIST LINE is not a prose sentence. Removing it whole deleted the pick itself —
    // "• **Cơm Ngon Hà Nội** (4.9⭐, 283 đánh giá) - khoảng giá lên tới 100k" (golden post-f094b T3 t2)
    // — so a list line keeps its item and loses the amount clause, as S7 decided for product lists;
    // every anti-fragment rule of that path still applies.
    const lineStart = text.lastIndexOf('\n', a - 1) + 1
    const isListLine = /^\s*(?:\*\*)?\s*(?:[-*•+]|\d+[.)])\s/u.test(text.slice(lineStart, b))
    if (opts.wholeSentence && !isListLine) return pieceDropped()
    droppedOnLine = false
    // Round 42 round 3 (commit 3a): with the opt-in, a sentence that also states a verified amount is cut around it BEFORE the clause path (1),
    // whose cut can take the verified amount with the clause (S5h3) or drop the sentence whole (travelGuard.test.ts case 4).
    if (opts.noAmountOnlyFallback) {
      const verified = claims.filter(c => c.verdict === 'VERIFIED' && c.start >= a && c.start < b).sort((x, y) => x.start - y.start)
      const kept = verified.length > 0
        ? cutAroundVerified(raw, verified.map((c): [number, number] => [c.start - a, c.end - a]), [...inSentence].reverse().map((c): [number, number] => [c.start - a, c.end - a]), opts.decimalSafe === true)
        : null
      if (kept !== null) {
        dropped = false
        const trailing = kept.match(/[\n]+$/)?.[0] ?? ''
        return stripConnective(kept.replace(/[\n]+$/, '')) + trailing
      }
    }
    // MONEY-GUARD-KEEP-VERIFIED-01 (flag MONEY_GUARD_KEEP_VERIFIED, default OFF): a sentence that states a VERIFIED amount never loses it to the
    // clause cut below. Cut around the verified amounts; if no such cut exists, take out only the unverified amounts. Claims whose spans are not
    // safe to edit (see claimSpansAreSafe) keep the former path, which removes the unverified amount with its clause (or the sentence).
    if (keepVerifiedOn) {
      const verified = claims.filter(c => c.verdict === 'VERIFIED' && c.start >= a && c.start < b).sort((x, y) => x.start - y.start)
      if (verified.length > 0 && claimSpansAreSafe(claims, a, b)) {
        const unverifiedSpans = [...inSentence].reverse().map((c): [number, number] => [c.start - a, c.end - a])
        const kept = cutAroundVerified(raw, verified.map((c): [number, number] => [c.start - a, c.end - a]), unverifiedSpans, opts.decimalSafe === true)
          ?? removeAmountsOnly(raw, unverifiedSpans)
        dropped = false
        const trailing = kept.match(/[\n]+$/)?.[0] ?? ''
        return stripConnective(kept.replace(/[\n]+$/, '')) + trailing
      }
    }
    for (const c of inSentence) {
      const cut = removeClauseAround(sentence, c.start - a, c.end - a, text.slice(text.lastIndexOf('\n', a - 1) + 1, a), opts.decimalSafe === true)
      if (cut === null) return pieceDropped()
      sentence = cut // claims are processed from the end, so earlier offsets are unaffected
    }
    dropped = false
    const trailing = sentence.match(/[\n]+$/)?.[0] ?? ''
    const core = stripConnective(sentence.replace(/[\n]+$/, ''))
    return core + trailing
  })
  const proportional = tidy(pieces.join(''))
  if (HAS_LETTER.test(proportional)) return proportional
  if (opts.noAmountOnlyFallback) return proportional

  // 3) removing the clauses would leave nothing — take only the amounts.
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
  opts: MoneyGuardOptions = {},
): { text: string; claims: MoneyClaim[]; enforced: boolean } {
  const hasStructuredPrice = records.some(r => structuredPrice(r) !== null)
  if (!hasStructuredPrice) return { text, claims: [], enforced: false }
  const claims = judgeMoneyClaims(text, records, entities, opts)
  const unsupported = claims.filter(c => c.verdict !== 'VERIFIED')
  if (unsupported.length === 0) return { text, claims, enforced: true }
  return { text: redactUnsupportedClaims(text, claims, opts.decimalSafe ? { decimalSafe: true } : {}), claims, enforced: true }
}
