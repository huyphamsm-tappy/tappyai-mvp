// ── CONSULT_THREAD_AWARE_ASK (Wave 2D · A, hardened in Wave 2E): a reference to a product the thread already SHOWED ───────────────────────────────────────────
//
// A shopping reply carries its products as a structured payload ([TAPPY_SHOPPING]{"entities":[{"name":…}]}), and the client sends that reply back with the rest of the thread. Until now the router read
// references only against the BOLD names of the prose ("**Mình chọn: X**"), so "uag đó" after a card of six products was read as a brand-new request and the thread's answers were asked again.
//
// This module resolves such a reference from the payload's product names alone (pure, no model, no network, no list of brands, lines or product words). The payload comes back in the client's history, so
// it is UNTRUSTED data: titles are cut (160 chars), de-duplicated and capped (12), and nothing of a title reaches a card option except letters and digits.
//
// What may point at a product (Wave 2E: nothing here depends on how a title is capitalised - marketplace titles are Title Case, so a capital says nothing):
//   · a message word that at most HALF of the shown titles carry (words the titles share - the category - never tell products apart) and that the user has not already used earlier in the
//     consultation (a word of the request itself is the description, not a name);
//   · and the message must POINT: a demonstrative right after the matched words ("uag đó", "cái chống sốc này", diacritics exact). Descriptive words ("chống sốc", "da thật", "cho") inside a new
//     request are never enough, however many of them a title shares, and a title typed back with no demonstrative keeps the old reading.
//   · a negation just before the matched words ("không lấy", "đừng mua cái UAG đó", "bỏ") is not a pointer.
// Exactly one product carries the strongest match → ONE; two to four → MANY (only that difference is worth asking); none, more than four, or a weak / negated match → NONE: the old reading stands.

const MAX_TITLES = 12
const MAX_CANDIDATES = 4
const nfc = (s: string): string => s.normalize('NFC')
const foldKey = (s: string): string => nfc(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const wordsOf = (s: string): string[] => nfc(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const isNumber = (w: string): boolean => /^\p{N}+$/u.test(w)
/** The words of a text that can tell products apart: three letters or more, never a bare number. */
const keyWords = (s: string): string[] => wordsOf(s).map(foldKey).filter(k => k.length >= 3 && !isNumber(k))

/** The demonstratives of Vietnamese ("đó", "này", "kia", "ấy"), diacritics exact: the folded forms are also "đỏ" (red) and "do" (by), so a text typed without diacritics never counts as pointing. */
const DEMONSTRATIVES: ReadonlySet<string> = new Set(['đó', 'này', 'kia', 'ấy'])
/** Negation particles of Vietnamese, diacritics exact ("bỏ" is not "bò"), as a person writes a refusal. */
const NEGATIONS: ReadonlySet<string> = new Set(['không', 'ko', 'k', 'đừng', 'chẳng', 'chả', 'hông', 'hổng', 'bỏ', 'chưa'])
const NEGATION_WINDOW = 3

/** The product names of the shopping card inside ONE assistant message (empty when it has none or the payload is malformed). */
export function shopCardTitles(assistantText: string): string[] {
  const m = /\[TAPPY_SHOPPING\]([\s\S]*?)\[\/TAPPY_SHOPPING\]/.exec(assistantText)
  if (!m) return []
  try {
    const v = JSON.parse(m[1]) as { entities?: Array<{ name?: unknown }> }
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of v.entities ?? []) {
      const name = typeof e?.name === 'string' ? nfc(e.name).replace(/\s+/g, ' ').trim().slice(0, 160) : ''
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
  /** How many distinguishing words of the message matched (a count only - never the words). */
  matchedTokens: number
}

const NONE: ShownRef = { kind: 'none', titles: [], matchedTokens: 0 }

export interface ShownRefOptions {
  /** The user's EARLIER texts of this consultation: a word already used there is the request's own description, not a product name. */
  established?: readonly string[]
}

/** True when a negation particle stands within the few words before position `at` of `words` (NFC, lower case, diacritics exact). */
export function negatedBefore(words: readonly string[], at: number): boolean {
  for (let i = Math.max(0, at - NEGATION_WINDOW); i < at; i++) if (NEGATIONS.has(words[i])) return true
  return false
}

export function resolveShownReference(userText: string, shown: readonly string[], opts: ShownRefOptions = {}): ShownRef {
  const titles = [...new Map(shown.map(t => [foldKey(t), nfc(t)])).values()].slice(0, MAX_TITLES)
  if (titles.length < 2) return NONE // with one product on the card there is nothing to tell apart: the old reading stands
  const keysOf = titles.map(t => new Set(keyWords(t)))
  const df = new Map<string, number>()
  for (const ks of keysOf) for (const k of ks) df.set(k, (df.get(k) ?? 0) + 1)
  const established = new Set((opts.established ?? []).flatMap(keyWords))
  // The message, word by word: raw (NFC, lower case) for the demonstratives and the negations, folded for the matching.
  const raw = wordsOf(userText).map(w => w.toLowerCase())
  const folded = raw.map(foldKey)
  const matchedAt = new Set<number>()
  const matchedKeys = new Set<string>()
  folded.forEach((k, i) => {
    if (k.length < 3 || isNumber(k) || established.has(k)) return
    const n = df.get(k)
    if (n !== undefined && n * 2 <= titles.length) { matchedAt.add(i); matchedKeys.add(k) }
  })
  if (matchedKeys.size === 0) return NONE
  // A negation just before the first matched word (or before a classifier in front of it) turns the message away from the product.
  if (negatedBefore(raw, Math.min(...matchedAt))) return NONE
  // The message must POINT: a demonstrative right after the matched words. (A long match is not enough: on Title Case titles a request such as "cho mình ốp lưng chống sốc" shares three or four words
  // with a title and is still a request.)
  let pointing = false
  for (const i of matchedAt) {
    let j = i + 1
    while (matchedAt.has(j)) j++
    if (DEMONSTRATIVES.has(raw[j] ?? '')) pointing = true
  }
  if (!pointing) return NONE
  const keys = [...matchedKeys]
  const scores = keysOf.map(ks => keys.filter(k => ks.has(k)).length)
  const best = Math.max(...scores)
  const picked = titles.filter((_, i) => scores[i] === best)
  if (picked.length === 1) return { kind: 'one', titles: picked, matchedTokens: keys.length }
  if (picked.length <= MAX_CANDIDATES) return { kind: 'many', titles: picked, matchedTokens: keys.length }
  return NONE
}

const cleanLabel = (words: readonly string[], max: number): string => words.slice(0, max).join(' ').slice(0, 40).trim()

/**
 * Short labels that tell the candidates apart: each title minus the words EVERY candidate carries, at most three words. A label that comes out empty or equal to another is built from the first
 * words of its own title with its position added, so two options are never the same text. Letters and digits only: a title is untrusted and never reaches an option as it is.
 */
export function distinguishingLabels(candidates: readonly string[]): string[] {
  const keys = candidates.map(t => new Set(wordsOf(t).map(foldKey)))
  const common = new Set([...keys[0] ?? []].filter(k => keys.every(ks => ks.has(k))))
  const labels = candidates.map(t => cleanLabel(wordsOf(t).filter(w => w.length >= 2 && !common.has(foldKey(w))), 3))
  return labels.map((l, i) => (l.length >= 2 && labels.indexOf(l) === i && labels.lastIndexOf(l) === i ? l : `${cleanLabel(wordsOf(candidates[i]), 3) || 'Mẫu'} ${i + 1}`.trim()))
}
