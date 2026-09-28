// ── E1 (2026-09-20): OPENING HOURS are a NUMBER too ─────────────────────────
//
// Every other figure a place reply states is gated — price (money / snippet guards), rating,
// review count, distance, phone (place guard), departure time (travel guard), showtime (ticket
// unit). Opening hours were not: "mở đến 3h sáng", "mở cửa 08:30–18:00", "open until 11 PM" went
// out whatever the row said. This closes that with the same shape as the others — a pure
// function over the prose that takes only the times the fetched rows (or the previous reply,
// on a follow-up) actually state, cuts the CLAUSE that carries an hour the evidence does not,
// and says so once. Writes nothing that was not in the input, except the single hedge line.
//
// Proportional (owner, 2026-09-20): the clause goes, not the sentence — "Karaoke MEI — 4.9⭐,
// mở đến 3h sáng, mức giá 100-200k" keeps its rating and its price when only the hour is unsupported;
// the sentence goes only when the hour clause IS the sentence.

import { scheduleTimesIn } from './travelGuard'
import { sentenceSpans } from './moneyGuard'
import { placesNamedIn } from '@/lib/links/placeAttribution'

// ── c40 E8 (UAT @ 2bd5c59, 2026-09-28): a WEEKLY closure is a schedule claim too ──────────────
//
// "Tinker Box … nhưng lưu ý nó đóng cửa vào cuối tuần" went out on a Monday whose row said only
// `opening_hours: "Đóng cửa"` (closed TODAY). The week the provider published says the opposite:
// Fri–Sun 08:30–21:00. The clock-time rule below never saw it — the claim carries no clock time.
// So: a sentence that says a venue is closed (or not closed) on a named weekday / the weekend is
// supported only when that venue's published week says exactly that for every day it names.
// No week for the venue ⇒ unsupported. Same removal as the clock rule: the clause goes, one hedge.

/** A closure word. `nghỉ` only when it is not "nghỉ ngơi" (rest). No trailing `\b` after Vietnamese. */
const CLOSURE_RE = /(?:^|[^\p{L}])(?:đóng cửa|dong cua|nghỉ(?! ngơi)(?![\p{L}])|nghi(?! ngoi)(?![\p{L}])|không (?:mở cửa|hoạt động)|khong (?:mo cua|hoat dong)|closed|shut)/iu
const CLOSURE_NEGATED_RE = /(?:không|khong|chẳng|chang|not|never)\s+(?:đóng cửa|dong cua|nghỉ|nghi|closed)/iu
/** Weekday expressions → day indices (0 = Sunday … 6 = Saturday, the `Date#getDay` order). */
const DAY_EXPRS: Array<[RegExp, number[]]> = [
  [/(?:cuối tuần|cuoi tuan|weekends?)/iu, [6, 0]],
  [/(?:ngày thường|ngay thuong|weekdays?)/iu, [1, 2, 3, 4, 5]],
  [/(?:chủ nhật|chu nhat|sunday|(?:^|[^\p{L}])cn(?![\p{L}\d]))/iu, [0]],
  [/(?:thứ hai|thu hai|thứ 2|thu 2|monday|(?:^|[^\p{L}])t2(?![\p{L}\d]))/iu, [1]],
  [/(?:thứ ba|thu ba|thứ 3|thu 3|tuesday|(?:^|[^\p{L}])t3(?![\p{L}\d]))/iu, [2]],
  [/(?:thứ tư|thu tu|thứ 4|thu 4|wednesday|(?:^|[^\p{L}])t4(?![\p{L}\d]))/iu, [3]],
  [/(?:thứ năm|thu nam|thứ 5|thu 5|thursday|(?:^|[^\p{L}])t5(?![\p{L}\d]))/iu, [4]],
  [/(?:thứ sáu|thu sau|thứ 6|thu 6|friday|(?:^|[^\p{L}])t6(?![\p{L}\d]))/iu, [5]],
  [/(?:thứ bảy|thu bay|thứ 7|thu 7|saturday|(?:^|[^\p{L}])t7(?![\p{L}\d]))/iu, [6]],
]
/** The provider's week keys, in the same order as `serperPlaces.DAY_KEYS`. */
const WEEK_KEYS: readonly string[][] = [
  ['chủ nhật', 'sunday', 'cn'], ['thứ hai', 'monday', 't2'], ['thứ ba', 'tuesday', 't3'], ['thứ tư', 'wednesday', 't4'],
  ['thứ năm', 'thursday', 't5'], ['thứ sáu', 'friday', 't6'], ['thứ bảy', 'saturday', 't7'],
]

function daysIn(s: string): number[] {
  const out = new Set<number>()
  for (const [re, days] of DAY_EXPRS) if (re.test(s)) days.forEach(d => out.add(d))
  return [...out]
}

/** Is `day` closed in this published week? null when the week does not state that day. */
function closedOn(week: Readonly<Record<string, string>>, day: number): boolean | null {
  for (const [key, value] of Object.entries(week)) {
    const k = key.trim().toLowerCase()
    if (WEEK_KEYS[day].some(w => k === w || k.startsWith(w))) return /đóng cửa|dong cua|closed/i.test(value)
  }
  return null
}

/** The sentence is about the venue's hours. No trailing `\b` after the Vietnamese words. */
const HOURS_CTX = /(?:^|\s|[(,;:—–-])(?:mở cửa|mo cua|mở đến|mo den|mở tới|mo toi|mở từ|mo tu|mở lúc|mo luc|mở khuya|mo khuya|đóng cửa|dong cua|giờ mở|gio mo|giờ hoạt động|gio hoat dong|hoạt động (?:từ|đến|tới)|hoat dong (?:tu|den|toi)|phục vụ (?:từ|đến|tới)|phuc vu (?:tu|den|toi)|opening hours|open(?:s|ed)? (?:from|until|till|at|daily)|open 24|closes? at|until \d)/iu
/** Clause boundaries, as the money guard draws them — except the colon INSIDE a clock time ("08:30"). */
const CLAUSE_DELIM = /[,;()]|:(?!\d)|\s[—–-]\s/g
const HAS_LETTER = /\p{L}/u

/** Split a sentence into clauses with their offsets. */
function clauses(sentence: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  let start = 0
  for (const m of sentence.matchAll(CLAUSE_DELIM)) {
    out.push({ start, end: m.index! })
    start = m.index! + m[0].length
  }
  out.push({ start, end: sentence.length })
  return out
}

export interface HoursGuardResult {
  text: string
  /** Hour clauses removed (0 ⇒ the text is byte-identical to the input). */
  redacted: number
  /** Times the prose stated that no evidence carried (for telemetry — normalised "H:MM"). */
  unsupported: string[]
}

/**
 * @param text           the settled reply prose
 * @param evidenceTexts  row texts / carried hours — every clock time in them is a supported hour
 * @param opts.lang      hedge language
 */
export function guardHoursClaimsInText(
  text: string,
  evidenceTexts: readonly string[],
  opts: {
    lang?: string
    /**
     * c40 E8: each retrieved venue's published WEEK, keyed by row name. When given (the stream
     * always gives it, possibly empty), a weekday / weekend closure claim must match the named
     * venue's week or its clause is cut. Omitted ⇒ the weekly rule does not run (legacy callers).
     */
    weekByEntity?: ReadonlyMap<string, Readonly<Record<string, string>>>
  } = {},
): HoursGuardResult {
  const known = new Set(evidenceTexts.flatMap(t => scheduleTimesIn(t)))
  const weekNames = opts.weekByEntity ? [...opts.weekByEntity.keys()] : []
  const unsupported: string[] = []
  const pieces: string[] = []
  let redacted = 0
  /** The venue the prose is talking about, carried across sentences ("nó", "quán") as a reader would. */
  let subject: string[] = []
  for (const [a, b] of sentenceSpans(text)) {
    const s = text.slice(a, b)
    const namedHere = weekNames.length ? placesNamedIn(s, weekNames) : []
    // A bolded name that is none of the retrieved venues is a venue with NO week: the subject moves to it.
    if (namedHere.length) subject = namedHere
    else if (/\*\*\p{L}[^*\n]{1,80}\*\*/u.test(s)) subject = []
    const about = subject
    const weekly = !!opts.weekByEntity && CLOSURE_RE.test(s) && !/\?\s*$/.test(s.trim()) && daysIn(s).length > 0
    if (!HOURS_CTX.test(s) && !weekly) { pieces.push(s); continue }
    const cl = clauses(s)
    const parts = cl.map(c => s.slice(c.start, c.end))
    const doomed = new Set<number>()
    // ── the weekly rule (c40 E8) ──
    if (weekly) {
      parts.forEach((p, i) => {
        if (!CLOSURE_RE.test(p)) return
        // The weekday usually sits in the same clause ("đóng cửa vào cuối tuần"); when it does not
        // ("Vào cuối tuần, quán đóng cửa"), the sentence's day clauses are part of the claim.
        const own = daysIn(p)
        const dayClauses = own.length ? [] : parts.map((q, j) => (j !== i && daysIn(q).length ? j : -1)).filter(j => j >= 0)
        const days = own.length ? own : dayClauses.flatMap(j => daysIn(parts[j]))
        if (days.length === 0) return
        const negated = CLOSURE_NEGATED_RE.test(p)
        const inClause = placesNamedIn(p, weekNames)
        const judged = inClause.length ? inClause : about
        const supported = judged.length > 0 && judged.every(n => {
          const week = opts.weekByEntity!.get(n)
          return !!week && days.every(d => closedOn(week, d) === !negated)
        })
        if (supported) return
        unsupported.push(`weekly:${days.join(',')}`)
        doomed.add(i)
        dayClauses.forEach(j => doomed.add(j))
      })
    }
    const bad = scheduleTimesIn(s).filter(t => !known.has(t))
    if (HOURS_CTX.test(s) && bad.length > 0) {
      unsupported.push(...bad)
      // Cut every clause that both names the hours context and states an hour; keep the rest of
      // the sentence when it still says something. A clause holding the bare time next to a
      // context clause ("mở cửa: 8h–22h") is cut with it.
      const ctx = parts.map(p => HOURS_CTX.test(p))
      const badTime = parts.map(p => scheduleTimesIn(p).some(t => !known.has(t)))
      parts.forEach((_, i) => {
        if (!badTime[i]) return
        if (ctx[i]) { doomed.add(i); return }
        // "mở cửa: 8h–22h" — the context clause introduces the time clause; both go.
        if (i > 0 && ctx[i - 1] && !scheduleTimesIn(parts[i - 1]).length) { doomed.add(i - 1); doomed.add(i) }
      })
    }
    if (doomed.size === 0) { pieces.push(s); continue }
    let kept = ''
    let lastEnd = 0
    cl.forEach((c, i) => {
      // Re-attach the delimiter that PRECEDED a kept clause, drop the one before a doomed clause.
      const delim = s.slice(lastEnd, c.start)
      if (!doomed.has(i)) kept += (kept || !/^\s*[,;:—–-]/.test(delim) ? delim : '') + s.slice(c.start, c.end)
      lastEnd = c.end
    })
    // Tidy the seam: a doubled delimiter, a delimiter before the terminal punctuation, stray space.
    kept = kept.replace(/\s*([,;:])\s*(?=[.!?]|$)/g, '').replace(/([,;:])\s*[,;:]/g, '$1').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ')
    // The cut clause was the last one and took the full stop with it.
    const term = s.match(/[.!?]\s*$/)?.[0] ?? ''
    if (term && !/[.!?]\s*$/.test(kept)) kept = kept.replace(/\s+$/, '') + term
    if (HAS_LETTER.test(kept.replace(/[\d:h–-]/g, ''))) { pieces.push(kept); redacted += doomed.size } else { redacted += 1 }
  }
  if (redacted === 0) return { text, redacted: 0, unsupported: [] }
  // A removed sentence leaves its neighbour's leading space / blank line behind.
  let out = pieces.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')
  const hedge = opts.lang === 'en'
    ? 'Opening hours here are not confirmed by a fetched source — check them on Maps before you go.'
    : 'Giờ mở cửa mình chưa xác nhận được từ nguồn đã tìm — bạn kiểm tra trên Maps trước khi đi.'
  if (!out.includes(hedge)) {
    const markerAt = (() => { let end = out.length; for (const m of ['[CTA_BUTTONS]', '[FOLLOWUPS]', '[TAPPY_PLAN]', '[TAPPY_SHOPPING]', '[TAPPY_PLACES]']) { const i = out.indexOf(m); if (i !== -1 && i < end) end = i } return end })()
    const head = out.slice(0, markerAt).replace(/\s+$/, '')
    const tail = out.slice(markerAt)
    out = `${head}${head ? '\n\n' : ''}${hedge}${tail ? `\n\n${tail}` : ''}`
  }
  return { text: out, redacted, unsupported }
}
