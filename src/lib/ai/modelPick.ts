// ── THE MODEL'S PICK SURVIVES THE GUARDS (UAT4 P1-d recurrence, c40 F8) ─────────────────────
//
// Measured on the audit sink (c40 A/B, 27 Sep 2026): the pick sentence was cut by the money guard,
// the spec guard, the place-claim chain and the V1 prose guards — eleven turns, five different guards.
// Patching each guard would miss the next one, so the invariant is enforced once, after all of them:
// the venue the MODEL chose is still named in a pick (non-alternative) sentence, or its evidence-only
// pick sentence is put back.
//
// Two defects made the old backstop unsafe:
//   · it restored the ENGINE's pick, not the model's (f8-1, 28 Sep: the model chose Nhà Hàng Ngon for a
//     boss's birthday, the guards cut the sentence, the reply led with "Mình chọn The Lủi - Quán Nhậu");
//   · "Thay thế: **Nhà Hàng Du Ký** …" did not read as an alternative, so a reply whose only venue
//     sentence was the alternative counted as having a pick (c40 F8 on 526129a: no pick at all).

import { sentenceSpans } from './moneyGuard'
import { normalizeVN } from './intent'

/** A sentence that offers an ALTERNATIVE, not the pick. Tested on the sentence's start (markdown allowed). */
export const ALT_SENTENCE = /^\s*(?:[-•*]\s*)?(?:\*\*)?(?:n[eế]u|ngo[àa]i ra|ho[ặa]c|c[òo]n|thay v[àa]o [dđ][óo]|thay th[ếe]|l[ựu]a ch[ọo]n kh[áa]c|ph[ưu][ơo]ng [áa]n (?:kh[áa]c|d[ựu] ph[òo]ng)|if you|or\b|alternatively|otherwise|another option)/iu

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ')
/** The part of a provider name a reply writes ("Nhà Hàng Ngon - Pasteur | …" → "nha hang ngon"). */
const head = (name: string) => fold(name).split(/\s*[|(–—]\s*|\s+-\s+/)[0].trim()
const BLOCKS = /\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/g

function sentences(text: string): string[] {
  const t = text.replace(BLOCKS, ' ')
  return sentenceSpans(t).map(([a, b]) => t.slice(a, b)).filter(s => s.trim())
}

function named(sentence: string, names: readonly string[]): string | null {
  const f = fold(sentence)
  let best: string | null = null
  let len = 0
  for (const n of names) {
    const h = head(n)
    if (h.length >= 4 && f.includes(h) && h.length > len) { best = n; len = h.length }
  }
  return best
}

/** The venue the model chose: named in its first non-alternative sentence. Returns the ROW's name. */
export function modelPickName(raw: string, names: readonly string[]): string | null {
  for (const s of sentences(raw)) {
    if (ALT_SENTENCE.test(s)) continue
    const n = named(s, names)
    if (n) return n
  }
  return null
}

/** Is the pick still stated — named in a non-alternative sentence of the guarded body? */
export function pickStillStated(body: string, pick: string): boolean {
  return sentences(body).some(s => !ALT_SENTENCE.test(s) && named(s, [pick]) !== null)
}
