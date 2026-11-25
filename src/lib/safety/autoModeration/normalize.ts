// Text normalisation for the automatic moderation rules. Vietnamese is matched WITHOUT diacritics (so "khiêu dâm", "khieu dam" and "KHIEU  DAM" are one thing), with invisible
// characters removed and the common separator tricks ("k.h.i.e.u d.a.m", "khieeeu dam") undone. Pure; no I/O.

export interface FoldedText {
  /** Lower-case, no diacritics, single spaces, punctuation turned into spaces. Word-boundary rules run on this. */
  spaced: string
  /** Same text with EVERY non-alphanumeric removed. Only long, distinctive phrases are matched here (separator evasion). */
  compact: string
}

/** Lower-case, strip diacritics (đ becomes d) and invisible/format characters. Keeps letters, digits and spaces; everything else becomes a space. */
export function foldVietnamese(input: string): FoldedText {
  const base = String(input ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
  // A letter repeated 3+ times ("khieeeu") is cut to one: no Vietnamese word has a triple letter.
  const collapsed = base.replace(/([a-z])\1{2,}/g, '$1')
  const spaced = collapsed.replace(/[^a-z0-9]+/g, ' ').trim()
  const compact = collapsed.replace(/[^a-z0-9]+/g, '')
  return { spaced, compact }
}

/** A phrase as it must be matched on `spaced`: whole words only. */
export function wordRegex(phrase: string): RegExp {
  const esc = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`)
}
