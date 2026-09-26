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
export function guardHoursClaimsInText(text: string, evidenceTexts: readonly string[], opts: { lang?: string } = {}): HoursGuardResult {
  const known = new Set(evidenceTexts.flatMap(t => scheduleTimesIn(t)))
  const unsupported: string[] = []
  const pieces: string[] = []
  let redacted = 0
  for (const [a, b] of sentenceSpans(text)) {
    const s = text.slice(a, b)
    if (!HOURS_CTX.test(s)) { pieces.push(s); continue }
    const stated = scheduleTimesIn(s)
    if (stated.length === 0) { pieces.push(s); continue }
    const bad = stated.filter(t => !known.has(t))
    if (bad.length === 0) { pieces.push(s); continue }
    unsupported.push(...bad)
    // Cut every clause that both names the hours context and states an hour; keep the rest of
    // the sentence when it still says something. A clause holding the bare time next to a
    // context clause ("mở cửa: 8h–22h") is cut with it.
    const cl = clauses(s)
    const parts = cl.map(c => s.slice(c.start, c.end))
    const ctx = parts.map(p => HOURS_CTX.test(p))
    const badTime = parts.map(p => scheduleTimesIn(p).some(t => !known.has(t)))
    const doomed = new Set<number>()
    parts.forEach((_, i) => {
      if (!badTime[i]) return
      if (ctx[i]) { doomed.add(i); return }
      // "mở cửa: 8h–22h" — the context clause introduces the time clause; both go.
      if (i > 0 && ctx[i - 1] && !scheduleTimesIn(parts[i - 1]).length) { doomed.add(i - 1); doomed.add(i) }
    })
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
