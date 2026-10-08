// ── Phase 8 WS2 final — the No-Fabrication Gate: every current / entity fact the reply states is checked against what the turn had ──
//
// Tappy is a general-purpose assistant: a fabricated restaurant price is bad, a fabricated dosage, fee, market figure, opening hour or
// booking status can harm. The specialised guards each cover ONE evidence shape (shopping rows, place snippets, travel fares, cited
// pages); a claim that fits none of them — a price Luna remembered after search_products timed out, an exchange rate with no tool call,
// a dosage — passed unchecked. This gate is the last factual check before the reply is restored and presented (TAPPY_AGENT=2 only).
//
// CLAIMS, NOT URLS. Each sentence's checkable claims are extracted by CATEGORY (deterministic: the value and the words around it):
//   price · market/finance (rates, %, fees, gold / stock / crypto / FX) · hours / schedules · rating · review count · availability ·
//   dosage · distance · booking / order status.
// Stable knowledge without such a claim ("Python là gì", "vì sao trời xanh", "sốt trên 38,5 độ nên đi khám") is never touched: the gate
// does not make Tappy refuse or hedge what it knows.
//
// STATES (per claim):
//   FACT        the value is in the evidence the turn had: tool results (any tool, any shape), the pages read, the context Luna was given
//               (card facts, task evidence), the conversation's earlier replies;
//   INFERENCE   derived from supported / user values (a + b, a − b, a × n, a × p %), or a clearly labelled planning estimate
//               ("dự trù khoảng 300–500k/người/ngày");
//   UNKNOWN     the sentence itself says it is not verified ("chưa xác minh được giá phòng…") — honest, kept;
//   CONFLICT    the value is one side of a ledger conflict and the other side is not in the reply — kept, with ONE note naming both;
//   FABRICATED  none of the above: a factual claim presented as fact with no evidence → the sentence is removed, and ONE line says which
//               kind of fact could not be verified (never a guessed replacement value).
// The user's own numbers are the user's (never judged). Model memory is not evidence for a current fact. Pure: no model, no network.

import { extractMoneyClaims, sentenceSpans } from './moneyGuard'
import { parsePriceBand, amountWithinBand, type PriceBand } from '@/lib/recommendation/priceBand'
import { availabilityPolarity, clockTimes } from './agent/runtime/claimConflict'

export type ClaimState = 'FACT' | 'INFERENCE' | 'UNKNOWN' | 'CONFLICT' | 'FABRICATED'
export type ClaimCategory = 'price' | 'market' | 'hours' | 'rating' | 'review_count' | 'availability' | 'policy' | 'dosage' | 'distance' | 'booking_status'

export interface GateEvidence {
  /** Raw tool results of this turn (JSON text of every `a:` frame), pages read, the DATA context Luna was given, earlier replies. */
  corpus: readonly string[]
  /** Every user message of the conversation (their numbers are theirs). */
  userTexts: readonly string[]
  /** Tools that ran this turn (booking / order status needs an action tool). */
  tools: readonly string[]
  /** Ledger conflicts of this turn (M3), as the M4 guards read them. */
  conflicts?: ReadonlyArray<{ attribute: string; sides: ReadonlyArray<{ value: string; sourceId: string }> }>
  /** Price figures read only from OLD pages (page date > 180 days before the read) and from fresh ones (ledger price evidence). */
  stalePrices?: readonly number[]
  freshPrices?: readonly number[]
}

export interface GateClaim { category: ClaimCategory; state: ClaimState; value: string }
export interface GateResult {
  text: string
  claims: GateClaim[]
  removedSentences: number
  noteAdded: boolean
  counts: Record<ClaimState, number>
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

/** Numbers in a text, normalised: "1.291" / "1,291" → 1291, "4,8" → 4.8, "39.990.000" → 39990000. */
export function numbersOf(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/\d{1,3}(?:[.,]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?/g)) {
    const s = m[0]
    out.push(/^\d{1,3}([.,]\d{3})+$/.test(s) ? Number(s.replace(/[.,]/g, '')) : Number(s.replace(',', '.')))
  }
  return out.filter(Number.isFinite)
}

// ── the evidence index ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Index { nums: number[]; money: number[]; bands: PriceBand[]; times: Set<number>; positive: boolean; negative: boolean; user: number[]; userMoney: number[] }

const STRUCT_TIME = /(\d{1,2}):(\d{2})/g
export function buildIndex(ev: GateEvidence): Index {
  const nums: number[] = [], money: number[] = [], bands: PriceBand[] = []
  const times = new Set<number>()
  let positive = false, negative = false
  for (const raw of ev.corpus) {
    const t = raw.length > 200_000 ? raw.slice(0, 200_000) : raw
    // JSON escapes (à…) are decoded where present, so Vietnamese text in tool results reads as text.
    const text = t.includes('\\u') ? t.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))) : t
    nums.push(...numbersOf(text))
    for (const c of extractMoneyClaims(text)) { money.push(c.lo); if (c.hi !== c.lo) money.push(c.hi) }
    for (const m of text.matchAll(/"(?:price_range_text|price_range|priceRange|price_level_text)"\s*:\s*"([^"]{2,40})"/g)) { const b = parsePriceBand(m[1]); if (b) bands.push(b) }
    for (const m of text.matchAll(STRUCT_TIME)) times.add(Number(m[1]) * 60 + Number(m[2]))
    for (const x of clockTimes(text)) times.add(x)
    // Availability signals are specific (a key or a phrase that STATES it), never a stray word like an "availability" field name.
    if (/"open_now"\s*:\s*true|schema\.org\/instock|\binstock\b|\bin stock\b|còn hàng|con hang|còn phòng|con phong|còn chỗ|con cho|còn vé|con ve|"available"\s*:\s*true|rooms? (?:are )?available|đang mở cửa|dang mo cua/i.test(text)) positive = true
    if (/"open_now"\s*:\s*false|schema\.org\/outofstock|\boutofstock\b|\bout of stock\b|hết hàng|het hang|hết phòng|het phong|hết chỗ|het cho|hết vé|het ve|sold out|fully booked|đã đóng cửa|da dong cua|permanently closed|"available"\s*:\s*false/i.test(text)) negative = true
  }
  const user = ev.userTexts.flatMap(numbersOf)
  const userMoney = ev.userTexts.flatMap(u => extractMoneyClaims(u).flatMap(c => [c.lo, c.hi]))
  return { nums, money, bands, times, positive, negative, user, userMoney }
}

const near = (v: number, xs: readonly number[], rel = 0.02, abs = 0) => xs.some(x => Math.abs(v - x) <= Math.max(abs, rel * Math.max(Math.abs(v), Math.abs(x))))

// ── claim extraction ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MARKET_CTX = /(?<!\p{L})(tỷ giá|ty gia|ngoại tệ|giá vàng|gia vang|vàng sjc|vang sjc|cổ phiếu|co phieu|chứng khoán|chung khoan|vn-?index|bitcoin|btc|eth|crypto|tiền điện tử|lãi suất|lai suat|lạm phát|lam phat|cổ tức|co tuc|thuế|thue|phí|phi|lệ phí|le phi|tăng trưởng|tang truong|doanh thu|lợi nhuận|loi nhuan|gdp|interest rate|exchange rate|stock|share price|inflation|dividend|fee|tax|revenue|apr|apy)(?!\p{L})/iu
const HOURS_CTX = /(?<!\p{L})(mở cửa|mo cua|đóng cửa|dong cua|mở đến|mo den|mở từ|mo tu|giờ mở|gio mo|hoạt động|hoat dong|khởi hành|khoi hanh|cất cánh|cat canh|hạ cánh|ha canh|xuất phát|xuat phat|chạy lúc|suất chiếu|suat chieu|giờ chạy|gio chay|check-?in|check-?out|nhận phòng|trả phòng|open|opens|close|closes|until|depart|departs|departure|arrive|showtime)(?!\p{L})/iu
const RATING_RE = /(\d[.,]\d|\d)\s*(?:⭐|★|\/\s*5(?!\d)|sao(?!\p{L})|stars?(?!\p{L}))|(?:điểm|diem|rating|đánh giá|danh gia)\s*(?:trung bình\s*)?(\d[.,]\d)(?!\d)/giu
// "hơn 3.000 đánh giá" / "trên 1.000" / "gần 500": a qualified count is a BOUND, not an exact figure.
const REVIEWS_RE = /(?:(hơn|hon|trên|tren|over|more than|gần|gan|khoảng|khoang|nearly|about|around|~)\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(\+\s*)?(?:lượt\s+)?(?:đánh giá|danh gia|reviews?|nhận xét|nhan xet|ratings)(?!\p{L})/giu
// A dose or a dose RANGE ("500–1.000 mg"): both ends are claims.
const DOSAGE_RE = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?))?\s*(mg|mcg|µg|g(?!\p{L})|ml|iu|ui|viên|vien|gói|goi|giọt|giot)(?:\s*\/\s*(?:kg|ngày|ngay|lần|lan|day))?(?!\p{L})/giu
const DRUG_CTX = /(?<!\p{L})(thuốc|thuoc|liều|lieu|uống|uong|dùng|dung|paracetamol|ibuprofen|aspirin|kháng sinh|khang sinh|vitamin|siro|medication|dose|dosage|tablet|take)(?!\p{L})/iu
const DISTANCE_RE = /(\d+(?:[.,]\d+)?)\s*(km|m)(?!\p{L})/giu
const DISTANCE_CTX = /(?<!\p{L})(cách|cach|xa|gần|gan|đi bộ|di bo|away|from you|distance)(?!\p{L})/iu
const AVAIL_CTX = /(?<!\p{L})(còn phòng|con phong|còn chỗ|con cho|còn hàng|con hang|hết hàng|het hang|hết phòng|het phong|hết chỗ|het cho|còn vé|con ve|hết vé|het ve|đang mở cửa|dang mo cua|đang mở|dang mo|đã đóng cửa|da dong cua|sold out|in stock|out of stock|available now|open now|fully booked)(?!\p{L})/iu
const BOOKING_CTX = /(?<!\p{L})(đã đặt (?:thành công|xong|chỗ|bàn|phòng)|đặt thành công|đã xác nhận đơn|mã đặt chỗ|đơn hàng đã|đã thanh toán|booking (?:is )?confirmed|order (?:has been )?placed|reservation confirmed)(?!\p{L})/iu
const ACTION_TOOLS = /request_action|confirm|book|order|save_|reserve|purchase/i
/** Inclusion / policy claims about an offer: breakfast included, free cancellation, refundable, warranty length. */
const POLICY_RE = /(?<!\p{L})(bao gồm (?:cả )?bữa sáng|kèm bữa sáng|có bữa sáng|miễn phí bữa sáng|breakfast (?:is )?included|free breakfast|hủy miễn phí|huỷ miễn phí|miễn phí hủy|miễn phí huỷ|free cancellation|được hoàn tiền|hoàn tiền 100|refundable|không hoàn tiền|non-refundable|bảo hành chính hãng \d+|bảo hành \d+ (?:tháng|năm)|\d+[- ](?:month|year) warranty|đổi trả (?:miễn phí|trong) \d*)(?!\p{L})/iu
const POLICY_KEYS: Array<[RegExp, RegExp]> = [
  [/bữa sáng|breakfast/i, /bữa sáng|bua sang|breakfast/i],
  [/hủy|huỷ|cancel/i, /hủy|huỷ|huy mien phi|cancel/i],
  [/hoàn tiền|refund/i, /hoàn tiền|hoan tien|refund/i],
  [/bảo hành|warranty/i, /bảo hành|bao hanh|warranty/i],
  [/đổi trả/i, /đổi trả|doi tra|return/i],
]
/** A figure from an OLD page presented as current needs a time qualifier ("năm 2023", "bài cũ", "có thể đã thay đổi"). */
const STALE_QUALIFIER = /(?<!\p{L})(năm|tháng)\s*\d|20\d{2}|(?<!\p{L})(cũ|trước đây|đã lâu|thời điểm đó|lúc đó|có thể đã thay đổi)(?!\p{L})|as of|in 20\d{2}|outdated/iu

/** "chưa xác minh được giá phòng" / "not verified": the sentence discloses that its figure is not checked. */
const DISCLOSED = /(?<!\p{L})(chưa|không)\s+(?:\S+\s+){0,3}?(xác minh|xác nhận|kiểm chứng|chắc chắn|kiểm tra được)|có thể đã (?:thay đổi|khác)|theo (?:thông tin|dữ liệu) cũ|theo trí nhớ|không phải (?:giá|số liệu) hiện tại|not (?:yet )?(?:verified|confirmed)|unverified|may have changed|from memory/iu
const PLANNING = /(?<!\p{L})(ngân sách|ngan sach|dự trù|du tru|ước tính|uoc tinh|ước chừng|chi phí dự kiến|tổng chi phí|chi tiêu|budget|estimate|estimated)(?!\p{L})/iu
const ESTIMATE = /(?<!\p{L})(khoảng|tầm|chừng|ước tính|dự trù|around|about|roughly)(?!\p{L})/iu

interface Raw { category: ClaimCategory; value: string; nums: number[]; lo?: number; hi?: number; polarity?: 'positive' | 'negative' | null; bound?: 'lower' | 'approx' }

/** The checkable claims of one sentence (URLs and markdown link targets removed first). */
export function claimsIn(sentence: string): Raw[] {
  const s = sentence.replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ')
  const out: Raw[] = []
  const market = MARKET_CTX.test(s)
  for (const c of extractMoneyClaims(s)) out.push({ category: market ? 'market' : 'price', value: c.raw, nums: [c.lo, c.hi], lo: c.lo, hi: c.hi })
  if (market) for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) out.push({ category: 'market', value: m[0], nums: [Number(m[1].replace(',', '.'))] })
  if (HOURS_CTX.test(s)) {
    const ts = [...new Set(clockTimes(s))]
    if (ts.length) out.push({ category: 'hours', value: ts.map(t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`).join(','), nums: ts })
  }
  for (const m of s.matchAll(RATING_RE)) { const v = Number((m[1] ?? m[2]).replace(',', '.')); if (v > 0 && v <= 5) out.push({ category: 'rating', value: m[0], nums: [v] }) }
  for (const m of s.matchAll(REVIEWS_RE)) out.push({ category: 'review_count', value: m[0], nums: numbersOf(m[2]), bound: m[3] || /^(hơn|hon|trên|tren|over|more than)$/i.test(m[1] ?? '') ? 'lower' : m[1] ? 'approx' : undefined })
  // mg / mcg / µg are dose units by themselves (measured NF-H2: "Không vượt quá 4.000 mg trong 24 giờ" named no drug in its sentence).
  if (DRUG_CTX.test(s) || /\d\s*(?:mg|mcg|µg)(?!\p{L})/iu.test(s)) for (const m of s.matchAll(DOSAGE_RE)) out.push({ category: 'dosage', value: m[0], nums: [...numbersOf(m[1]), ...(m[2] ? numbersOf(m[2]) : [])] })
  if (DISTANCE_CTX.test(s)) for (const m of s.matchAll(DISTANCE_RE)) out.push({ category: 'distance', value: m[0], nums: [Number(m[1].replace(',', '.')) * (m[2].toLowerCase() === 'm' ? 0.001 : 1)] })
  if (AVAIL_CTX.test(s)) out.push({ category: 'availability', value: s.match(AVAIL_CTX)![0], nums: [], polarity: availabilityPolarity(s) })
  if (BOOKING_CTX.test(s)) out.push({ category: 'booking_status', value: s.match(BOOKING_CTX)![0], nums: [] })
  if (POLICY_RE.test(s)) out.push({ category: 'policy', value: s.match(POLICY_RE)![0], nums: numbersOf(s.match(POLICY_RE)![0]) })
  return out
}

// ── judging ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function supported(c: Raw, ix: Index, ev: GateEvidence): boolean {
  switch (c.category) {
    case 'price': case 'market':
      if (c.lo !== undefined && c.hi !== undefined) {
        const one = (v: number) => near(v, ix.money) || near(v, ix.nums)
        if (one(c.lo) && one(c.hi)) return true
        return ix.bands.some(b => amountWithinBand(c.lo!, c.hi!, b))
      }
      return c.nums.every(v => near(v, ix.nums, 0.001, 0.01))
    case 'hours': return c.nums.every(t => ix.times.has(t))
    case 'rating': return c.nums.every(v => near(v, ix.nums, 0, 0.05))
    // "hơn N" is supported by an actual count in [N, 1.5 N]; "khoảng N" by one within 10 %; a bare N by N itself.
    case 'review_count': return c.nums.every(v => c.bound === 'lower' ? ix.nums.some(x => Number.isInteger(x) && x >= v && x <= v * 1.5) : c.bound === 'approx' ? near(v, ix.nums, 0.1, 0.5) : near(v, ix.nums, 0, 0.5))
    case 'dosage': return c.nums.every(v => near(v, ix.nums, 0, 0.001))
    case 'distance': return c.nums.every(v => near(v, ix.nums, 0.05, 0.05) || near(v * 1000, ix.nums, 0.05, 1))
    case 'availability': return c.polarity === 'positive' ? ix.positive : c.polarity === 'negative' ? ix.negative : ix.positive || ix.negative
    case 'booking_status': return ev.tools.some(t => ACTION_TOOLS.test(t))
    case 'policy': {
      const key = POLICY_KEYS.find(([k]) => k.test(c.value))
      if (!key) return false
      const hay = ev.corpus.some(t => key[1].test(t.includes('\\u') ? t.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))) : t))
      return hay && c.nums.every(v => near(v, ix.nums, 0, 0.001))
    }
  }
}

function userGiven(c: Raw, ix: Index): boolean {
  if (!c.nums.length) return false
  if (c.lo !== undefined) return near(c.lo, ix.userMoney, 0, 1) && near(c.hi!, ix.userMoney, 0, 1)
  return c.nums.every(v => near(v, ix.user, 0, 0.001))
}

/** Money derived from known values: a ± b, a × n, a ÷ n (n 2–12 or a user number), a × p % — the reply's own arithmetic. */
function derived(v: number, known: readonly number[], factors: readonly number[]): boolean {
  const ks = known.slice(0, 80)
  for (const a of ks) {
    for (const n of factors) if (near(v, [a * n], 0.02, 1) || (n !== 0 && near(v, [a / n], 0.02, 1)) || (n > 0 && n <= 100 && near(v, [a * n / 100], 0.02, 1))) return true
    for (const b of ks) if (a !== b && (near(v, [a + b], 0.02, 1) || near(v, [Math.abs(a - b)], 0.02, 1))) return true
  }
  return false
}

const CATEGORY_WORDS: Record<ClaimCategory, { vi: string; en: string }> = {
  price: { vi: 'giá hiện tại', en: 'the current price' },
  market: { vi: 'số liệu tài chính / thị trường hiện tại', en: 'current financial / market figures' },
  hours: { vi: 'giờ mở cửa / lịch giờ', en: 'opening hours / schedule times' },
  rating: { vi: 'điểm đánh giá', en: 'the rating' },
  review_count: { vi: 'số lượt đánh giá', en: 'the review count' },
  availability: { vi: 'tình trạng còn chỗ / còn hàng / đang mở', en: 'availability' },
  policy: { vi: 'điều kiện đi kèm (bữa sáng, hủy / hoàn tiền, bảo hành)', en: 'the included terms (breakfast, cancellation / refund, warranty)' },
  dosage: { vi: 'liều dùng cụ thể (bạn xem hướng dẫn trên nhãn hoặc hỏi dược sĩ, bác sĩ)', en: 'the exact dosage (check the label or ask a pharmacist or doctor)' },
  distance: { vi: 'khoảng cách', en: 'the distance' },
  booking_status: { vi: 'trạng thái đặt chỗ / đơn hàng', en: 'the booking / order status' },
}

/**
 * The gate. `text` = the reply prose after the specialised guards (M4-supported sentences arrive as opaque tokens and are skipped;
 * machine blocks are skipped). Returns the gated text and the per-claim classification (for the trace).
 */
export function noFabricationGate(text: string, ev: GateEvidence, o: { lang?: string } = {}): GateResult {
  const counts: Record<ClaimState, number> = { FACT: 0, INFERENCE: 0, UNKNOWN: 0, CONFLICT: 0, FABRICATED: 0 }
  const claims: GateClaim[] = []
  if (!/\d|còn|hết|đang mở|đã đặt|đặt thành công|bữa sáng|hủy|huỷ|hoàn tiền|bảo hành|đổi trả|in stock|sold out|confirmed|breakfast|cancel|refund|warranty/i.test(text)) return { text, claims, removedSentences: 0, noteAdded: false, counts }
  const ix = buildIndex(ev)
  const spans = sentenceSpans(text)
  const doomed = new Set<number>()
  const fabricatedCats = new Set<ClaimCategory>()
  const conflictNotes: string[] = []
  // Values the reply may compute from: the user's, and the evidence's (money amounts and plain figures ≥ 1.000 from structured rows).
  const knownMoney = [...new Set([...ix.userMoney, ...ix.money.slice(0, 40), ...ix.nums.filter(n => n >= 1000).slice(0, 40)])]
  const factors = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, ...ix.user.filter(n => n > 0 && n <= 1000)]
  const replyNums = numbersOf(text)
  spans.forEach(([a, b], i) => {
    const sent = text.slice(a, b)
    if (!sent.trim() || /⁣|\[\/?(?:TAPPY_[A-Z]+|FOLLOWUPS|CTA_BUTTONS)\]/.test(sent)) return
    if (/\?\s*$/.test(sent.trim())) return // a question asserts nothing
    const raw = claimsIn(sent)
    if (!raw.length) return
    let bad = false
    for (const c of raw) {
      let state: ClaimState
      if (userGiven(c, ix)) continue
      // A figure only an OLD page states, presented as current (no time qualifier), is not a current fact.
      const staleOnly = (c.category === 'price' || c.category === 'market') && c.lo !== undefined && !!ev.stalePrices?.length && near(c.lo, ev.stalePrices, 0.005, 1) && !near(c.lo, ev.freshPrices ?? [], 0.005, 1) && !STALE_QUALIFIER.test(sent)
      if (staleOnly) { state = 'FABRICATED'; bad = true; fabricatedCats.add(c.category); counts[state]++; claims.push({ category: c.category, state, value: c.value.slice(0, 60) }); continue }
      if (supported(c, ix, ev)) {
        state = 'FACT'
        const side = (ev.conflicts ?? []).find(cf => cf.sides.some(x => c.nums.some(v => near(v, numbersOf(x.value), 0.001, 0.01))))
        if (side) {
          const others = side.sides.filter(x => !c.nums.some(v => near(v, numbersOf(x.value), 0.001, 0.01)))
          if (others.length && !others.every(x => numbersOf(x.value).some(v => near(v, replyNums, 0.001, 0.01)))) {
            state = 'CONFLICT'
            conflictNotes.push(`${c.value.trim()} / ${others.map(x => x.value.trim()).join(' / ')}`)
          }
        }
      } else if ((c.category === 'price' || c.category === 'market') && c.lo !== undefined && derived(c.lo, knownMoney, factors) && derived(c.hi!, knownMoney, factors)) state = 'INFERENCE'
      else if (c.category === 'market' && c.lo === undefined && /%/.test(c.value) && knownMoney.length >= 2) state = 'INFERENCE'
      else if (DISCLOSED.test(sent)) state = 'UNKNOWN'
      else if (c.category === 'price' && PLANNING.test(sent) && ESTIMATE.test(sent)) state = 'INFERENCE'
      else { state = 'FABRICATED'; bad = true; fabricatedCats.add(c.category) }
      counts[state]++
      claims.push({ category: c.category, state, value: c.value.slice(0, 60) })
    }
    if (bad) doomed.add(i)
  })
  if (!doomed.size && !conflictNotes.length) return { text, claims, removedSentences: 0, noteAdded: false, counts }
  let out = spans.map(([a, b], i) => doomed.has(i) ? '' : text.slice(a, b)).join('')
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const en = o.lang === 'en'
  const lines: string[] = []
  if (fabricatedCats.size) {
    const what = [...fabricatedCats].map(c => CATEGORY_WORDS[c][en ? 'en' : 'vi'])
    const already = out.split(/(?<=[.!?…])\s+|\n+/).some(x => DISCLOSED.test(x))
    if (!already || fabricatedCats.has('dosage') || fabricatedCats.has('booking_status')) lines.push(en ? `I could not verify ${what.join(', ')} from the sources checked, so I am not stating a figure.` : `Mình chưa xác minh được ${what.join(', ')} từ nguồn đã tra, nên không nêu con số.`)
  }
  if (conflictNotes.length) lines.push(en ? `Note: sources disagree here (${conflictNotes.slice(0, 2).join('; ')}) — check before deciding.` : `Lưu ý: các nguồn ghi khác nhau ở điểm này (${conflictNotes.slice(0, 2).join('; ')}) — nên kiểm tra lại trước khi quyết định.`)
  if (lines.length) {
    // Before the machine blocks the reply carries ([FOLLOWUPS], [CTA_BUTTONS], plan / shopping markers), never inside or after them.
    const at = out.search(/\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z]+)\]/)
    const head = (at < 0 ? out : out.slice(0, at)).replace(/\s+$/, '')
    const tail = at < 0 ? '' : out.slice(at)
    out = `${head}${head ? '\n\n' : ''}${lines.join(' ')}${tail ? `\n\n${tail}` : ''}`
  }
  return { text: out, claims, removedSentences: doomed.size, noteAdded: lines.length > 0, counts }
}
