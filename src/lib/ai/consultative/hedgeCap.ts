// ── CONSULTATIVE V1 — at most two hedges per reply ──────────────────────────
//
// A hedge is a sentence whose point is "not confirmed": "chưa thấy bằng chứng về…", "chưa xác
// nhận được…", "chưa có thông tin rõ về…", "kết quả chưa có mức giá…". One or two keep the reply
// honest; three or more (measured F8 2026-09-19: the model's own hedge + the gap heads-up + the
// budget line) turn the consultation into a disclaimer. Beyond the cap the hedges are MERGED into
// one sentence — nothing is dropped, every subject survives — so the count is what changes, not
// the information. The pick sentence is never touched, even when it hedges.
//
// Only a hedge whose SUBJECT can be read ("phòng riêng", "mức giá") is merged; a hedge the
// reader cannot parse stays exactly as written and is counted in `unmergeable` (measured smoke
// 2026-09-19: stitching an unparsed sentence into the merged one produced "phòng riêng; mức giá;
// Tuy nhiên, kết quả chưa xác nhận rõ…"). The cap can then be exceeded — visibly, in the log —
// but the prose is never garbled.

import { normalizeVN } from '../intent'
import { sentenceSpans, protectedSpans } from '../moneyGuard'

const HEDGE = /\b(?:chua (?:thay|co|tim thay|xac nhan|ro|khang dinh|chac)|khong (?:tim )?thay bang chung|khong (?:the )?(?:xac nhan|khang dinh)|no evidence|could not (?:find|confirm)|cannot confirm|can't confirm|not (?:sure|confirmed))\b/

export interface HedgeCapResult { text: string; hedges: number; merged: number; unmergeable: number }

/** The hedge subject: the words after "về / xác nhận (được|rõ) / chưa rõ / chưa có (thông tin về) / about", up to the first clause break. */
function subjectOf(sentence: string, lang: string): string | null {
  const s = sentence.trim().replace(/[.!?…]+$/, '')
  // No `\b` after a Vietnamese letter: "ở" is not \w, so `ở\b` never fires before a space.
  const tail = '\\s+([^,;—–:]+?)(?=\\s+(?:ở|của|nên|với|tại|từ|trên|cho|trong)(?:\\s|$)|\\s*[,;—–:]|$)'
  const patterns = lang === 'en'
    ? [/(?:about|regarding|whether)\s+([^,;—–:]+)/i, /could not confirm\s+([^,;—–:]+)/i, /cannot confirm\s+([^,;—–:]+)/i]
    : [
      new RegExp('\\bvề' + tail, 'iu'),
      new RegExp('xác nhận (?:được |rõ |được rõ )?(?:thông tin )?(?:về )?' + tail.slice(3), 'iu'),
      new RegExp('chưa rõ (?:về )?' + tail.slice(3), 'iu'),
      new RegExp('chưa có (?:thông tin (?:rõ )?(?:về )?)?' + tail.slice(3), 'iu'),
      new RegExp('\\b(?:có|thấy)' + tail, 'iu'),
    ]
  for (const re of patterns) {
    const sub = re.exec(s)?.[1]?.trim().replace(/^(?:được|rõ|cụ thể|có|là)\s+/u, '').replace(/\s+(?:cụ thể|rõ ràng|chính xác)$/u, '')
    if (sub && sub.split(/\s+/).length <= 8 && !/^(?:thông tin|dữ liệu|bằng chứng)$/u.test(sub)) return sub
  }
  return null
}

const joinVi = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} và ${xs[xs.length - 1]}`)
const joinEn = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/**
 * Keeps up to `max` hedge sentences as written; when there are more, every hedge whose subject can
 * be read (except one inside the pick) is replaced by ONE merged sentence at the position of the
 * first of them. Unreadable hedges stay as written.
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
  if (hedgeIdx.length <= max) return { text, hedges: hedgeIdx.length, merged: 0, unmergeable: 0 }
  const subjects: string[] = []
  const mergeIdx: number[] = []
  let unmergeable = 0
  for (const i of hedgeIdx) {
    const sub = subjectOf(text.slice(spans[i][0], spans[i][1]), opts.lang)
    if (!sub) { unmergeable++; continue }
    mergeIdx.push(i)
    if (!subjects.some(x => normalizeVN(x.toLowerCase()) === normalizeVN(sub.toLowerCase()))) subjects.push(sub)
  }
  if (mergeIdx.length < 2) return { text, hedges: hedgeIdx.length, merged: 0, unmergeable }
  const merged = opts.lang === 'en'
    ? `I could not confirm ${joinEn(subjects)} — worth a call before you go.`
    : `Mình chưa xác nhận được ${joinVi(subjects)} — nên gọi hỏi trước khi đi.`
  let out = ''
  let cursor = 0
  spans.forEach(([a, b], i) => {
    out += text.slice(cursor, a)
    if (mergeIdx[0] === i) out += (/^\s/.test(text.slice(a, b)) ? ' ' : '') + merged
    else if (!mergeIdx.includes(i)) out += text.slice(a, b)
    cursor = b
  })
  out += text.slice(cursor)
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return { text: out, hedges: hedgeIdx.length, merged: mergeIdx.length - 1, unmergeable }
}
