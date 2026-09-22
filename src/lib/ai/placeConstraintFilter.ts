import { normalizeVN } from './intent'
import type { Budget } from './budget'
import { vietnamNow } from './tools/serperPlaces'
import { bandFromRow, parsePriceBand as parseProviderBand } from '@/lib/recommendation/priceBand'

// ── THE USER'S CONSTRAINTS SHAPE THE ROWS, NOT ONLY THE TEXT ─────────────────
//
// Phase 7, group 3 (owner screenshots 4 + golden set T3/G3, 2026-09-22). "chọn quán rẻ tiền thôi,
// 50-60k thôi mé gì toàn nhà hàng" produced a reply whose prose picked one cheap place — and a
// card row of eight that still carried "NHÀ HÀNG NGON", "Quán Bụi … Authentic Vietnamese
// Cuisine" and places with no price at all, presented as if they fit. The budget reached the
// prompt (the model reasoned about it) and the web-snippet filter (`applyBudgetFilter` touches
// `search_results`, never `results`), but the ROWS the card and the ranker read were never
// constrained. Text and cards disagreed because they were built from different rules.
//
// This is the one place the stated constraints are applied to the place rows, BEFORE ranking, so
// the ranked set the model reads and the card the client renders are the same set:
//
//   · BUDGET — a row whose provider price band lies entirely ABOVE the budget is dropped. A band
//     that overlaps ("1-100.000 ₫" against 60k) is kept but ranks below a band that fits; a row
//     with NO band is kept and counted, and the reply is told to say the price is unconfirmed
//     rather than to present it as fitting. Nothing here invents a price.
//   · VENUE TYPE — when the user rules a type OUT ("không nhà hàng", "toàn nhà hàng", "rẻ tiền /
//     bình dân", "thôi không nhậu"), rows whose own NAME says they are that type are dropped.
//     Only the name: Google's `types` call every eatery a "restaurant", which decides nothing.
//   · OPEN NOW — when the request is for now ("trưa nay", "tối nay" while it is evening, "đang mở
//     cửa"), a row the schedule says is closed is not dropped but moves to the end, so it cannot
//     rank first. A request for another time is left alone: the schedule is not consulted for it.
//
// 🚨 EVERYTHING REMOVED IS ACCOUNTED FOR. The result carries `_tappy_constraint_note`, which the
// model must relay: what was excluded and why, and how many kept rows have no price data. An
// honest "price unconfirmed" beats a card that quietly pretends to fit.

export type ExcludedVenueType = 'restaurant' | 'drinking'

export interface PlaceConstraints {
  /** The budget ceiling in VND, when the user stated one on this turn or in the thread. */
  budgetMax: number | null
  /** Venue types the user ruled out on this turn. */
  exclude: ExcludedVenueType[]
  /** The request is for right now — closed rows rank last. */
  openNow: boolean
}

export interface ConstraintFilterOutcome {
  result: unknown
  dropped: Array<{ name: string; reason: 'over_budget' | 'venue_type' }>
  demotedClosed: number
  /** Kept rows with no provider price band while a budget was stated. */
  priceUnknown: number
  /** Kept rows whose band fits the budget entirely. */
  priceFits: number
  note: string | null
}

/**
 * The row's provider band, as `recommendation/priceBand.ts` already parses it for the guard and
 * the card: "1-100.000 ₫" → {lo: 0, hi: 100000} (the leading 1 is an open lower bound),
 * "100-200 N ₫" → {lo: 100000, hi: 200000}, "Trên 1 Tr ₫" → {lo: 1e6, hi: null}. One parser,
 * so the filter, the guard and the card can never disagree about what a band means.
 */
export function parsePriceBand(text: unknown): { lo: number; hi: number | null } | null {
  const band = parseProviderBand(typeof text === 'string' ? text : null)
  if (!band) return null
  return { lo: band.lo, hi: Number.isFinite(band.hi) ? band.hi : null }
}

const EXCLUDE_RESTAURANT_RE = /khong (?:phai |can )?nha hang|toan nha hang|nha hang (?:qua|het)|\bre tien\b|\bbinh dan\b|\bquan nho\b|\bvia he\b|\bre thoi\b|\bre re\b|\bcheap\b/
const EXCLUDE_DRINKING_RE = /khong (?:di |an |uong )?nhau|thoi (?:khong )?nhau|khong (?:uong )?bia|khong bar\b|het nhau|bo nhau/
const OPEN_NOW_RE = /dang mo(?: cua)?|\bmo cua\b|bay gio|ngay bay gio|luc nay|\bopen now\b|\bright now\b/

/** VN-hour meal period of the request, when the text names one. */
function requestedPeriod(t: string): 'morning' | 'lunch' | 'afternoon' | 'evening' | null {
  if (/\btrua (?:nay|hom nay)\b|\ban trua\b|\blunch\b/.test(t)) return 'lunch'
  if (/\btoi (?:nay|hom nay)\b|\ban toi\b|\bdinner\b|\btonight\b/.test(t)) return 'evening'
  if (/\bsang (?:nay|hom nay)\b|\ban sang\b|\bbreakfast\b/.test(t)) return 'morning'
  if (/\bchieu (?:nay|hom nay)\b/.test(t)) return 'afternoon'
  return null
}

function currentPeriod(now: { minutes: number }): 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night' {
  const h = now.minutes / 60
  if (h >= 6 && h < 10.5) return 'morning'
  if (h >= 10.5 && h < 14) return 'lunch'
  if (h >= 14 && h < 17) return 'afternoon'
  if (h >= 17 && h < 23) return 'evening'
  return 'night'
}

/**
 * The constraints this turn states. `budget` is the route's own reading of the turn (or the
 * thread's, when the turn restates nothing); exclusions are read from the LAST user text only —
 * a correction lives there, and an earlier "quán nhậu" must not outlive "thôi không nhậu nữa".
 */
export function detectPlaceConstraints(
  lastText: string,
  budget: Budget | null | undefined,
  earlierUserTexts: readonly string[] = [],
  now: Date = new Date(),
): PlaceConstraints {
  const t = normalizeVN(String(lastText ?? '').toLowerCase())
  const exclude: ExcludedVenueType[] = []
  if (EXCLUDE_RESTAURANT_RE.test(t)) exclude.push('restaurant')
  if (EXCLUDE_DRINKING_RE.test(t)) exclude.push('drinking')
  // "Now" outlives the turn that said it: "trưa nay ăn gì" → "rẻ tiền thôi" is still lunch today.
  // The nearest earlier turn is read only when this one names no time of its own.
  const period = requestedPeriod(t)
    ?? earlierUserTexts.slice().reverse().map(x => requestedPeriod(normalizeVN(String(x ?? '').toLowerCase()))).find(p => p !== null)
    ?? null
  const openNow = OPEN_NOW_RE.test(t) || (period !== null && period === currentPeriod(vietnamNow(now)))
  return { budgetMax: budget && budget.max > 0 ? budget.max : null, exclude, openNow }
}

const RESTAURANT_NAME_RE = /\bnha hang\b|\brestaurant\b|\bbistro\b|\bfine dining\b/
const DRINKING_NAME_RE = /\bnhau\b|\bbia\b|\bbeer\b|\bpub\b|\bbar\b|\bclub\b|\blau nuong\b|\bbbq\b/

function venueTypeOf(row: Record<string, unknown>): ExcludedVenueType | null {
  const name = normalizeVN(String(row.name ?? '').toLowerCase())
  if (DRINKING_NAME_RE.test(name)) return 'drinking'
  if (RESTAURANT_NAME_RE.test(name)) return 'restaurant'
  return null
}

function fmtVnd(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toString().replace('.', ',')} triệu` : `${Math.round(n / 1000)}k`
}

/**
 * Apply the constraints to a place tool result's `results` rows. Pure: returns a new result
 * object; the original is not mutated. No-op (same object back) when there is nothing to apply.
 */
export function applyPlaceConstraints(result: unknown, c: PlaceConstraints, lang: string): ConstraintFilterOutcome {
  const empty = { result, dropped: [], demotedClosed: 0, priceUnknown: 0, priceFits: 0, note: null }
  if (!result || typeof result !== 'object') return empty
  const r = result as Record<string, unknown>
  const rows = Array.isArray(r.results) ? (r.results as Array<Record<string, unknown>>) : null
  if (!rows || rows.length === 0) return empty
  if (c.budgetMax === null && c.exclude.length === 0 && !c.openNow) return empty

  const dropped: ConstraintFilterOutcome['dropped'] = []
  const fits: Array<Record<string, unknown>> = []
  const maybe: Array<Record<string, unknown>> = []
  const unknown: Array<Record<string, unknown>> = []
  const closed: Array<Record<string, unknown>> = []
  let priceFits = 0
  let priceUnknown = 0

  for (const row of rows) {
    const name = String(row.name ?? '')
    if (c.exclude.length > 0) {
      const type = venueTypeOf(row)
      if (type && c.exclude.includes(type)) { dropped.push({ name, reason: 'venue_type' }); continue }
    }
    let bucket: 'fits' | 'maybe' | 'unknown' = 'unknown'
    if (c.budgetMax !== null) {
      const band = bandFromRow(row)
      if (band) {
        // Entirely above the budget: the provider's own band says it does not fit.
        if (band.lo > c.budgetMax * 1.05) { dropped.push({ name, reason: 'over_budget' }); continue }
        if (Number.isFinite(band.hi) && band.hi <= c.budgetMax * 1.05) { bucket = 'fits'; priceFits++ }
        else bucket = 'maybe'
      } else {
        priceUnknown++
      }
    }
    if (c.openNow && row.open_now === false) { closed.push(row); continue }
    if (bucket === 'fits') fits.push(row)
    else if (bucket === 'maybe') maybe.push(row)
    else unknown.push(row)
  }

  const ordered = c.budgetMax !== null ? [...fits, ...maybe, ...unknown, ...closed] : [...fits, ...maybe, ...unknown, ...closed]
  const changed = dropped.length > 0 || closed.length > 0 || (c.budgetMax !== null && (fits.length > 0 || maybe.length > 0))
  if (!changed) return empty

  const vi = lang !== 'en'
  const parts: string[] = []
  if (dropped.length > 0) {
    const over = dropped.filter(d => d.reason === 'over_budget').length
    const type = dropped.filter(d => d.reason === 'venue_type').length
    if (vi) {
      const why = [over > 0 && c.budgetMax !== null ? `${over} chỗ vượt ngân sách ${fmtVnd(c.budgetMax)}` : '', type > 0 ? `${type} chỗ thuộc loại hình user không muốn (${c.exclude.map(e => e === 'restaurant' ? 'nhà hàng' : 'quán nhậu/bar').join(', ')})` : ''].filter(Boolean).join('; ')
      parts.push(`HỆ THỐNG ĐÃ LOẠI: ${why} — chỉ viết về các chỗ còn trong results.`)
    } else {
      const why = [over > 0 && c.budgetMax !== null ? `${over} above the ${fmtVnd(c.budgetMax)} budget` : '', type > 0 ? `${type} of an excluded venue type (${c.exclude.join(', ')})` : ''].filter(Boolean).join('; ')
      parts.push(`REMOVED BY THE SYSTEM: ${why} — write only about the remaining results.`)
    }
  }
  if (c.budgetMax !== null && priceUnknown > 0) {
    parts.push(vi
      ? `${priceUnknown} chỗ còn lại KHÔNG có dữ liệu giá (không có price_range_text): nói rõ với user là chưa xác nhận được giá của những chỗ đó, KHÔNG viết "trong tầm giá" cho chúng.${priceFits === 0 ? ' KHÔNG có chỗ nào được xác nhận nằm trong ngân sách — nói thẳng điều này.' : ''}`
      : `${priceUnknown} remaining places have NO price data: say their price is unconfirmed, never present them as within budget.${priceFits === 0 ? ' No place is confirmed within budget — say so plainly.' : ''}`)
  }
  if (closed.length > 0) {
    parts.push(vi
      ? `${closed.length} chỗ đang ĐÓNG CỬA theo lịch (open_now=false) đã được xếp cuối — không chọn chúng làm gợi ý chính; nếu nhắc thì nói rõ đang đóng.`
      : `${closed.length} places are CLOSED by schedule (open_now=false) and were moved last — do not lead with them; say they are closed if mentioned.`)
  }

  const out: Record<string, unknown> = { ...r, results: ordered, count: ordered.length }
  out._tappy_constraint_filter = {
    budget_max: c.budgetMax, exclude: c.exclude, open_now: c.openNow,
    dropped, demoted_closed: closed.length, price_unknown: priceUnknown, price_fits: priceFits,
  }
  const note = parts.length > 0 ? parts.join(' ') : null
  if (note) out._tappy_constraint_note = note
  return { result: out, dropped, demotedClosed: closed.length, priceUnknown, priceFits, note }
}
