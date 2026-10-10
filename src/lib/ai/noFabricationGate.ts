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
import { isTitleCaseName, allocationContext, withoutLineLabel } from './snippetPriceGuard'
import { vnClock } from './freshness'

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
  /**
   * Prices that only come from tool rows whose freshness is STALE or UNKNOWN (freshness.ts: older than the max age of their kind of data,
   * or no usable `retrieved_at`). Said as "now" without a time qualifier they stay in the reply — it is not cut — but ONE note says when
   * they were fetched (or that nobody knows) and that they may have changed.
   */
  agedPrices?: ReadonlyArray<{ amount: number; at: string | null }>
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

interface Index { nums: number[]; money: number[]; bands: PriceBand[]; times: Set<number>; positive: boolean; negative: boolean; user: number[]; userMoney: number[]; variantRows: VariantRow[] }

// ── variant pairing ──────────────────────────────────────────────────────────────
// A price belongs to the VARIANT its row names ("iPhone 17 Pro Max 256GB" ₫33.690.000). A figure that is real for one capacity must not
// be said for another ("512GB giá 33.690.000đ"): the figure is in the evidence, the pairing is not. Narrow by design: one capacity and one
// amount in the sentence, rows that name a capacity in their title.
interface VariantRow { caps: Set<string>; prices: number[] }
/** "256GB" / "1 TB" → gigabytes as a string (1TB = 1024). */
export function capacityTokens(text: string): string[] {
  return [...new Set([...text.matchAll(/(?<![\d.,])(\d{1,4})\s?(gb|tb)(?![\p{L}\d])/giu)].map(m => String(Number(m[1]) * (m[2].toLowerCase() === 'tb' ? 1024 : 1))))]
}
function collectVariantRows(node: unknown, out: VariantRow[], depth = 0): void {
  if (depth > 6 || out.length > 400 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const x of node.slice(0, 200)) collectVariantRows(x, out, depth + 1); return }
  const o = node as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title : typeof o.name === 'string' ? o.name : null
  if (title) {
    const caps = capacityTokens(title)
    const prices: number[] = []
    for (const [k, v] of Object.entries(o)) if (/price/i.test(k) && (typeof v === 'string' || typeof v === 'number')) for (const c of extractMoneyClaims(String(v))) prices.push(c.lo)
    if (prices.length) out.push({ caps: new Set(caps), prices })
  }
  for (const v of Object.values(o)) if (v && typeof v === 'object') collectVariantRows(v, out, depth + 1)
}
/** True when the sentence names ONE capacity and ONE amount, the evidence prices that amount only on rows naming a different capacity. */
export function variantPriceMismatch(sentence: string, amount: number, rows: readonly VariantRow[]): boolean {
  const caps = capacityTokens(sentence)
  if (caps.length !== 1) return false
  const priced = rows.filter(r => r.prices.some(p => Math.abs(p - amount) <= Math.max(1, 0.005 * amount)))
  if (!priced.length || priced.some(r => r.caps.size === 0)) return false
  return !priced.some(r => r.caps.has(caps[0]))
}


const STRUCT_TIME = /(\d{1,2}):(\d{2})/g
export function buildIndex(ev: GateEvidence): Index {
  const nums: number[] = [], money: number[] = [], bands: PriceBand[] = []
  const times = new Set<number>()
  let positive = false, negative = false
  for (const raw of ev.corpus) {
    const t = raw.length > 200_000 ? raw.slice(0, 200_000) : raw
    // JSON escapes (à…) are decoded where present, so Vietnamese text in tool results reads as text.
    const decoded = t.includes('\\u') ? t.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))) : t
    // Freshness metadata describes the data, it is not data: a timestamp's digits must never "support" a figure the reply states.
    const text = decoded.replace(/"retrieved_at"\s*:\s*"[^"]*"/g, '"retrieved_at":""').replace(/"freshness"\s*:\s*\{[^{}]*\}/g, '"freshness":{}')
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
  const variantRows: VariantRow[] = []
  for (const raw of ev.corpus) {
    const t = raw.length > 200_000 ? '' : raw.trim()
    if (t[0] !== '{' && t[0] !== '[') continue
    try { collectVariantRows(JSON.parse(t), variantRows) } catch { /* not JSON: no pairing opinion */ }
  }
  return { nums, money, bands, times, positive, negative, user, userMoney, variantRows }
}

const near = (v: number, xs: readonly number[], rel = 0.02, abs = 0) => xs.some(x => Math.abs(v - x) <= Math.max(abs, rel * Math.max(Math.abs(v), Math.abs(x))))

// ── claim extraction ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MARKET_CTX = /(?<!\p{L})(tỷ giá|ty gia|ngoại tệ|giá vàng|gia vang|vàng sjc|vang sjc|cổ phiếu|co phieu|chứng khoán|chung khoan|vn-?index|bitcoin|btc|eth|crypto|tiền điện tử|lãi suất|lai suat|lạm phát|lam phat|cổ tức|co tuc|thuế|thue|(?<!chi\s)phí|(?<!chi\s)phi|lệ phí|le phi|tăng trưởng|tang truong|doanh thu|lợi nhuận|loi nhuan|gdp|interest rate|exchange rate|stock|share price|inflation|dividend|fee|tax|revenue|apr|apy)(?!\p{L})/iu
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
const SPLIT_FRAME = /(?<!\p{L})(phân bổ|phan bo|chia (?:tiền|ngân sách|chi phí|vốn|như sau)|vốn (?:lưu động|dự phòng|vận hành)|quỹ (?:dự phòng|vận hành|lưu động)|khoản dự phòng|để riêng|giữ lại|dự trù|du tru|dự toán|ước tính|uoc tinh|dự kiến|khoản chi|hạng mục|cost breakdown|allocation|estimated costs?)(?!\p{L})/iu
const BUDGET_HEADER = /(?<!\p{L})(?:ngân sách|ngan sach|budget|vốn|chi phí)(?!\p{L})[^\n]*:\s*(?:\*\*)?\s*$/iu
/** A sentence that names a place / product: "ở Phở Hòa", "tại Highlands", a bold Title-Case name (not a bold label or amount). */
function namesAPlace(sentence: string): boolean {
  if (/(?<!\p{L})(?:ở|tại|quán|nhà hàng|khách sạn|at)\s+\p{Lu}\p{Ll}*\s+\p{Lu}/u.test(sentence)) return true
  return [...sentence.matchAll(/\*\*([^*\n]{2,80})\*\*/g)].some(m => isTitleCaseName(m[1]))
}

// ── CONSULTATIVE_IN_AGENT (`illustrations`): a WORKED EXAMPLE is not a claim about the world ─────────────────────────────────────
//
// 🚨 Measured (UAT 2026-10-10, "giải thích lãi đơn và lãi kép"): the reply's example — "Ví dụ gửi 10 triệu, lãi 10%/năm: … sau năm đầu có
// 11 triệu; năm sau … 12,1 triệu" — was judged line by line: 10 triệu / 11 triệu / 12,1 triệu are in no evidence and not the user's, so each
// was FABRICATED, three sentences were cut and the reply ended "Mình chưa xác minh được giá …, nên không nêu con số." A hypothetical
// the speaker defines is not a fact that needs a source. So, under the flag, a money / rate claim is let through (as INFERENCE) only when ALL hold:
//   · the sentence, or one before it in the same block (a list item sits under its lead-in), is introduced as an illustration
//     (ví dụ / giả sử / chẳng hạn / for example …);
//   · the frame is a calculation (lãi, vốn, gốc, gửi, vay, đầu tư, trả góp, N%/năm, sau N năm …) — not a price of a thing;
//   · nothing in the frame says "now" (hôm nay / hiện tại / mới nhất …) and the sentence names no place or product.
// A real price stated without a source ("Vé Bà Nà hôm nay 900.000đ", "Giá phở 50.000đ") is none of these and is judged exactly as before.
const ILLUSTRATION = /(?<!\p{L})(?:ví dụ|vi du|chẳng hạn|chang han|giả sử|gia su|giả định|ví như|for example|for instance|e\.g\.|suppose|imagine)(?!\p{L})/iu
const CURRENT_WORD = /(?<!\p{L})(?:hôm nay|hom nay|hiện tại|hien tai|hiện nay|hien nay|bây giờ|hiện giờ|mới nhất|moi nhat|năm nay|tháng này|today|currently|right now|latest)(?!\p{L})/iu
const CALC_FRAME = /(?<!\p{L})(?:lãi|vốn|gốc|gửi|vay|đầu tư|tiết kiệm|trả góp|tích lũy)(?!\p{L})|\d\s?%\s*\/\s*(?:năm|tháng|kỳ)|sau\s+\d+\s*(?:năm|tháng|kỳ)|interest|principal|compound/iu
function inIllustration(text: string, spans: ReadonlyArray<readonly [number, number]>, i: number): boolean {
  const frame: string[] = [text.slice(spans[i][0], spans[i][1])]
  for (let j = i - 1; j >= 0 && frame.length < 5 && !/\n\s*\n/.test(text.slice(spans[j][1], spans[j + 1][0])); j--) frame.push(text.slice(spans[j][0], spans[j][1]))
  const joined = frame.join(' ')
  return ILLUSTRATION.test(joined) && CALC_FRAME.test(joined) && !CURRENT_WORD.test(joined) && !namesAPlace(frame[0])
}

interface Raw { category: ClaimCategory; value: string; nums: number[]; lo?: number; hi?: number; polarity?: 'positive' | 'negative' | null; bound?: 'lower' | 'approx' }

/** The checkable claims of one sentence (URLs and markdown link targets removed first). */
export function claimsIn(sentence: string): Raw[] {
  const s = sentence.replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ')
  const out: Raw[] = []
  const market = MARKET_CTX.test(s)
  for (const c of extractMoneyClaims(s)) out.push({ category: market ? 'market' : 'price', value: c.raw, nums: [c.lo, c.hi], lo: c.lo, hi: c.hi })
  if (market) for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) out.push({ category: 'market', value: m[0], nums: [Number(m[1].replace(',', '.'))] })
  // POST-UAT (UAT-25 post-fix run): an itinerary SLOT label ("- **10:30–12:00:** Đi bộ … hoạt động miễn phí") is Luna's schedule
  // for the user, not a venue's opening hours — its times are not hours claims. Times elsewhere in the sentence still are.
  const hoursText = s.replace(/^\s*(?:[-*•+]|\d{1,2}[.)])?\s*\**\s*\d{1,2}[:h]\d{2}\s*(?:[–-]\s*\d{1,2}[:h]\d{2})?\s*:?\s*\**\s*:?/, '')
  if (HOURS_CTX.test(hoursText)) {
    const ts = [...new Set(clockTimes(hoursText))]
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

/**
 * Money derived from known values: a ± b, a × n, a ÷ n (n 2–12 or a user number), a × p %, a × (1 ± p %) — the reply's own arithmetic.
 * Post-UAT B2 (UAT-07, measured 2026-10-09): `known` now also carries the values the reply ITSELF already derived in earlier sentences
 * (the gate walks the reply in order), so "lãi 5 triệu" → "tổng 100 triệu + 5 triệu = 105 triệu" is a chain, not a fabricated price.
 * Post-UAT mutation P5 (measured): the percentage forms used EVERY generic factor 2–12, so any figure within 2 % of "budget × n %"
 * passed ("85.000đ" ≈ 12 % of 700k with no 12 % anywhere). Percent forms now use only `pcts` — percentages the user or the sentence
 * actually states; × / ÷ keep the generic factors (per person, per day, multiples).
 */
const GENERIC_FACTORS = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 12])
function derived(v: number, known: readonly number[], factors: readonly number[], pcts: readonly number[] = []): boolean {
  const ks = known.slice(0, 120)
  for (const a of ks) {
    // Generic × / ÷ (2–12) at 1 %: real per-person / per-day splits round well inside it ("1 triệu / 3 ≈ 333.000"), a coincidence does
    // not ("85.000đ" vs 1 triệu / 12 = 83.333 is 2 %). Factors the user stated keep 2 %.
    for (const n of factors) {
      const tol = GENERIC_FACTORS.has(n) && !pcts.includes(n) ? 0.01 : 0.02
      if (near(v, [a * n], tol, 1) || (n !== 0 && near(v, [a / n], tol, 1))) return true
    }
    for (const n of pcts) if (n > 0 && n <= 100 && (near(v, [a * n / 100], 0.02, 1) || near(v, [a * (100 + n) / 100], 0.005, 1) || near(v, [a * (100 - n) / 100], 0.005, 1))) return true
    for (const b of ks) if (a !== b && (near(v, [a + b], 0.02, 1) || near(v, [Math.abs(a - b)], 0.02, 1))) return true
  }
  return false
}

// ── deterministic arithmetic: "100 triệu × 5% × 12/12 = 5 triệu", "100 triệu × (1 + 5%)^2 ≈ 110,25 triệu" ─────────────────────────

const UNIT_MULT: Array<[RegExp, number]> = [[/^(?:tỷ|tỉ|ty|billion|bn)/iu, 1e9], [/^(?:triệu|trieu|tr(?!\p{L})|million|m(?!\p{L}))/iu, 1e6], [/^(?:nghìn|nghin|ngàn|ngan|k(?!\p{L})|thousand)/iu, 1e3]]

/** A tiny recursive-descent evaluator over + − × ÷ ^ ( ) with VN number formats, money units and %. Returns null on anything else. */
export function evalExpression(src: string): number | null {
  const s = src.replace(/[−–]/g, '-').replace(/[×x✕*]/g, '*').replace(/[÷:]/g, '/').replace(/\s+/g, ' ').trim()
  let i = 0
  const ws = () => { while (s[i] === ' ') i++ }
  const num = (): number | null => {
    ws()
    const m = /^(\d{1,3}(?:[.,]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?)/.exec(s.slice(i))
    if (!m) return null
    i += m[0].length
    let v = /^\d{1,3}([.,]\d{3})+$/.test(m[0]) ? Number(m[0].replace(/[.,]/g, '')) : Number(m[0].replace(',', '.'))
    ws()
    for (const [re, k] of UNIT_MULT) { const u = re.exec(s.slice(i)); if (u) { v *= k; i += u[0].length; break } }
    ws()
    if (s[i] === '%') { v /= 100; i++ }
    ws()
    // "đồng", "VND", "₫", "đ", "/năm", "/tháng" after an operand are labels, not operators.
    const lab = /^(?:đồng|dong|vnd|vnđ|₫|đ(?!\p{L}))/iu.exec(s.slice(i)); if (lab) i += lab[0].length
    const per = /^\/\s*(?:năm|nam|tháng|thang|year|month|người|nguoi|ngày|ngay)(?!\p{L})/iu.exec(s.slice(i)); if (per) i += per[0].length
    return v
  }
  const atom = (): number | null => {
    ws()
    if (s[i] === '(') { i++; const v = sum(); ws(); if (s[i] !== ')') return null; i++; return v }
    return num()
  }
  const pow = (): number | null => {
    const b = atom(); if (b === null) return null
    ws()
    if (s[i] === '^') { i++; const e = atom(); if (e === null || e > 1000) return null; return Math.pow(b, e) }
    return b
  }
  const prod = (): number | null => {
    let v = pow(); if (v === null) return null
    for (;;) {
      ws()
      const op = s[i]
      if (op !== '*' && op !== '/') return v
      i++
      const r = pow(); if (r === null) return null
      v = op === '*' ? v * r : r === 0 ? NaN : v / r
    }
  }
  function sum(): number | null {
    let v = prod(); if (v === null) return null
    for (;;) {
      ws()
      const op = s[i]
      if (op !== '+' && op !== '-') return v
      i++
      const r = prod(); if (r === null) return null
      v = op === '+' ? v + r : v - r
    }
  }
  const v = sum()
  ws()
  return v !== null && i === s.length && Number.isFinite(v) ? v : null
}

/**
 * The arithmetic a sentence shows: each "<expression> = <result>" chain, evaluated. `checked` = results the expression supports;
 * `wrong` = results it contradicts (a wrong sum is not made true by being written as a sum). Only expressions with an operator count.
 */
export function arithmeticIn(sentence: string): { checked: number[]; wrong: number[] } {
  const checked: number[] = [], wrong: number[] = []
  const plain = sentence.replace(/\*\*/g, '').replace(/[≈]/g, '=')
  const parts = plain.split('=')
  if (parts.length < 2) return { checked, wrong }
  for (let k = 0; k + 1 < parts.length; k++) {
    // left: the LONGEST suffix of the segment that parses as an expression with an operator (starts at a digit or "(");
    // right: the leading number (+ unit) of the next segment.
    const seg = parts[k].replace(/\s+$/, '')
    let lv: number | null = null
    for (let p = 0; p < seg.length && lv === null; p++) {
      if (!/[\d(]/.test(seg[p]) || (p > 0 && /[\d.,]/.test(seg[p - 1]))) continue
      const tail = seg.slice(p)
      if (!/[+\-−–×x✕*/÷^%]/.test(tail.replace(/\d{1,3}(?:[.,]\d{3})+/g, '0'))) continue
      lv = evalExpression(tail)
    }
    // A LABELLED sum ("ăn uống 410.000đ + cà phê 100.000đ + đi lại 200.000đ = 910.000đ"): a pure "+" chain whose terms are money
    // amounts with words between them — the amounts after the line's label (last ":") are summed.
    if (lv === null && /\+/.test(seg) && !/[×✕*÷^]|\d\s*\/\s*\d/.test(seg)) {
      const terms = seg.slice(seg.lastIndexOf(':') + 1).split('+')
      const amounts = terms.map(t => extractMoneyClaims(t))
      if (terms.length >= 2 && amounts.every(a => a.length === 1 && a[0].lo === a[0].hi)) lv = amounts.reduce((s, a) => s + a[0].lo, 0)
    }
    const rightM = /^\s*((?:\d{1,3}(?:[.,]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?)\s*(?:tỷ|tỉ|triệu|trieu|tr(?!\p{L})|nghìn|ngàn|k(?!\p{L}))?)/iu.exec(parts[k + 1])
    const rv = rightM ? evalExpression(rightM[1]) : null
    if (lv === null || rv === null) continue
    if (Math.abs(lv - rv) <= Math.max(1, 0.006 * Math.abs(lv))) checked.push(rv)
    else wrong.push(rv)
  }
  return { checked, wrong }
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
export function noFabricationGate(text: string, ev: GateEvidence, o: { lang?: string; illustrations?: boolean } = {}): GateResult {
  const counts: Record<ClaimState, number> = { FACT: 0, INFERENCE: 0, UNKNOWN: 0, CONFLICT: 0, FABRICATED: 0 }
  const claims: GateClaim[] = []
  if (!/\d|còn|hết|đang mở|đã đặt|đặt thành công|bữa sáng|hủy|huỷ|hoàn tiền|bảo hành|đổi trả|in stock|sold out|confirmed|breakfast|cancel|refund|warranty/i.test(text)) return { text, claims, removedSentences: 0, noteAdded: false, counts }
  const ix = buildIndex(ev)
  const spans = sentenceSpans(text)
  const doomed = new Set<number>()
  const fabricatedCats = new Set<ClaimCategory>()
  const conflictNotes: string[] = []
  const agedAt = new Set<string>() // fetch times of prices said as current from stale/unknown-time rows ('' = nobody knows when)
  // Values the reply may compute from: the user's, and the evidence's (money amounts and plain figures ≥ 1.000 from structured rows).
  const knownMoney = [...new Set([...ix.userMoney, ...ix.money.slice(0, 40), ...ix.nums.filter(n => n >= 1000).slice(0, 40)])]
  const factors = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, ...ix.user.filter(n => n > 0 && n <= 1000)]
  const replyNums = numbersOf(text)
  let wrongMath = false
  spans.forEach(([a, b], i) => {
    const sent = text.slice(a, b)
    if (!sent.trim() || /⁣|\[\/?(?:TAPPY_[A-Z]+|FOLLOWUPS|CTA_BUTTONS)\]/.test(sent)) return
    if (/\?\s*$/.test(sent.trim())) return // a question asserts nothing
    const raw = claimsIn(sent)
    if (!raw.length) return
    // B2: the sentence's own shown arithmetic, evaluated by code (Luna's arithmetic is not trusted, it is checked).
    const math = arithmeticIn(sent)
    // An allocation line states its share ("Ăn uống: 6 triệu (60%)"): the share is a factor for that line only.
    const sentFactors = [...factors, ...[...sent.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map(m => Number(m[1].replace(',', '.'))).filter(n => n > 0 && n <= 100)]
    // Percent forms only with a STATED percentage: the user's numbers ≤ 100 (rates, discounts) and the sentence's own "N %".
    const sentPcts = [...new Set([...ix.user.filter(n => n > 0 && n <= 100), ...sentFactors.slice(factors.length)])]
    // A list item under a planning lead-in ("Gợi ý chia ngân sách 10 triệu:") inherits its planning frame (same block, no blank line).
    let planningFrame = PLANNING.test(sent)
    for (let j = i - 1; !planningFrame && j >= 0 && !/\n\s*\n/.test(text.slice(spans[j][1], a)); j--) if (PLANNING.test(text.slice(spans[j][0], spans[j][1]))) planningFrame = true
    // POST-UAT B3: the allocation allowance needs a SPLIT frame (a split / estimate word, or a budget header line ending ":") and no
    // place named earlier in the block — "Giá 100-200k/người rất hợp budget" after "Mình chọn **X**" is X's price, not a split.
    // Read per LINE (the splitter cuts "- **16:00–17:00:** Cà phê:" at the colon) — the same context the snippet guard uses.
    const actx = allocationContext(text, a + (sent.length - sent.trimStart().length), namesAPlace)
    const splitFrame = SPLIT_FRAME.test(sent) || actx.framed || (actx.slot && ix.userMoney.length > 0)
    // a place named in a list item's / slot's own line is that line's subject
    const ownPlace = namesAPlace(sent) || ((actx.item || actx.slot) && namesAPlace(withoutLineLabel(actx.line)))
    const disclosedAllowance = DISCLOSED.test(sent) && SPLIT_FRAME.test(sent)
    // an explicit category breakdown whose own arithmetic checks ("ăn uống 410k + cà phê 100k + … = 910k") is a split, not a venue's price
    const blockPlace = actx.venueAbove && !actx.item && !actx.slot && !disclosedAllowance && !math.checked.length
    let bad = false
    const illustrative = o.illustrations === true && inIllustration(text, spans, i)
    for (const c of raw) {
      let state: ClaimState
      if (userGiven(c, ix)) { if (c.lo !== undefined) knownMoney.push(c.lo, c.hi!); continue }
      // CONSULTATIVE_IN_AGENT: a figure inside a worked calculation example is the example's own, not a claim to source (see `inIllustration`).
      if (illustrative && (c.category === 'price' || c.category === 'market')) { state = 'INFERENCE'; counts[state]++; claims.push({ category: c.category, state, value: c.value.slice(0, 60) }); continue }
      const isMoney = (c.category === 'price' || c.category === 'market') && c.lo !== undefined
      // A result the sentence's own expression contradicts is a wrong calculation, never a fact (even if the figure appears elsewhere).
      if (isMoney && math.wrong.some(w => near(w, [c.lo!], 0.002, 1)) && !math.checked.some(w => near(w, [c.lo!], 0.002, 1))) {
        state = 'FABRICATED'; bad = true; wrongMath = true; counts[state]++; claims.push({ category: c.category, state, value: c.value.slice(0, 60) }); continue
      }
      // A real figure paired with the wrong VARIANT (the 256GB price said for 512GB) is not a fact about that variant.
      if (c.category === 'price' && c.lo !== undefined && raw.filter(r => r.category === 'price').length === 1 && variantPriceMismatch(sent, c.lo, ix.variantRows)) { state = 'FABRICATED'; bad = true; fabricatedCats.add(c.category); counts[state]++; claims.push({ category: c.category, state, value: c.value.slice(0, 60) }); continue }
      // A figure only an OLD page states, presented as current (no time qualifier), is not a current fact.
      const staleOnly = (c.category === 'price' || c.category === 'market') && c.lo !== undefined && !!ev.stalePrices?.length && near(c.lo, ev.stalePrices, 0.005, 1) && !near(c.lo, ev.freshPrices ?? [], 0.005, 1) && !STALE_QUALIFIER.test(sent)
      if (staleOnly) { state = 'FABRICATED'; bad = true; fabricatedCats.add(c.category); counts[state]++; claims.push({ category: c.category, state, value: c.value.slice(0, 60) }); continue }
      if (supported(c, ix, ev)) {
        state = 'FACT'
        // A price that only STALE / UNKNOWN-time rows state, said as current: kept, with ONE note (never cut, never silently "now").
        if (isMoney && ev.agedPrices?.length && !STALE_QUALIFIER.test(sent) && near(c.lo!, ev.agedPrices.map(x => x.amount), 0.005, 1) && !near(c.lo!, ev.freshPrices ?? [], 0.005, 1) && !near(c.lo!, ix.userMoney, 0, 1)) {
          agedAt.add(ev.agedPrices.find(x => near(c.lo!, [x.amount], 0.005, 1))?.at ?? '')
        }
        const side = (ev.conflicts ?? []).find(cf => cf.sides.some(x => c.nums.some(v => near(v, numbersOf(x.value), 0.001, 0.01))))
        if (side) {
          const others = side.sides.filter(x => !c.nums.some(v => near(v, numbersOf(x.value), 0.001, 0.01)))
          if (others.length && !others.every(x => numbersOf(x.value).some(v => near(v, replyNums, 0.001, 0.01)))) {
            state = 'CONFLICT'
            conflictNotes.push(`${c.value.trim()} / ${others.map(x => x.value.trim()).join(' / ')}`)
          }
        }
      } else if (isMoney && (math.checked.some(w => near(w, [c.lo!], 0.002, 1)) || (derived(c.lo!, knownMoney, sentFactors, sentPcts) && derived(c.hi!, knownMoney, sentFactors, sentPcts)))) state = 'INFERENCE'
      else if (c.category === 'market' && c.lo === undefined && /%/.test(c.value) && (knownMoney.length >= 2 || near(c.nums[0], ix.user, 0, 0.001))) state = 'INFERENCE'
      else if (DISCLOSED.test(sent)) state = 'UNKNOWN'
      else if (c.category === 'price' && planningFrame && ESTIMATE.test(sent)) state = 'INFERENCE'
      // POST-UAT B3: an item of a split of the USER'S envelope ("- Ăn sáng: 40.000đ" under "Chia ngân sách 700k:") is a planning
      // allowance, not a merchant price — when it names no place and stays within the envelope. A place-named line stays judged.
      else if (c.category === 'price' && splitFrame && !blockPlace && ix.userMoney.length > 0 && c.hi! <= Math.max(...ix.userMoney) * 1.05 && !ownPlace && !near(c.lo!, ix.userMoney, 0, 1)) state = 'INFERENCE'
      else { state = 'FABRICATED'; bad = true; fabricatedCats.add(c.category) }
      // A supported / derived amount is a value the next sentences may compute from (chained arithmetic).
      if ((state === 'FACT' || state === 'INFERENCE' || state === 'CONFLICT') && isMoney) knownMoney.push(c.lo!, c.hi!)
      counts[state]++
      claims.push({ category: c.category, state, value: c.value.slice(0, 60) })
    }
    if (bad) doomed.add(i)
  })
  if (!doomed.size && !conflictNotes.length && !agedAt.size) return { text, claims, removedSentences: 0, noteAdded: false, counts }
  let out = spans.map(([a, b], i) => doomed.has(i) ? '' : text.slice(a, b)).join('')
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const en = o.lang === 'en'
  const lines: string[] = []
  if (fabricatedCats.size) {
    const what = [...fabricatedCats].map(c => CATEGORY_WORDS[c][en ? 'en' : 'vi'])
    const already = out.split(/(?<=[.!?…])\s+|\n+/).some(x => DISCLOSED.test(x))
    // B2: "from the sources checked" is only true when something was looked up this turn.
    const looked = ev.tools.length > 0
    if (!already || fabricatedCats.has('dosage') || fabricatedCats.has('booking_status')) lines.push(en
      ? `I could not verify ${what.join(', ')} ${looked ? 'from the sources checked' : '(nothing was looked up for it)'}, so I am not stating a figure.`
      : `Mình chưa xác minh được ${what.join(', ')} ${looked ? 'từ nguồn đã tra' : '(chưa có nguồn tra cứu cho số liệu này)'}, nên không nêu con số.`)
  }
  if (wrongMath && !fabricatedCats.size) lines.push(en ? 'I removed a calculated figure that did not check out against its own formula.' : 'Mình đã bỏ một kết quả tính không khớp với chính công thức của nó.')
  if (agedAt.size) {
    const stamped = [...agedAt].filter(Boolean).map(vnClock).filter(Boolean)
    const someUnknown = agedAt.has('')
    lines.push(en
      ? `Note: the prices above ${stamped.length ? `were fetched at ${stamped.join(' / ')}` : 'have no known fetch time'}${someUnknown && stamped.length ? ' (one source has no known time)' : ''}, so they may have changed — check before deciding.`
      : `Lưu ý: ${stamped.length ? `giá ở trên lấy từ kết quả tra lúc ${stamped.join(' / ')}` : 'chưa rõ giá ở trên được lấy lúc nào'}${someUnknown && stamped.length ? ' (một nguồn không rõ thời điểm)' : ''}, có thể đã thay đổi — nên kiểm tra lại trước khi quyết định.`)
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
