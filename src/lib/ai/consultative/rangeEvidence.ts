// ── Round 42 round 3, RANGE-27-33 (commit 2, rule R-B) — a VND range no single source row states ────────────────────────────────────────────────────────
//
// Live MacBook (Round 33 / 42): "Khoảng 27–33 triệu đồng: shop-b niêm yết 26,99 triệu, còn shop-c ghi máy likenew 32,5 triệu." — 33 triệu is stated by no row,
// 27 triệu is a different configuration's (shop-d, 16GB). Flag ON, the evidence guard cut the whole sentence (both sourced prices with it); flag OFF the
// range passed (±2 % tolerance of the No-Fabrication Gate). Here, BEFORE the evidence guard, on turns WITHOUT coach rows (coach ranges are coachFares' R-C):
//   · a range one row states end to end is left alone;
//   · otherwise, when the sentence states another VND amount, only the part carrying the range goes — the head clause ending ":" / ",", the clause
//     (moneyGuard.removeClauseAround, unchanged), or the part after / before a connective (2D list; P1 comparison phrase and Q1 "và" right after an
//     amount + unit; Q2 "… ở/tại <a source of THIS turn>"), the one nearest the range that meets its conditions;
//   · no safe cut ⇒ the sentence is NOT touched (Huy 2026-10-13): the range stays, as before this step;
//   · the sentence states no other amount: flag ON — one end stated by no row ⇒ not touched; both ends stated, by two rows ⇒ the sentence goes and the
//     existing "Mình chưa xác minh được số này từ nguồn đã đọc." line is added; flag OFF — the gate drops it itself ⇒ not touched; else the sentence goes
//     with the gate's own sentence ("Mình chưa xác minh được giá hiện tại từ nguồn đã tra, nên không nêu con số.").
// Pure: no model, no I/O; every output character comes from the input or from those two existing sentences. No tolerance is added, no guard is loosened.

import { extractMoneyClaims, sentenceSpans, removeClauseAround } from '../moneyGuard'
import { quantitiesIn } from '../guardEvidence'
import { withUnverifiedFigureLine } from '../unverifiedFigure'

export interface RangeEvidence {
  /** Evidence rows of the turn: each search result (title + snippet + link) and each passage of a page read. */
  rows: readonly string[]
  /** Hosts of the turn's search results / pages (Q2: "ở/tại <tên nguồn>"). */
  hosts: readonly string[]
  consultative: boolean
  lang: string
  /** Something was looked up this turn (the gate's "từ nguồn đã tra" wording). */
  looked: boolean
  /** Flag OFF: does the No-Fabrication Gate, called as a pure function, drop this sentence by itself? */
  gateDrops?: (sentence: string) => boolean
}

export interface RangeCut { text: string; changes: Array<'head_clause' | 'clause' | 'connective' | 'sentence'> }

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const MACHINE = /\[\/?(?:TAPPY_[A-Z_]+|FOLLOWUPS|CTA_BUTTONS)\]/
const CONN_2D = /\s+(?:trong khi|trong lúc|nhưng|tuy nhiên|khi đó)(?![\p{L}\p{N}])/giu
const CONN_P1 = /\s+(?:(?:thấp|cao|rẻ|đắt) hơn(?:\s+so với)?|so với)(?![\p{L}\p{N}])/giu
const CONN_Q1 = /\s+và(?![\p{L}\p{N}])/giu
// the kept part ends right on an amount and its unit
const ENDS_ON_AMOUNT = /\d(?:[\d.,]*\d)?\s*(?:triệu|tr|nghìn|ngàn|k|đồng|đ|vnđ|vnd)$/iu
const ENDS_ON_AMOUNT_AT = /\d(?:[\d.,]*\d)?\s*(?:triệu|tr|nghìn|ngàn|k|đồng|đ|vnđ|vnd)\s+(?:ở|tại)\s+([\p{L}\p{N}][\p{L}\p{N}.-]*)$/iu
const DANGLING = /(?:^|\s)(?:hơn|kém|bằng|với|là|có|giá|khoảng|từ|đến|của)$/iu
// the sentence's own end: optional citation marker(s), its stop, trailing quotes / spaces
const TAIL = /(?:\s*\[S\d{1,2}(?:\s*,\s*S\d{1,2})*\])*\s*[.!?…]*[\s"'”’]*$/u

const capitaliseFirst = (s: string): string => s.replace(/^([\s*_>#-]*)(\p{Ll})/u, (_m, lead: string, ch: string) => lead + ch.toLocaleUpperCase('vi'))
const words = (s: string): number => s.split(/\s+/).filter(w => /\p{L}/u.test(w)).length
const vnd = (s: string) => extractMoneyClaims(s).filter(c => c.currency === 'VND')

/** The whole-đồng VND values each row states (money amounts, and plain numbers the way the evidence guard counts them). */
function rowValues(rows: readonly string[]): Array<Set<number>> {
  return rows.map(r => new Set(quantitiesIn(r, true).filter(q => (q.kind === 'money' && q.currency === 'VND') || (q.kind === 'num' && (q.unit === '' || q.unit === 'money'))).map(q => Math.round(q.value))))
}

function hostLabel(host: string): string { return fold(host.replace(/^www\./, '').split('.')[0]).replace(/[^a-z0-9]/g, '') }

/** One sentence (no trailing line break): the cut, or null when there is no safe one. */
function cutSentence(s: string, rs: number, re: number, ev: RangeEvidence): { text: string; how: RangeCut['changes'][number] } | null {
  const lead = s.match(/^\s*/)![0].length
  const tail = s.match(TAIL)![0]
  const bodyEnd = s.length - tail.length
  const otherIn = (a: number, b: number) => vnd(s.slice(a, b)).length > 0
  // 1) the head clause: the range opens the sentence and its clause ends ":" / ","
  if (!otherIn(lead, rs) && !/[:,;]/.test(s.slice(lead, rs))) {
    const m = /(?<!\d)[:,](?!\d)/.exec(s.slice(re))
    if (m && !otherIn(re, re + m.index)) {
      const rest = s.slice(re + m.index + 1).replace(/^\s+/, '')
      if (vnd(rest).length && words(rest) >= 3) return { text: s.slice(0, lead) + capitaliseFirst(rest), how: 'head_clause' }
    }
  }
  // 2) the clause that carries the range (moneyGuard's clause cut, decimal-safe so "26,99" is not a delimiter)
  const clause = removeClauseAround(s, rs, re, '', true)
  if (clause !== null && vnd(clause).length && !vnd(clause).some(c => clause.slice(c.start, c.end).match(/[–-]/))) return { text: clause, how: 'clause' }
  // 3) a connective between the range and another amount — the nearest one that meets its own conditions
  type Cand = { dist: number; text: string }
  const cands: Cand[] = []
  const tryTail = (cs: number, needAmount: boolean, allowAt: boolean) => {
    const kept = s.slice(lead, cs)
    const removed = s.slice(cs, bodyEnd)
    if (vnd(removed).length !== 1) return // only the range goes
    if (!vnd(kept).length || words(kept) < 3 || DANGLING.test(kept.trim())) return
    if (needAmount) {
      const at = ENDS_ON_AMOUNT_AT.exec(kept)
      const ok = ENDS_ON_AMOUNT.test(kept) || (allowAt && !!at && ev.hosts.some(h => hostLabel(h) === fold(at[1]).replace(/[^a-z0-9]/g, '')))
      if (!ok) return
    }
    cands.push({ dist: rs - cs, text: s.slice(0, lead) + kept + tail })
  }
  for (const m of s.matchAll(CONN_2D)) {
    const cs = m.index!, ce = cs + m[0].length
    if (ce <= rs) tryTail(cs, false, false)
    else if (cs >= re) { // the range is before the connective: the head goes through it
      const removed = s.slice(lead, ce), kept = s.slice(ce).replace(/^\s+/, '')
      if (vnd(removed).length === 1 && vnd(kept).length && words(kept) >= 3) cands.push({ dist: cs - re, text: s.slice(0, lead) + capitaliseFirst(kept) })
    }
  }
  for (const m of s.matchAll(CONN_P1)) if (m.index! + m[0].length <= rs) tryTail(m.index!, true, true)
  for (const m of s.matchAll(CONN_Q1)) if (m.index! + m[0].length <= rs) tryTail(m.index!, true, false)
  if (cands.length) return { text: cands.sort((x, y) => x.dist - y.dist)[0].text, how: 'connective' }
  return null
}

const OFF_NOTE = (lang: string, looked: boolean) => lang === 'en'
  ? `I could not verify the current price ${looked ? 'from the sources checked' : '(nothing was looked up for it)'}, so I am not stating a figure.`
  : `Mình chưa xác minh được giá hiện tại ${looked ? 'từ nguồn đã tra' : '(chưa có nguồn tra cứu cho số liệu này)'}, nên không nêu con số.`

export function cutUnbackedRanges(text: string, ev: RangeEvidence): RangeCut {
  const changes: RangeCut['changes'] = []
  if (!ev.rows.length || !/\d\s*[–-]\s*\d/.test(text)) return { text, changes }
  const values = rowValues(ev.rows)
  const spans = sentenceSpans(text)
  let out = text
  let dropped = false
  for (let i = spans.length - 1; i >= 0; i--) {
    const [a, b] = spans[i]
    const raw = out.slice(a, b)
    if (!raw.trim() || MACHINE.test(raw)) continue
    const brk = raw.match(/\n+$/)?.[0] ?? ''
    const s = raw.slice(0, raw.length - brk.length)
    const claims = vnd(s)
    const range = claims.find(c => c.kind === 'range' && Math.round(c.lo) !== Math.round(c.hi))
    if (!range) continue
    const lo = Math.round(range.lo), hi = Math.round(range.hi)
    const loRows = values.flatMap((v, r) => v.has(lo) ? [r] : []), hiRows = values.flatMap((v, r) => v.has(hi) ? [r] : [])
    if (loRows.some(r => hiRows.includes(r))) continue // one row states the whole range
    const others = claims.filter(c => c.start !== range.start)
    if (others.length) {
      const cut = cutSentence(s, range.start, range.end, ev)
      if (!cut) continue // no safe cut: the sentence is not touched
      out = out.slice(0, a) + cut.text + brk + out.slice(b)
      changes.push(cut.how)
      continue
    }
    // the sentence states no other amount
    if (ev.consultative) {
      if (!loRows.length || !hiRows.length) continue
    } else if (ev.gateDrops?.(s)) continue
    out = out.slice(0, a) + brk + out.slice(b)
    changes.push('sentence')
    dropped = true
  }
  if (dropped) {
    out = out.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+/gm, m => m).replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')
    if (ev.consultative) out = withUnverifiedFigureLine(text, out, ev.lang).text
    else {
      const note = OFF_NOTE(ev.lang, ev.looked)
      if (!out.includes(note)) {
        const at = out.search(/\[(?:FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z]+)\]/)
        const head = (at < 0 ? out : out.slice(0, at)).replace(/\s+$/, '')
        const rest = at < 0 ? '' : out.slice(at)
        out = `${head}${head ? '\n\n' : ''}${note}${rest ? `\n\n${rest}` : ''}`
      }
    }
  }
  return { text: out, changes }
}
