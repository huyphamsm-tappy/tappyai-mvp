// ── CONSULTATIVE V1 — "mình đã kiểm tra" is a claim like any other ───────────
//
// On a follow-up that ran no tool, the model may still write "mình đã tìm lại /
// kiểm tra / xem lại / gọi thử…" — a claim of work that did not happen, which
// reads as verification to the user. Prose only, sentence-level, the same
// protected-span walk the money and place guards use; runs only when the turn
// made NO tool call and no `named_refetch`. See consultative-v1-design.md §3.

import { normalizeVN } from '../intent'
import { sentenceSpans, protectedSpans } from '../moneyGuard'

/**
 * A first-person, past-tense claim of having searched / checked / called /
 * looked up. Present-tense offers ("mình có thể tìm", "để mình kiểm tra") and
 * requests to the user ("bạn kiểm tra giúp") are not claims.
 */
const CLAIM_RE = /\b(?:minh|toi|tui|tappy|em|i|i've|i have|we|we've)\s+(?:vua|da|vua moi|moi|just|have|already)\s+(?:tim(?: lai| kiem| thu)?|kiem tra(?: lai)?|xem(?: lai| qua)?|tra cuu|goi(?: dien| thu)?|xac nhan|cap nhat|doi chieu|check(?:ed)?|search(?:ed)?|look(?:ed)? (?:it )?up|verif(?:y|ied)|confirm(?:ed)?|call(?:ed)?|re-?check(?:ed)?)\b/
/** "Theo kết quả tìm kiếm mới nhất / mình vừa cập nhật" without a tool — the same claim, passive. */
const PASSIVE_RE = /\b(?:theo|dua tren|based on)\s+(?:ket qua\s+)?(?:tim kiem|tra cuu|kiem tra|cap nhat|the search|my search|a (?:quick|fresh) (?:search|check))\s+(?:moi nhat|vua roi|vua xong|latest|just now)\b/

export interface SearchClaimGuardResult {
  text: string
  removed: number
}

export function guardSearchClaims(text: string, ctx: { madeToolCall: boolean }): SearchClaimGuardResult {
  if (!text || ctx.madeToolCall) return { text, removed: 0 }
  const prot = protectedSpans(text)
  const spans = sentenceSpans(text)
  const isMachine = (a: number, b: number) => prot.some(([pa, pb]) => pa === a && pb === b)
  const doomed = new Set<number>()
  spans.forEach(([a, b], i) => {
    if (isMachine(a, b)) return
    const norm = normalizeVN(text.slice(a, b).toLowerCase())
    if (CLAIM_RE.test(norm) || PASSIVE_RE.test(norm)) doomed.add(i)
  })
  if (doomed.size === 0) return { text, removed: 0 }
  const out = spans.filter((_, i) => !doomed.has(i)).map(([a, b]) => text.slice(a, b)).join('')
  return { text: out.replace(/[ \t]+\n/g, '\n').replace(/(^|\n)[ \t]+/g, '$1').replace(/\n{3,}/g, '\n\n').trim(), removed: doomed.size }
}
