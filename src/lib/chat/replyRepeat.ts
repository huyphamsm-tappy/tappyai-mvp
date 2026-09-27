// The pure half of the repeated-reply guard (UAT3, 2026-09-27) — no imports, so the web client,
// the server stream guard (lib/ai/stepRepeatGuard.ts) and tests share ONE definition. The Android
// client carries a line-for-line port (chat/ReplyRepeat.kt), pinned to the same cases.

export const REPEAT_SIMILARITY = 0.8
/** Prose shorter than this is a lead-in ("Để mình tìm nhé!"), not a reply worth comparing. */
export const MIN_PROSE = 60

function tokens(s: string): string[] {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd')
    .replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** Dice coefficient over word bigrams (unigrams for very short text). 1 = same wording. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b)
  if (ta.length === 0 || tb.length === 0) return 0
  const grams = (t: string[]) => {
    const m = new Map<string, number>()
    const n = t.length < 3 ? 1 : 2
    for (let i = 0; i + n <= t.length; i++) { const g = t.slice(i, i + n).join(' '); m.set(g, (m.get(g) ?? 0) + 1) }
    return m
  }
  const ga = grams(ta), gb = grams(tb)
  let inter = 0, na = 0, nb = 0
  for (const v of ga.values()) na += v
  for (const v of gb.values()) nb += v
  for (const [g, v] of ga) inter += Math.min(v, gb.get(g) ?? 0)
  return (2 * inter) / (na + nb)
}

/**
 * A single text that holds the same reply twice → the last version. The split point is a later
 * occurrence of the reply's own opening (first ~40 characters), and both halves must be at least
 * REPEAT_SIMILARITY alike, so a reply that merely mentions its first words again is untouched.
 */
export function dropRepeatedReply(text: string): string {
  const t = text.trimStart()
  if (t.length < MIN_PROSE * 2) return text
  const opening = t.slice(0, 40)
  let at = t.indexOf(opening, 40)
  while (at !== -1) {
    const first = t.slice(0, at), second = t.slice(at)
    if (first.trim().length >= MIN_PROSE && similarity(first, second) >= REPEAT_SIMILARITY) return second
    at = t.indexOf(opening, at + 1)
  }
  return text
}
