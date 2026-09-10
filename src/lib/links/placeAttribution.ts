import { normalizeVN } from '@/lib/ai/intent'

// ── WHICH PLACE IS THIS SEARCH RESULT ABOUT — OR IS IT ABOUT NONE OF THEM? ───
//
// Extracted verbatim from `tiktokAttribution.ts`, which derived and measured
// every rule below against a real production batch. It lives here because a
// SECOND consumer needs exactly the same judgement and must not re-implement it:
//
//   · TikTok review links — "is this video about this restaurant?"
//   · Price snippets      — "is this price about this restaurant, or about the
//                            whole area the user searched?"
//
// Both come from ONE batch query, so in both cases a result belongs to the
// SEARCH, not to any row, until its own text names a specific place.
//
// 🔑 THE RULES ARE NOT RE-DERIVED HERE. See `tiktokAttribution.ts` for the
// measurements behind each one; the short version:
//   1. Only tokens used by exactly ONE place in the batch can identify it —
//      every place is a "Bún Bò …", so shared tokens attribute everything to
//      everything.
//   2. Whole WORDS, never substrings ("cacao" ⊅ "cao", "city" ⊅ "ty").
//   3. A token must be >= MIN_DISTINCTIVE_LENGTH to carry identity.
//   4. A decorated Vietnamese spelling matches only itself ("tiện" is not a way
//      of writing "Tiền"); undecorated ASCII may match anything.
//   5. All distinctive tokens must appear in ONE clause — a name does not
//      straddle a comma.
// Silence is the safe outcome: an unattributed result stays batch-level.

/** Words that never identify anything, whatever the batch looks like. */
const STOPWORDS = new Set([
  'quan', 'quan an', 'nha hang', 'tiem', 'cua hang', 'chi nhanh', 'cn', 'co so',
  'the', 'and', 'restaurant', 'cafe', 'coffee', 'shop', 'store', 'review',
])

/**
 * Strip diacritics, so "Ngọc" and "NGOC" become the same token.
 *
 * 🚨 `normalizeVN` strips diacritics but does NOT lowercase — measured, not assumed. Case folding
 * lives in `wordsOf` instead, because that is where spellings are produced and spellings have to be
 * comparable to each other, not only to their folded form.
 */
export const fold = (s: string): string => normalizeVN(s)

/** True when a word is spelled with Vietnamese marks (or đ) rather than plain ASCII. */
const isDecorated = (word: string): boolean => normalizeVN(word) !== word

/**
 * Every word of a string, keeping its diacritics. Case is folded here and nowhere else.
 *
 * Unicode-aware on purpose: splitting on `[^a-z0-9]` would cut "đường" into pieces.
 */
export const wordsOf = (text: string): string[] =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * A place name as `folded token -> the spellings the name itself uses`.
 *
 * The raw spellings are kept because they are the only thing separating "Tiền" from "tiện" once
 * diacritics are folded away.
 */
export const namePartsOf = (name: string): Map<string, Set<string>> => {
  const parts = new Map<string, Set<string>>()
  for (const raw of wordsOf(name)) {
    const token = fold(raw)
    if (token.length < 2 || STOPWORDS.has(token)) continue
    const spellings = parts.get(token) ?? new Set<string>()
    spellings.add(raw)
    parts.set(token, spellings)
  }
  return parts
}

/** Shortest token allowed to carry identity — derived from the measured batch, see tiktokAttribution. */
export const MIN_DISTINCTIVE_LENGTH = 3

/**
 * Punctuation that ends a clause, and therefore ends a name.
 *
 * Hyphen, pipe and slash are NOT here on purpose: real place names contain them.
 */
const CLAUSE_BREAK = /[,;:.!?…"'“”‘’«»()[\]{}\n\r]+/

/**
 * The text cut into clauses, each clause a map of `folded token -> spellings seen`.
 *
 * Title and snippet are joined by a newline, which CLAUSE_BREAK treats as a break, so a name can
 * never be assembled out of one word in the title and another in the snippet.
 */
export const clausesOf = (title: string, snippet: string): Array<Map<string, Set<string>>> =>
  `${title}\n${snippet}`
    .split(CLAUSE_BREAK)
    .map((clause) => {
      const words = new Map<string, Set<string>>()
      for (const raw of wordsOf(clause)) {
        const token = fold(raw)
        if (!token) continue
        const spellings = words.get(token) ?? new Set<string>()
        spellings.add(raw)
        words.set(token, spellings)
      }
      return words
    })
    .filter((words) => words.size > 0)

/**
 * Does this clause contain `token` spelled in a way that can be the place's own word?
 *
 * Plain ASCII always can — Serper titles are frequently undecorated, and "NGOC HAN" is a real match
 * for "Ngọc Hân". A decorated spelling can only be the place's if it IS the place's.
 */
export function tokenPresent(clause: Map<string, Set<string>>, token: string, spellings: Set<string>): boolean {
  const seen = clause.get(token)
  if (!seen) return false
  for (const raw of seen) {
    if (!isDecorated(raw) || spellings.has(raw)) return true
  }
  return false
}

/** A place and the tokens that distinguish it from the others in the same batch. */
export interface PlaceTokens {
  name: string
  parts: Map<string, Set<string>>
  /** Tokens used by exactly one place in the batch, long enough to identify. Empty ⇒ unmatchable. */
  distinctive: string[]
}

/**
 * Work out, for one batch, which tokens can identify each place.
 *
 * 🔑 SELF-CALIBRATING. Frequency is counted across THIS batch, so the same word
 * can be distinctive in one search and useless in the next. A place left with no
 * distinctive token is simply never attributed.
 */
export function placeTokensFor(placeNames: readonly string[]): PlaceTokens[] {
  const frequency = new Map<string, number>()
  const parsed = placeNames.map((name) => {
    const parts = namePartsOf(name)
    for (const t of parts.keys()) frequency.set(t, (frequency.get(t) ?? 0) + 1)
    return { name, parts }
  })
  return parsed.map(({ name, parts }) => ({
    name,
    parts,
    distinctive: [...parts.keys()].filter(
      (t) => frequency.get(t) === 1 && t.length >= MIN_DISTINCTIVE_LENGTH,
    ),
  }))
}

/** Does this text name that specific place? All distinctive tokens, inside ONE clause. */
export function textNamesPlace(title: string, snippet: string, place: PlaceTokens): boolean {
  if (place.distinctive.length === 0) return false
  for (const clause of clausesOf(title, snippet)) {
    if (place.distinctive.every((t) => tokenPresent(clause, t, place.parts.get(t) as Set<string>))) {
      return true
    }
  }
  return false
}

/**
 * The single place this text is about, or null when it is about none of them —
 * or about more than one, which is the same thing for attribution purposes.
 *
 * 🚨 TWO MATCHES IS NOT A MATCH. A listicle titled "Top 10 quán bún bò Quận 1"
 * that happens to name three of the batch's restaurants is evidence about the
 * AREA, not about any one of them. Returning the first would be the `i === 0`
 * bug in a new costume.
 */
export function placeNamedBy(
  title: string | null | undefined,
  snippet: string | null | undefined,
  places: readonly PlaceTokens[],
): string | null {
  const named = places.filter((p) => textNamesPlace(title ?? '', snippet ?? '', p))
  return named.length === 1 ? named[0].name : null
}
