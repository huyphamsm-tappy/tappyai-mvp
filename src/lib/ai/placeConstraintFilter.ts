import { normalizeVN } from './intent'
import type { Budget } from './budget'
import { vietnamNow } from './tools/serperPlaces'
import { bandFromRow, parsePriceBand as parseProviderBand } from '@/lib/recommendation/priceBand'
import { statedDistrict, districtRelation, type District } from './districts'

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
//     bình dân", "thôi không nhậu"), rows the provider's TYPES put in that class are dropped
//     (`venueTypeOf`: types first, name as the fallback — see the note there on why the bare
//     Google type "Nhà hàng" cannot be the signal).
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
  /**
   * PRELAUNCH 5b: the district the USER named (this turn, else the nearest earlier turn of the same
   * subject). Rows are kept, ranked and marked by the district their ADDRESS puts them in.
   */
  district?: District | null
}

export interface ConstraintFilterOutcome {
  result: unknown
  dropped: Array<{ name: string; reason: 'over_budget' | 'venue_type' | 'out_of_district' }>
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
  // A district the user named: this turn first, then the nearest earlier turn (the caller passes the
  // CURRENT subject's turns, so a district from another consultation cannot leak in).
  const district = statedDistrict(lastText)
    ?? earlierUserTexts.slice().reverse().map(x => statedDistrict(x)).find(d => d !== null)
    ?? null
  return { budgetMax: budget && budget.max > 0 ? budget.max : null, exclude, openNow, district }
}

/**
 * THE PROVIDER'S TYPES ARE THE PRIMARY SIGNAL; THE NAME IS THE FALLBACK (owner, Session C
 * follow-up). Serper /maps rows carry Google's localised `types` ("Quán bia", "Quán rượu",
 * "Nhà hàng cao cấp"…) in `place_types`. Name matching alone let "Quán Bụi" (types: Nhà hàng
 * Việt Nam / Nhà hàng cơm …) through a "toàn nhà hàng" exclusion — most restaurants do not say
 * "nhà hàng" in their name.
 *
 * 🚨 "Nhà hàng" ON ITS OWN IS NOT A SIGNAL. Google's Vietnamese type vocabulary calls EVERY
 * eatery a "Nhà hàng …" (measured on golden T3: "Cơm Ngon Hà Nội" = "Nhà hàng châu Á", "Béo Ơi
 * Quán" = "Nhà hàng"), so the bare word would exclude the whole result set. What the user
 * means by "toàn nhà hàng / rẻ tiền / bình dân" is the UPSCALE tier: a type that says so
 * (cao cấp, sang trọng, fine dining, steakhouse, buffet, nhà hàng khách sạn, rooftop) or, when
 * the row carries a band, a band the budget rule already handles. A row whose types say
 * nothing either way falls back to its name.
 */
const RESTAURANT_TYPE_RE = /cao cap|sang trong|fine dining|steak|\bbuffet\b|nha hang khach san|hotel restaurant|rooftop|\bbanquet\b|tiec cuoi|nha hang phap|nha hang y\b|french restaurant|italian restaurant|japanese restaurant|nha hang nhat/
const DRINKING_TYPE_RE = /quan bia|\bbia\b|\bbeer\b|\bbar\b|\bpub\b|quan ruou|\bruou\b|\bwine\b|\bclub\b|\blounge\b|karaoke|quan nhau|\bnhau\b|brewery|\bcocktail\b|tap ?room|beer garden|nightclub|vu truong/
const RESTAURANT_NAME_RE = /\bnha hang\b|\brestaurant\b|\bbistro\b|\bfine dining\b/
const DRINKING_NAME_RE = /\bnhau\b|\bbia\b|\bbeer\b|\bpub\b|\bbar\b|\bclub\b|\blau nuong\b|\bbbq\b/

/** The row's provider types, folded, as one haystack (Serper `place_types`; Google `types`/`type`). */
function typesOf(row: Record<string, unknown>): string {
  const raw = Array.isArray(row.place_types) ? row.place_types : Array.isArray(row.types) ? row.types : typeof row.type === 'string' ? [row.type] : []
  return raw.map(t => normalizeVN(String(t ?? '').toLowerCase())).join(' | ')
}

export function venueTypeOf(row: Record<string, unknown>): ExcludedVenueType | null {
  const types = typesOf(row)
  if (types) {
    if (DRINKING_TYPE_RE.test(types)) return 'drinking'
    if (RESTAURANT_TYPE_RE.test(types)) return 'restaurant'
  }
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
  if (c.budgetMax === null && c.exclude.length === 0 && !c.openNow && !c.district) return empty

  const dropped: ConstraintFilterOutcome['dropped'] = []
  const fits: Array<Record<string, unknown>> = []
  const maybe: Array<Record<string, unknown>> = []
  const unknown: Array<Record<string, unknown>> = []
  const closed: Array<Record<string, unknown>> = []
  let priceFits = 0
  let priceUnknown = 0

  for (const raw of rows) {
    let row = raw
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
        // The row itself says its price is unconfirmed, so the model (which reads the compact
        // row, `modelPayload.ts` ROW_KEEP) can never present it as within budget; the guard
        // (`budgetFitGuard`) cuts a fit phrase written about it anyway.
        priceUnknown++
        row = { ...row, _tappy_price_unconfirmed: true }
      }
    }
    if (c.openNow && row.open_now === false) { closed.push(row); continue }
    if (bucket === 'fits') fits.push(row)
    else if (bucket === 'maybe') maybe.push(row)
    else unknown.push(row)
  }

  let ordered = [...fits, ...maybe, ...unknown, ...closed]

  // ── PRELAUNCH 5b: the stated district, by the venue's ADDRESS ───────────────────────────────
  // In-district rows lead (keeping the order above inside them); rows whose address cannot be read
  // follow, marked unconfirmed; rows the address puts in ANOTHER district are dropped — unless
  // nothing is confirmed in the district, in which case they stay as the nearest alternatives,
  // each marked with its real district. Never a row presented as in a district it is not in.
  let district: { label: string; inCount: number; outDropped: number; outKept: number; unconfirmed: number } | null = null
  if (c.district) {
    const d = c.district
    const inD: Array<Record<string, unknown>> = []
    const unkD: Array<Record<string, unknown>> = []
    const outD: Array<{ row: Record<string, unknown>; actual: string }> = []
    for (const row of ordered) {
      const rel = districtRelation(d, row.address)
      if (rel.relation === 'in') inD.push({ ...row, _tappy_district: d.label })
      else if (rel.relation === 'out') outD.push({ row, actual: rel.actual?.label ?? '' })
      else unkD.push({ ...row, _tappy_district_unconfirmed: true })
    }
    if (inD.length > 0) {
      for (const o of outD) dropped.push({ name: String(o.row.name ?? ''), reason: 'out_of_district' })
      ordered = [...inD, ...unkD]
      district = { label: d.label, inCount: inD.length, outDropped: outD.length, outKept: 0, unconfirmed: unkD.length }
    } else {
      ordered = [...unkD, ...outD.map(o => ({ ...o.row, _tappy_out_of_district: o.actual }))]
      district = { label: d.label, inCount: 0, outDropped: 0, outKept: outD.length, unconfirmed: unkD.length }
    }
  }

  const changed = dropped.length > 0 || closed.length > 0 || district !== null || (c.budgetMax !== null && (fits.length > 0 || maybe.length > 0 || priceUnknown > 0))
  if (!changed) return empty

  const vi = lang !== 'en'
  const parts: string[] = []
  if (district) {
    const L = district.label
    if (district.inCount > 0) {
      parts.push(vi
        ? `USER HỎI Ở ${L}: ${district.inCount} chỗ được XÁC NHẬN ở ${L} theo địa chỉ (_tappy_district)${district.outDropped > 0 ? `; ${district.outDropped} chỗ có địa chỉ ở quận khác đã bị loại` : ''}${district.unconfirmed > 0 ? `; ${district.unconfirmed} chỗ chưa xác định được quận từ địa chỉ (_tappy_district_unconfirmed=true) — nếu nhắc thì nói rõ là chưa xác nhận quận` : ''}. CHỈ nói một chỗ "ở ${L}" khi nó có _tappy_district.`
        : `THE USER ASKED FOR ${L}: ${district.inCount} places are CONFIRMED in ${L} by address (_tappy_district)${district.outDropped > 0 ? `; ${district.outDropped} whose address is in another district were removed` : ''}${district.unconfirmed > 0 ? `; ${district.unconfirmed} have an address whose district cannot be confirmed (_tappy_district_unconfirmed=true) — say so if you mention them` : ''}. Only call a place "in ${L}" when it has _tappy_district; places outside ${L} were removed.`)
    } else {
      parts.push(vi
        ? `KHÔNG có chỗ nào được xác nhận ở ${L} theo địa chỉ — NÓI THẲNG điều này trước tiên. Các chỗ còn lại là LỰA CHỌN NGOÀI ${L}: chỗ có _tappy_out_of_district phải được gọi đúng quận thật của nó (giá trị của _tappy_out_of_district); chỗ có _tappy_district_unconfirmed chưa xác nhận được quận. TUYỆT ĐỐI không gọi chỗ nào là "ở ${L}".`
        : `NO place is confirmed in ${L} by address — SAY SO FIRST. The remaining places are alternatives outside ${L}: a place with _tappy_out_of_district must be named with its real district (that field's value); a place with _tappy_district_unconfirmed has an unconfirmed district. Never call any of them "in ${L}".`)
    }
  }
  const overOrType = dropped.filter(d => d.reason === 'over_budget' || d.reason === 'venue_type')
  if (overOrType.length > 0) {
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
      ? `${priceUnknown} chỗ còn lại KHÔNG có dữ liệu giá (đánh dấu _tappy_price_unconfirmed=true, không có price_range_text): nói rõ với user là chưa xác nhận được giá của những chỗ đó, KHÔNG viết "trong tầm giá" cho chúng.${priceFits === 0 ? ' KHÔNG có chỗ nào được xác nhận nằm trong ngân sách — nói thẳng điều này.' : ''}`
      : `${priceUnknown} remaining places have NO price data (_tappy_price_unconfirmed=true): say their price is unconfirmed, never present them as within budget.${priceFits === 0 ? ' No place is confirmed within budget — say so plainly.' : ''}`)
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
    ...(district ? { district: district.label, in_district: district.inCount, out_of_district_kept: district.outKept, district_unconfirmed: district.unconfirmed } : {}),
  }
  const note = parts.length > 0 ? parts.join(' ') : null
  if (note) out._tappy_constraint_note = note
  return { result: out, dropped, demotedClosed: closed.length, priceUnknown, priceFits, note }
}
