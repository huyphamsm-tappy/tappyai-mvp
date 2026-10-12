// ── CONSULTATIVE_IN_AGENT — coach fares are named for what they are (Round 32, defect 3) ───────────────────────────────────────────────────────────
//
// Live 2026-10-12 (coach, TP.HCM → Quy Nhơn): the reply said "từ 350.000–410.000đ/chiều, tùy nhà xe và loại xe". The data held ONE operator (Phương Trang / FUTA); 350.000 was a
// promotional price in a news article with no date, 410.000 a "từ" (starting-from) price on a listing page. The two were glued into one range, and "tùy nhà xe" claimed a choice of
// operators the data did not show.
//
// What the data decides (any operator, any route; the only fixed list is of operator NAMES, to count how many distinct ones the rows name):
//   · "tùy nhà xe" / "depending on the operator" is kept only when the rows name at least two distinct operators;
//   · a range whose two ends are different KINDS of price (promotion in an article · "từ" price · plain) and that no single row states as a range is written as two figures,
//     each with its kind and host. A range one source states, or whose ends are the same kind, is left alone.
// Pure: no model, no I/O; text is only ever rewritten around figures the rows really state.

import { extractMoneyClaims } from '../moneyGuard'
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

const fmt = (n: number): string => `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`
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

/** Applies both rules to a coach reply. `rows` are the coach (bus) search results of the turn. */
export function shapeCoachReply(text: string, rows: readonly TextRow[], lang: string): CoachShape {
  const changes: CoachShape['changes'] = []
  let out = text
  if (rows.length) {
    // Round 33: by MEANING and by what the rows support (operators, vehicle types, times) — see operatorVariance.ts
    const v = dropUnsupportedVariance(out, varianceSupport(rows, operatorsIn(rows).size), lang)
    if (v.removed.length) { out = v.text; changes.push('operator_variance') }
  }
  const facts = fareFactsOf(rows)
  if (facts.length) {
    const spans = rangesIn(out).sort((a, b) => b.start - a.start) // right to left: offsets stay valid
    for (const s of spans) {
      const lo = facts.filter(f => f.amount === s.lo), hi = facts.filter(f => f.amount === s.hi)
      if (!lo.length || !hi.length) continue
      if (lo.some(a => hi.some(b => b.row === a.row))) continue // one source states both ends: a range it made itself
      if (lo.some(a => hi.some(b => b.kind === a.kind))) continue // same kind of price at both ends
      const fa = lo[0], fb = hi[0]
      const tail = /^\s*\/\s*\p{L}+/u.exec(out.slice(s.end))?.[0] ?? ''
      const head = /(?:từ|tu)\s+$/iu.exec(out.slice(0, s.start))?.[0] ?? ''
      const piece = `${fmt(s.lo)}${tail.trim()} (${label(fa.kind, fa.host, lang)}) ${lang === 'en' ? 'and' : 'và'} ${fmt(s.hi)}${tail.trim()} (${label(fb.kind, fb.host, lang)})`
      out = `${out.slice(0, s.start - head.length)}${piece}${out.slice(s.end + tail.length)}`
      if (!changes.includes('mixed_range')) changes.push('mixed_range')
    }
  }
  return { text: out, changes }
}
