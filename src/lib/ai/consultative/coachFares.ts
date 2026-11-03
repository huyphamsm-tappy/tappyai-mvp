// ── CONSULTATIVE_IN_AGENT — coach fares are named for what they are (Round 32, defect 3) ───────────────────────────────────────────────────────────
//
// Live 2026-10-12 (coach, TP.HCM → Quy Nhơn): the reply said "từ 350.000–410.000đ/chiều, tùy nhà xe và loại xe". The data held ONE operator (Phương Trang / FUTA); 350.000 was a
// promotional price in a news article with no date, 410.000 a "từ" (starting-from) price on a listing page. The two were glued into one range, and "tùy nhà xe" claimed a choice of
// operators the data did not show.
//
// What the data decides (any operator, any route; the only fixed list is of operator NAMES, to count how many distinct ones the rows name):
//   · "tùy nhà xe" / "depending on the operator" is kept only when the rows name at least two distinct operators;
//   · a range whose two ends no single row states as a range is written as two figures, each with its kind and host (Round 42 round 3: whatever the
//     kinds of the two ends, and on both flags — see `splitCoachRanges`). A range one source states is left alone.
// Pure: no model, no I/O; text is only ever rewritten around figures the rows really state.

import { extractMoneyClaims, sentenceSpans } from '../moneyGuard'
import type { TextRow } from './priceProvenance'
import { dropUnsupportedVariance, varianceSupport } from './operatorVariance'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

export type FareKind = 'promo' | 'from' | 'plain'
export interface FareFact { amount: number; kind: FareKind; host: string; row: number }

const PROMO_BEFORE = /\b(?:uu dai|khuyen mai|giam gia|giam|qua tang|promo|promotion|discount|sale)\b/
const FROM_BEFORE = /(?:^|\s)(?:tu|from)\s*$/

/** Every VND figure the rows state, with the kind of price the words right before it make it. */
export function fareFactsOf(rows: readonly TextRow[]): FareFact[] {
  const out: FareFact[] = []
  rows.forEach((row, i) => {
    for (const c of extractMoneyClaims(row.text)) {
      if (c.currency !== 'VND') continue
      const before = fold(row.text.slice(Math.max(0, c.start - 44), c.start))
      const kind: FareKind = PROMO_BEFORE.test(before) ? 'promo' : FROM_BEFORE.test(before) ? 'from' : 'plain'
      for (const amount of new Set([Math.round(c.lo), Math.round(c.hi)])) out.push({ amount, kind, host: row.host, row: i })
    }
  })
  return out
}

// operator names → one group each (aliases folded). A name the rows give as "nhà xe <Tên>" and this list does not know still counts as its own operator.
const OPERATORS: ReadonlyArray<readonly string[]> = [
  ['phuong trang', 'futa', 'futabus'], ['thanh buoi'], ['hoang long'], ['kumho', 'kumho samco'], ['mai linh'], ['sao viet'], ['thuan thao'], ['hai van'], ['cuc tung'],
  ['lien hung'], ['van minh'], ['quang hanh'], ['tan hung'], ['huy hoang'], ['xuan truong'], ['hung thanh'], ['anh quan'], ['phu quy'], ['cam van'], ['sinh tourist'], ['the sinh'], ['camel travel'],
]
const NOT_OPERATORS = new Set(['vexere', 'redbus', 'vetau', 'baolau', 'busmap', 'traveloka', 'dat ve', 'online', 'khach'])
const NAMED = /nhà xe\s+((?:\p{Lu}[\p{L}]*)(?:\s+\p{Lu}[\p{L}]*){0,2})/gu

/** How many distinct operators the rows name. */
export function operatorsIn(rows: readonly TextRow[]): Set<string> {
  const found = new Set<string>()
  for (const row of rows) {
    const f = fold(`${row.text} ${row.url}`).replace(/[^a-z0-9]+/g, ' ')
    OPERATORS.forEach((aliases, i) => { if (aliases.some(a => ` ${f} `.includes(` ${a} `))) found.add(`g${i}`) })
    for (const m of row.text.matchAll(NAMED)) {
      const name = fold(m[1]).replace(/[^a-z0-9]+/g, ' ').trim()
      if (!name || NOT_OPERATORS.has(name)) continue
      const known = OPERATORS.findIndex(aliases => aliases.some(a => ` ${name} `.includes(` ${a} `)))
      found.add(known >= 0 ? `g${known}` : `n:${name}`)
    }
  }
  return found
}

// COACH-SPLIT-EN-01: an English reply keeps English digit grouping (350,000đ); Vietnamese keeps 350.000đ. The value never changes.
const fmt = (n: number, lang = 'vi'): string => `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.')}đ`
function label(kind: FareKind, host: string, lang: string): string {
  const en = lang === 'en'
  if (kind === 'promo') return en ? `promotional price in an article on ${host}, no date` : `giá ưu đãi nêu trong bài của ${host}, không ghi ngày`
  if (kind === 'from') return en ? `"from" price on ${host}, not date-specific` : `giá "từ" ở ${host}, chưa theo ngày`
  return en ? `price listed on ${host}` : `giá nêu ở ${host}`
}

interface Span { start: number; end: number; lo: number; hi: number }

function rangesIn(text: string): Span[] {
  const claims = extractMoneyClaims(text).filter(c => c.currency === 'VND')
  const out: Span[] = []
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i]
    if (c.kind === 'range' && c.lo !== c.hi) { out.push({ start: c.start, end: c.end, lo: Math.round(c.lo), hi: Math.round(c.hi) }); continue }
    const n = claims[i + 1]
    if (c.kind === 'single' && n && n.kind === 'single' && /^\s*(?:đến|tới|to|[-–—])\s*$/i.test(text.slice(c.end, n.start)) && n.lo > c.lo) {
      out.push({ start: c.start, end: n.end, lo: Math.round(c.lo), hi: Math.round(n.lo) })
      i++
    }
  }
  return out
}

export interface CoachShape { text: string; changes: Array<'operator_variance' | 'mixed_range'> }

/** Applies both rules to a coach reply (flag ON). `rows` are the coach (bus) search results of the turn. */
export function shapeCoachReply(text: string, rows: readonly TextRow[], lang: string): CoachShape {
  const changes: CoachShape['changes'] = []
  let out = text
  if (rows.length) {
    // Round 33: by MEANING and by what the rows support (operators, vehicle types, times) — see operatorVariance.ts
    const v = dropUnsupportedVariance(out, varianceSupport(rows, operatorsIn(rows).size), lang)
    if (v.removed.length) { out = v.text; changes.push('operator_variance') }
  }
  const split = splitCoachRanges(out, rows, lang)
  return { text: split.text, changes: [...changes, ...split.changes] }
}

/**
 * The range step alone — Round 42 round 3, RANGE-27-33 rule R-C (Huy 2026-10-13): runs on BOTH flags (R-C1; the operator rule above stays flag-on),
 * and a range whose two ends two different rows state is written as two named figures even when both ends are the same kind of price (R-C2).
 * A range one row states end to end is still left alone.
 */
export function splitCoachRanges(text: string, rows: readonly TextRow[], lang: string): CoachShape {
  const changes: CoachShape['changes'] = []
  let out = text
  const facts = fareFactsOf(rows)
  if (facts.length) {
    const spans = rangesIn(out).sort((a, b) => b.start - a.start) // right to left: offsets stay valid
    for (const s of spans) {
      const lo = facts.filter(f => f.amount === s.lo), hi = facts.filter(f => f.amount === s.hi)
      if (!lo.length || !hi.length) continue
      if (lo.some(a => hi.some(b => b.row === a.row))) continue // one source states both ends: a range it made itself
      const fa = lo[0], fb = hi[0]
      const tail = /^\s*\/\s*\p{L}+/u.exec(out.slice(s.end))?.[0] ?? ''
      // "từ" right before the range goes with it; in English "from" does too (COACH-SPLIT-EN-01: "From X and Y" read as a "from" price)
      const head = (lang === 'en' ? /(?:từ|tu|(?<![\p{L}\p{N}])from)\s+$/iu : /(?:từ|tu)\s+$/iu).exec(out.slice(0, s.start))?.[0] ?? ''
      const piece = `${fmt(s.lo, lang)}${tail.trim()} (${label(fa.kind, fa.host, lang)}) ${lang === 'en' ? 'and' : 'và'} ${fmt(s.hi, lang)}${tail.trim()} (${label(fb.kind, fb.host, lang)})`
      out = `${out.slice(0, s.start - head.length)}${piece}${out.slice(s.end + tail.length)}`
      if (!changes.includes('mixed_range')) changes.push('mixed_range')
    }
  }
  return { text: out, changes }
}

// ── Round 42 round 3, PRICE-DATE-01 — a "từ" price no row dates is not the price of the travel date (both flags) ─────────────────────────────────────────
//
// Round 40 case 12: "ngày **24/10/2026** hiện thấy giá **từ 410.000đ/chiều** trên Vexere" — the Vexere snippet states 410000 with no date. A sentence that holds a
// date AND a coach fare some row states, where no row stating that fare carries that day and month, gets the row's kind of price named right after the figure
// and, after the sentence, one sentence saying the price is not verified for that date. The model's words stay; nothing is removed. Its own label set
// (`dateLabel`), separate from `label` above, which the range split keeps using unchanged.

/** The date-step labels. "từ" and promotion read as `label` does; a plain fare also says it is not date-specific. */
export function dateLabel(kind: FareKind, host: string, lang: string): string {
  const en = lang === 'en'
  if (kind === 'promo') return en ? `promotional price in an article on ${host}, no date` : `giá ưu đãi nêu trong bài của ${host}, không ghi ngày`
  if (kind === 'from') return en ? `"from" price on ${host}, not date-specific` : `giá "từ" ở ${host}, chưa theo ngày`
  return en ? `price listed on ${host}, not date-specific` : `giá nêu ở ${host}, chưa theo ngày`
}

const DATE_IN = /(?<!\d)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?(?!\d)|ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})/giu
const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g
// The reply already says the price is not for that date (this sentence, or the next one opening with "Giá này / Mức giá này / Mức này").
const NOT_FOR_DATE = /chưa theo ngày|không theo ngày|chưa (?:xác nhận|xác minh)[^.]{0,30}ngày|không (?:phải|xác nhận)[^.]{0,30}(?:giá )?(?:cho |của )?ngày|không ghi ngày|not date-specific|not (?:confirmed|verified) for/i
const REFERS_BACK = /^\s*(?:giá này|mức giá này|mức này)\b/iu

interface DateHit { at: number; day: number; month: number; text: string }
function datesIn(s: string): DateHit[] {
  const out: DateHit[] = []
  for (const m of s.matchAll(DATE_IN)) {
    const day = Number(m[1] ?? m[4]), month = Number(m[2] ?? m[5])
    if (day < 1 || day > 31 || month < 1 || month > 12) continue
    out.push({ at: m.index ?? 0, day, month, text: m[1] ? m[0] : m[0].replace(/^ngày\s+/iu, '') })
  }
  return out
}
function rowStatesDate(text: string, day: number, month: number): boolean {
  if (datesIn(text).some(d => d.day === day && d.month === month)) return true
  for (const m of text.matchAll(ISO_DATE)) if (Number(m[3]) === day && Number(m[2]) === month) return true
  return false
}

/** Labels undated "từ"/plain/promotion coach fares the reply ties to a date, and adds the not-verified-for-that-date sentence. Identity without rows. */
export function labelUndatedFareDates(text: string, rows: readonly TextRow[], lang: string): { text: string; labelled: number } {
  if (!rows.length) return { text, labelled: 0 }
  const facts = fareFactsOf(rows)
  if (!facts.length) return { text, labelled: 0 }
  const spans = sentenceSpans(text)
  let out = text
  let labelled = 0
  for (let i = spans.length - 1; i >= 0; i--) {
    const [a, b] = spans[i]
    const s = text.slice(a, b)
    const dates = datesIn(s)
    if (!dates.length || NOT_FOR_DATE.test(s)) continue
    const next = spans[i + 1] ? text.slice(spans[i + 1][0], spans[i + 1][1]) : ''
    if (REFERS_BACK.test(next) && NOT_FOR_DATE.test(next)) continue
    const inserts: Array<{ at: number; label: string; date: DateHit }> = []
    for (const c of extractMoneyClaims(s)) {
      if (c.currency !== 'VND' || c.kind === 'range') continue
      const amount = Math.round(c.lo)
      const stating = facts.filter(f => f.amount === amount)
      if (!stating.length) continue
      const date = [...dates].reverse().find(d => d.at < c.start) ?? dates[0]
      if (stating.some(f => rowStatesDate(rows[f.row].text, date.day, date.month))) continue
      const tail = /^\s*\/\s*\p{L}+/u.exec(s.slice(c.end))?.[0] ?? ''
      const bold = s.slice(c.end + tail.length).startsWith('**') && ((s.slice(0, c.start).match(/\*\*/g) ?? []).length % 2 === 1) ? '**' : ''
      inserts.push({ at: c.end + tail.length + bold.length, label: ` (${dateLabel(stating[0].kind, stating[0].host, lang)})`, date })
    }
    if (!inserts.length) continue
    let sentence = s
    for (const ins of [...inserts].sort((x, y) => y.at - x.at)) sentence = sentence.slice(0, ins.at) + ins.label + sentence.slice(ins.at)
    // The separate sentence goes right after this sentence's own stop; the whitespace that follows stays where it was.
    const stopEnd = sentence.replace(/\s+$/, '').length
    const d = inserts[0].date.text
    const note = lang === 'en' ? ` I haven't verified that this price applies to ${d}.` : ` Mình chưa xác minh được mức giá này có áp dụng cho ngày ${d} hay không.`
    sentence = sentence.slice(0, stopEnd) + note + sentence.slice(stopEnd)
    out = out.slice(0, a) + sentence + out.slice(b)
    labelled += inserts.length
  }
  return { text: out, labelled }
}
