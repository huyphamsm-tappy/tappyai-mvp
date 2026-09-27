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

// ── Sentence-level repeats (UAT4 P1-a, 2026-09-27) ─────────────────────────────────────────────
//
// Measured on web ("thuy cung sai gon"): step 1 asked three questions, step 2 repeated a SHORTER
// version of them (two of the three questions, verbatim) and step 3 answered. The shorter copy is
// only ~0.6 Dice-alike to the original, so the whole-reply test above let it through. The unit that
// repeats is the SENTENCE: a sentence that already appeared earlier in the reply is dropped, and
// everything new is kept. Measured on Android (long thread, turn 7): a phrase repeated back to back
// — "(1 giờ sáng) nhé! 🌙 (1 giờ sáng) nhé! 🌙" — collapses to one.

const BLOCK_RE = /\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/gi
/** A sentence whose folded key is shorter than this ("Nhé!", "- Giá: chưa có") is never deduped. */
const MIN_SENTENCE_KEY = 20
const NEAR_DUPLICATE = 0.9

const sentenceKey = (s: string) => tokens(s).join(' ')

/** Prose segments and app blocks, in order; only prose is ever edited. */
function segments(text: string): Array<{ block: boolean; text: string }> {
  const out: Array<{ block: boolean; text: string }> = []
  let last = 0
  for (const m of text.matchAll(BLOCK_RE)) {
    if (m.index! > last) out.push({ block: false, text: text.slice(last, m.index) })
    out.push({ block: true, text: m[0] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ block: false, text: text.slice(last) })
  return out
}

/** Sentences with their trailing punctuation, emoji and whitespace kept attached. */
function sentences(prose: string): string[] {
  return prose.match(/[^.!?…\n]+(?:[.!?…]+|\n|$)(?:[\s\p{Extended_Pictographic}️‍]*)/gu) ?? [prose]
}

function isRepeat(key: string, seen: string[]): boolean {
  if (key.length < MIN_SENTENCE_KEY) return false
  return seen.some(k => k === key || (k.length >= MIN_SENTENCE_KEY && similarity(k, key) >= NEAR_DUPLICATE))
}

/**
 * Drops every prose sentence that repeats one said earlier — earlier in `text`, or in `prior`
 * (prose already sent in this turn). Blocks are untouched; nothing new is ever removed.
 */
export function dedupeSentences(text: string, prior: string[] = []): string {
  const seen = prior.flatMap(p => sentences(p.replace(BLOCK_RE, ' ')).map(sentenceKey)).filter(Boolean)
  let changed = false
  const out = segments(text).map(seg => {
    if (seg.block) return seg.text
    return sentences(seg.text).map(s => {
      const key = sentenceKey(s)
      if (isRepeat(key, seen)) { changed = true; return '' }
      if (key) seen.push(key)
      return s
    }).join('')
  }).join('')
  return changed ? out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : text
}

/** A run of 2–12 words repeated back to back ("(1 giờ sáng) nhé! 🌙 (1 giờ sáng) nhé! 🌙") → once. */
export function collapseAdjacentRepeats(text: string): string {
  return segments(text).map(seg => seg.block ? seg.text : seg.text.replace(/((?:\S+[ \t]+){2,12}?)(?:\1)+/gu, (m, unit: string) =>
    unit.replace(/\s/g, '').length >= 10 && /\p{L}/u.test(unit) ? unit : m)).join('')
}

/** The client's last pass over a finished reply: whole-reply repeat, then sentences, then phrases. */
export function cleanRepeats(text: string): string {
  return collapseAdjacentRepeats(dedupeSentences(dropRepeatedReply(text)))
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
