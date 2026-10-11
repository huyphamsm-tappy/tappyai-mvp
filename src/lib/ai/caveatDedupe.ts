// ── CONSULTATIVE_IN_AGENT — one "not verified" caveat per reply ───────────────────────────────────────────────────────────────────
//
// Several code paths can each add (or the model can write) a short "chưa xác minh / chưa có giá" sentence: the model itself, the evidence
// guard's unverifiedFigure line, the no-fabrication gate, verificationLead (flight / movie). Each checks only for its OWN wording, so a reply
// could carry two near-identical caveats back to back (flight price turn, Snow Crash turn). This pass runs once on the settled prose: a later
// SHORT caveat-only sentence that says what an earlier caveat already said is dropped. Nothing else is touched: long sentences, sentences with
// figures, links, headings, list lines and machine blocks are never removed, and the first caveat always stays.

const BLOCKS = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g
const CAVEAT = /(?<!\p{L})(?:chưa|không)\s+(?:\S+\s+){0,3}?(?:xác minh|xác nhận|kiểm chứng|kiểm tra được|có (?:dữ liệu|giá|số|thông tin))|(?:could not|couldn't|cannot|can't|unable to|no)\s+(?:\S+\s+){0,2}?(?:verify|confirm|data|price)|(?:not|n't)\s+(?:been\s+)?verif/iu
const MAX_CAVEAT_LEN = 160

const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const tokens = (s: string) => new Set(fold(s).split(' ').filter(t => t.length > 1))
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1) }

/** A sentence that is ONLY a caveat: short, matches the caveat shape, no digits, no link, no markup. */
const isPlainCaveat = (s: string) => {
  const t = s.trim()
  return t.length > 0 && t.length <= MAX_CAVEAT_LEN && CAVEAT.test(t) && !/\d/.test(t) && !/[\[\]|`#]|https?:/.test(t) && !/^\s*(?:[-*•+]|\d{1,2}[.)])\s/.test(s)
}

function dedupeProse(text: string): string {
  const seen: Set<string>[] = []
  return text.split('\n').map(line => {
    const parts = line.split(/(?<=[.!?…])\s+/)
    if (parts.length === 0) return line
    const kept: string[] = []
    for (const s of parts) {
      if (!isPlainCaveat(s)) { kept.push(s); continue }
      const t = tokens(s)
      // same caveat again: a near-identical wording, or both short caveats that name the same thing (any earlier caveat covers a later one
      // that adds no new word of substance)
      if (seen.some(p => jaccard(t, p) >= 0.5)) continue
      seen.push(t)
      kept.push(s)
    }
    return kept.join(' ')
  }).join('\n').replace(/\n{3,}/g, '\n\n')
}

/** The reply with repeated plain caveat sentences removed (first one stays). Machine blocks are passed through untouched. */
export function dedupeCaveats(text: string): string {
  if (!text || !CAVEAT.test(text)) return text
  const blocks: string[] = []
  const masked = text.replace(BLOCKS, m => { blocks.push(m); return `\u0000B${blocks.length - 1}\u0000` })
  // one shared "seen" across the whole reply, so a caveat repeated in a later paragraph goes too
  const out = dedupeProse(masked)
  return out.replace(/\u0000B(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)] ?? '')
}
