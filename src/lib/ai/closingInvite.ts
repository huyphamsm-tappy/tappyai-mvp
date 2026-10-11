// ── CONSULTATIVE_IN_AGENT — no generic closing invitation (Round 20) ──────────────────────────────────────────────────────────────
//
// "Nếu bạn thích mình có thể gợi ý thêm", "Bạn muốn mình … không?", "Cần mình … thì cứ nói nhé" end a reply without helping the user
// get closer to the goal (owner, 2026-10-11). The prompt says so; this is the deterministic backstop for the LAST sentence of the prose only,
// and only when the reply keeps at least two other sentences. A specific, useful next step ("Cho mình biết nơi xuất phát để chỉnh giờ bay")
// is not generic and stays. Voice shaping, not a fact guard.

const BLOCKS = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g

const GENERIC = [
  /^(?:và\s+)?nếu\s+(?:bạn|ông|bà|anh|chị)\s+(?:thích|muốn|cần|có nhu cầu)[^.!?]{0,80}?,?\s*(?:mình|tui|tôi|tớ)\s+(?:có thể|sẽ|sẵn sàng|luôn sẵn sàng)\b[^.!?]*[.!?…]*$/iu,
  /^(?:bạn|ông|bà|anh|chị)\s+(?:có\s+)?(?:muốn|cần|thích)\s+(?:mình|tui|tôi|tớ)\b[^.!?]*\?$/iu,
  /^(?:cần|muốn)\s+(?:mình|tui|tôi|tớ)\b[^.!?]*\?$/iu,
  /^(?:mình|tui|tôi|tớ)\s+(?:có thể|sẵn sàng)\s+(?:gợi ý|giúp|tìm|lập|tư vấn|hỗ trợ)\s+thêm\b[^.!?]*[.!?…]*$/iu,
  /^(?:cứ\s+)?(?:hãy\s+)?(?:nói|cho)\s+(?:mình|tui|tôi|tớ)\s+(?:biết\s+)?nếu\s+(?:bạn|ông|bà|anh|chị)\s+(?:cần|muốn)\b[^.!?]*[.!?…]*$/iu,
  /^(?:if you(?:'d| would)? like|if you want|let me know if)[^.!?]*[.!?]*$/iu,
]

// `\b` is ASCII-only in JavaScript even with the `u` flag ("thể" ends in a non-ASCII letter): a letter lookahead is the Unicode word edge.
const GENERIC_U = GENERIC.map(re => new RegExp(re.source.replace(/\\b/g, '(?![\\p{L}\\p{N}])'), re.flags))

export const isGenericInvite = (s: string): boolean => {
  const t = s.replace(/\*+/g, '').trim()
  return t.length > 0 && t.length <= 200 && !/\d/.test(t) && !/[\[\]|`#]|https?:/.test(t) && GENERIC_U.some(re => re.test(t))
}

/** The reply without its last sentence when that is a generic invitation (≥ 2 other sentences must remain). Blocks pass through. */
export function stripClosingInvite(text: string): string {
  if (!text) return text
  const blocks: string[] = []
  const masked = text.replace(BLOCKS, m => { blocks.push(m); return `\u0000B${blocks.length - 1}\u0000` })
  const restore = (s: string) => s.replace(/\u0000B(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)] ?? '')
  // the prose is everything before the first machine block / trailing markers
  const at = masked.search(/\u0000B\d+\u0000/)
  const prose = at < 0 ? masked : masked.slice(0, at)
  const tail = at < 0 ? '' : masked.slice(at)
  const trimmed = prose.replace(/\s+$/, '')
  const sentences = trimmed.split(/(?<=[.!?…])\s+/).filter(s => s.trim())
  if (sentences.length < 3) return text
  const last = sentences[sentences.length - 1]
  if (/\n/.test(last) || !isGenericInvite(last)) return text
  const lastAt = trimmed.lastIndexOf(last)
  const head = trimmed.slice(0, lastAt).replace(/\s+$/, '')
  if (!head) return text
  return restore(head + (tail ? `\n\n${tail}` : ''))
}
