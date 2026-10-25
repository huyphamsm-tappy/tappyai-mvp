// ── CONSULT_THREAD_AWARE_ASK (Wave 2D · A): a reference to a product the thread already SHOWED ───────────────────────────────────────────────────────────────
//
// A shopping reply carries its products as a structured payload ([TAPPY_SHOPPING]{"entities":[{"name":…}]}), and the client sends that reply back with the rest of the thread. Until now the router read
// references only against the BOLD names of the prose ("**Mình chọn: X**"), so "uag đó" after a card of six products was read as a brand-new request and the thread's answers were asked again.
//
// This module resolves such a reference from the payload's product names alone (pure, no model, no network, no list of brands or lines):
//   · a message token can only point at a product when it is a NAME-LIKE token of a shown title (capitalised, upper-case or with an inner capital: "UAG", "Pathfinder", "Techwoven") that at most HALF
//     of the shown titles carry, so the words the titles share ("Ốp lưng iPhone 18 …", "Pro", "Max") and ordinary lower-case words ("cho", "mua", "online") never point at anything;
//   · exactly one product carries the strongest match → ONE (the user means that product); two to four → MANY (the data cannot tell them apart - only that difference is worth asking);
//     none, or more than four → NONE (not a reference: the old reading stands).
// The match is on the user's own message, against names the thread's reply really showed. Nothing is guessed.

const MAX_TITLES = 12
const MAX_CANDIDATES = 4

const foldKey = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const wordsOf = (s: string): string[] => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
/** A word that names something: capitalised, all capitals, or an inner capital ("iPhone"); never a bare number. */
const isNameLike = (w: string): boolean => w.length >= 3 && !/^\p{N}+$/u.test(w) && (/^\p{Lu}/u.test(w) || /\p{Ll}\p{Lu}/u.test(w))

/** The product names of the shopping card inside ONE assistant message (empty when it has none or the payload is malformed). */
export function shopCardTitles(assistantText: string): string[] {
  const m = /\[TAPPY_SHOPPING\]([\s\S]*?)\[\/TAPPY_SHOPPING\]/.exec(assistantText)
  if (!m) return []
  try {
    const v = JSON.parse(m[1]) as { entities?: Array<{ name?: unknown }> }
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of v.entities ?? []) {
      const name = typeof e?.name === 'string' ? e.name.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
      const key = foldKey(name)
      if (name.length >= 3 && !seen.has(key)) { seen.add(key); out.push(name) }
    }
    return out.slice(0, MAX_TITLES)
  } catch { return [] }
}

/** The names of the NEWEST shopping card among `assistantTexts` (oldest first): what the user was last shown. */
export function newestShopCardTitles(assistantTexts: readonly string[]): string[] {
  for (let i = assistantTexts.length - 1; i >= 0; i--) {
    const t = shopCardTitles(assistantTexts[i] ?? '')
    if (t.length) return t
  }
  return []
}

export interface ShownRef {
  kind: 'none' | 'one' | 'many'
  /** The product(s) the message points at (one title for 'one', two to four for 'many', none otherwise). */
  titles: string[]
  /** How many distinguishing tokens of the message matched (a count only - never the words). */
  matchedTokens: number
}

const NONE: ShownRef = { kind: 'none', titles: [], matchedTokens: 0 }

export function resolveShownReference(userText: string, shown: readonly string[]): ShownRef {
  const titles = [...new Map(shown.map(t => [foldKey(t), t])).values()].slice(0, MAX_TITLES)
  if (titles.length < 2) return NONE // with one product on the card there is nothing to tell apart: the old reading stands
  const keysOf = titles.map(t => new Set(wordsOf(t).filter(isNameLike).map(foldKey)))
  const df = new Map<string, number>()
  for (const ks of keysOf) for (const k of ks) df.set(k, (df.get(k) ?? 0) + 1)
  const message = new Set(wordsOf(userText).map(foldKey).filter(k => k.length >= 3))
  // A token tells products apart only when at most HALF of the shown titles carry it: a word most titles share ("Pro", "Max" on a card of cases for one phone) is the category, not a pointer.
  const matched = [...df].filter(([k, n]) => n * 2 <= titles.length && message.has(k)).map(([k]) => k)
  if (matched.length === 0) return NONE
  const scores = keysOf.map(ks => matched.filter(k => ks.has(k)).length)
  const best = Math.max(...scores)
  const picked = titles.filter((_, i) => scores[i] === best)
  if (picked.length === 1) return { kind: 'one', titles: picked, matchedTokens: matched.length }
  if (picked.length <= MAX_CANDIDATES) return { kind: 'many', titles: picked, matchedTokens: matched.length }
  return NONE
}

/**
 * Short labels that tell the candidates apart: each title minus the words EVERY candidate carries, at most three words. A label that comes out empty or equal to another falls back to the
 * title itself (cut), so two options are never the same text.
 */
export function distinguishingLabels(candidates: readonly string[]): string[] {
  const keys = candidates.map(t => new Set(wordsOf(t).map(foldKey)))
  const common = new Set([...keys[0] ?? []].filter(k => keys.every(ks => ks.has(k))))
  const labels = candidates.map(t => wordsOf(t).filter(w => w.length >= 2 && !common.has(foldKey(w))).slice(0, 3).join(' '))
  return labels.map((l, i) => (l.length >= 2 && labels.indexOf(l) === i && labels.lastIndexOf(l) === i ? l : candidates[i].slice(0, 40).trim()))
}
