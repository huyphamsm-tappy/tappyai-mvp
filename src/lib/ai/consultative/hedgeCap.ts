// ── CONSULTATIVE V1 — at most two hedges per reply ──────────────────────────
//
// A hedge is a sentence whose point is "not confirmed": "chưa thấy bằng chứng về…", "chưa xác
// nhận được…", "chưa có thông tin rõ về…", "kết quả chưa có mức giá…". One or two keep the reply
// honest; three or more (measured F8 2026-09-19: the model's own hedge + the gap heads-up + the
// budget line) turn the consultation into a disclaimer. Beyond the cap the hedges are MERGED into
// one sentence — nothing is dropped, every subject survives — so the count is what changes, not
// the information. The pick sentence is never touched, even when it hedges.

import { normalizeVN } from '../intent'
import { sentenceSpans, protectedSpans } from '../moneyGuard'

const HEDGE = /\b(?:chua (?:thay|co|tim thay|xac nhan|ro|khang dinh|chac)|khong (?:tim )?thay bang chung|khong (?:the )?(?:xac nhan|khang dinh)|no evidence|could not (?:find|confirm)|cannot confirm|can't confirm|not (?:sure|confirmed))\b/
const CONNECTOR = /^(?:tuy nhien|nhung|nen|vi vay|do do|however|but|so)\b[,\s]*/i

export interface HedgeCapResult { text: string; hedges: number; merged: number }

/** The hedge subject: the words after "về / có / about", up to the first clause break. */
function subjectOf(sentence: string, lang: string): string | null {
  const s = sentence.trim().replace(/[.!?…]+$/, '')
  // "về X" is the clearest subject marker; "có X" only when no "về" is present
  // ("chưa có thông tin rõ về phòng riêng" must yield "phòng riêng", not "thông tin rõ").
  // No `\b` after a Vietnamese letter: "ở" is not \w, so `ở\b` never fires before a space.
  const tail = '\\s+([^,;—–:]+?)(?=\\s+(?:ở|của|nên|với|tại|từ|trên)(?:\\s|$)|\\s*[,;—–:]|$)'
  const patterns = lang === 'en'
    ? [/(?:about|regarding|whether)\s+([^,;—–:]+)/i]
    : [new RegExp('\\bvề' + tail, 'iu'), new RegExp('\\b(?:có|thấy)' + tail, 'iu')]
  for (const re of patterns) {
    const sub = re.exec(s)?.[1]?.trim()
    if (sub && sub.split(/\s+/).length <= 8) return sub
  }
  return null
}

/**
 * Keeps the first `max` hedge sentences as written; when there are more, every hedge sentence
 * (except one inside the pick) is replaced by ONE merged sentence at the position of the first.
 */
export function capHedges(text: string, opts: { max?: number; lang: string; pickNames?: readonly string[] }): HedgeCapResult {
  const max = opts.max ?? 2
  const prot = protectedSpans(text)
  const spans = sentenceSpans(text)
  const names = (opts.pickNames ?? []).map(n => normalizeVN(n.toLowerCase())).filter(Boolean)
  let seenPick = false
  const hedgeIdx: number[] = []
  spans.forEach(([a, b], i) => {
    const s = text.slice(a, b)
    if (prot.some(([pa, pb]) => pa === a && pb === b) || !s.trim()) return
    const f = normalizeVN(s.toLowerCase())
    if (!seenPick && names.some(n => f.includes(n))) { seenPick = true; return }
    if (HEDGE.test(f)) hedgeIdx.push(i)
  })
  if (hedgeIdx.length <= max) return { text, hedges: hedgeIdx.length, merged: 0 }
  const subjects: string[] = []
  const leftovers: string[] = []
  for (const i of hedgeIdx) {
    const s = text.slice(spans[i][0], spans[i][1])
    const sub = subjectOf(s, opts.lang)
    if (sub) { if (!subjects.some(x => normalizeVN(x.toLowerCase()) === normalizeVN(sub.toLowerCase()))) subjects.push(sub) }
    else leftovers.push(s.trim().replace(CONNECTOR, '').replace(/^(?:mình|minh|tôi|i)\s+/i, '').replace(/\s*[—–-]\s*(?:nên|worth)\b.*$/iu, '').replace(/[.!?…]+$/, ''))
  }
  const list = [...subjects, ...leftovers]
  const merged = opts.lang === 'en'
    ? `I could not confirm ${list.join('; ')} — worth a call before you go.`
    : `Mình chưa xác nhận được ${list.join('; ')} — nên gọi hỏi trước khi đi.`
  let out = ''
  let cursor = 0
  spans.forEach(([a, b], i) => {
    out += text.slice(cursor, a)
    if (hedgeIdx[0] === i) out += (/^\s/.test(text.slice(a, b)) ? ' ' : '') + merged
    else if (!hedgeIdx.includes(i)) out += text.slice(a, b)
    cursor = b
  })
  out += text.slice(cursor)
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return { text: out, hedges: hedgeIdx.length, merged: hedgeIdx.length - 1 }
}
