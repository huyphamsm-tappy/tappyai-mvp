// ── E1 (2026-09-20): P2 BUDGET-BAND OVERCLAIM ───────────────────────────────
//
// Measured on the 2026-09-19 gate (B1, B8, F7b, E6): with the budget "dưới 100k/người" the reply
// said "100-200k/người vừa vặn ngân sách"; with "<100k", "100–600k/người nằm trong tầm". The band
// is the ROW's (the snippet-price guard rightly keeps it); the JUDGEMENT that it fits is the
// model's, and nothing checked band against budget. This does, deterministically: a fit phrase
// next to a band that starts AT OR ABOVE the user's ceiling is an overclaim, and the clause that
// carries the fit phrase is removed — the band itself stays when it sits in another clause.
// Writes nothing; removes at most a clause per sentence; inert with no budget or no fit phrase.

import { extractMoneyClaims, sentenceSpans } from './moneyGuard'

export interface BudgetForFit { min: number; max: number; type: 'range' | 'under' | 'around' }

/** "vừa vặn ngân sách", "rất hợp budget", "nằm trong tầm", "fits your budget". */
const FIT_RE = /(vừa vặn|vua van|(?:rất |khá |hoàn toàn )?(?:vừa|phù hợp|hợp)\s+(?:với\s+)?(?:ngân sách|ngan sach|budget|tầm giá|tam gia|túi tiền|tui tien)|nằm trong (?:tầm|ngân sách|budget)|nam trong (?:tam|ngan sach|budget)|trong tầm (?:giá|ngân sách|budget)|đúng (?:tầm|ngân sách|budget)|(?:fits?|within|matches|in) (?:your |the )?budget|hợp túi tiền)/iu
const CLAUSE_DELIM = /[,;()]|:(?!\d)|\s[—–-]\s/g
const HAS_LETTER = /\p{L}/u

function clauses(sentence: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  let start = 0
  for (const m of sentence.matchAll(CLAUSE_DELIM)) { out.push({ start, end: m.index! }); start = m.index! + m[0].length }
  out.push({ start, end: sentence.length })
  return out
}

/** The band starts at or above the ceiling — it cannot "fit". */
export function bandOverclaims(band: { lo: number; hi: number }, budget: BudgetForFit): boolean {
  if (!Number.isFinite(budget.max) || budget.max <= 0) return false
  return budget.type === 'under' ? band.lo >= budget.max : band.lo > budget.max
}

export function guardBudgetFitInText(text: string, budget: BudgetForFit | null | undefined): { text: string; redacted: number } {
  if (!budget || !FIT_RE.test(text)) return { text, redacted: 0 }
  const pieces: string[] = []
  let redacted = 0
  for (const [a, b] of sentenceSpans(text)) {
    const s = text.slice(a, b)
    if (!FIT_RE.test(s)) { pieces.push(s); continue }
    const claims = extractMoneyClaims(s).filter(c => c.currency === 'VND')
    if (claims.length === 0 || !claims.some(c => bandOverclaims(c, budget))) { pieces.push(s); continue }
    const cl = clauses(s)
    const parts = cl.map(c => s.slice(c.start, c.end))
    const doomed = new Set<number>()
    parts.forEach((p, i) => { if (FIT_RE.test(p)) doomed.add(i) })
    let kept = ''
    let lastEnd = 0
    cl.forEach((c, i) => {
      const delim = s.slice(lastEnd, c.start)
      if (!doomed.has(i)) kept += (kept || !/^\s*[,;:—–-]/.test(delim) ? delim : '') + s.slice(c.start, c.end)
      lastEnd = c.end
    })
    kept = kept.replace(/\s*([,;:])\s*(?=[.!?]|$)/g, '').replace(/([,;:])\s*[,;:]/g, '$1').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ')
    const term = s.match(/[.!?]\s*$/)?.[0] ?? ''
    if (term && !/[.!?]\s*$/.test(kept)) kept = kept.replace(/\s+$/, '') + term
    if (HAS_LETTER.test(kept.replace(/[\d:h–-]/g, ''))) { pieces.push(kept); redacted += doomed.size } else { redacted += 1 }
  }
  if (redacted === 0) return { text, redacted: 0 }
  const out = pieces.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')
  return { text: out, redacted }
}
