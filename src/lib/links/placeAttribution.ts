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

// ── G1 · Attribution ladder (PLACE_GUARD_ATTRIBUTION_V2) ──────────────────────
//
// `textNamesPlace` above is the ONLY way the place-claim guard could tie a sentence
// to a venue, and it needs DISTINCTIVE tokens (tokens no other name in the batch
// carries) all inside ONE clause. Three real name shapes defeat it — chains whose
// branches share every token ("MASSAGE HẠ SPA QUẬN 1" / "MASSAGE HẠ SPA Tân Bình"),
// names with an address glued on ("Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1"),
// and sub-titled names ("QUÁN ĂN NGON - Nguyên Sinh Bistro - est. 1942"). Measured
// on the 2026-09-17 V3 baseline: the guard then deleted the decision sentence and
// left fragments, or nothing at all (#15-r1: 46 chars delivered of 441 tokens).
//
// The ladder below finds the venue a sentence is about by identity first and
// tokens last. It changes HOW attribution is found, never WHETHER an unsupported
// claim may stay: a sentence no level can tie to exactly one venue is still
// unattributable, and the guard still removes its claims.

/** Tokens too generic to identify a venue on their own (a superset of STOPWORDS). */
const COMMON_TOKENS = new Set<string>([
  ...STOPWORDS,
  'spa', 'massage', 'nha', 'hang', 'quan', 'an', 'cafe', 'coffee', 'ca', 'phe', 'tra', 'sua',
  'bar', 'pub', 'karaoke', 'cinema', 'rap', 'phim', 'hotel', 'khach', 'san', 'resort', 'homestay',
  'food', 'kitchen', 'bistro', 'house', 'garden', 'sai', 'gon', 'saigon', 'hcm', 'tp', 'thanh', 'pho',
  'district', 'q', 'so', 'duong', 'street', 'com', 'bun', 'mi', 'lau', 'nuong', 'chay', 'ngon',
])

export type AttributionLevel = 'L1' | 'L2' | 'L2p' | 'L3' | 'L4'

export interface PlaceAttribution {
  name: string
  level: AttributionLevel
}

/** Diacritics stripped, lower-cased, markdown/punctuation folded to single spaces, padded. */
export function foldForContainment(text: string): string {
  const folded = fold(text.toLowerCase())
    .replace(/[*_`~]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return folded ? ` ${folded} ` : ''
}

const foldedTokens = (text: string): string[] => wordsOf(text).map(fold).filter(t => t.length >= 2)
const nonCommon = (tokens: readonly string[]): string[] => tokens.filter(t => !COMMON_TOKENS.has(t))
const nonStop = (tokens: readonly string[]): string[] => tokens.filter(t => !STOPWORDS.has(t))

/** Segments of a venue name as providers write them: "Head - Sub, Address (note)". */
const SEGMENT_BREAK = /\s[-–|]\s|[,;:()[\]]|\s-\s?|\s?-\s/u
export function nameSegments(name: string): string[] {
  return name.split(SEGMENT_BREAK).map(s => s.trim()).filter(Boolean)
}

/**
 * Can this string identify a venue on its own? Two tokens, or one token nobody
 * else's category word could be ("Spa" alone, "Cafe" alone never qualify).
 */
const identifying = (s: string): boolean => {
  const all = nonStop(foldedTokens(s))
  return all.length >= 2 || nonCommon(all).length >= 1
}

/**
 * Aliases a model may use for a name: its head segment (L2) and any other segment
 * (L2′). An alias counts only when it carries ≥ 2 tokens outside COMMON_TOKENS
 * (the owner rule said non-stop-word; the wider common list is used because
 * "QUÁN ĂN NGON" and "Cafe Sài Gòn" — the owner's own examples — are made of
 * category and city words that STOPWORDS alone does not cover) and is not the
 * whole name. Uniqueness across the batch is enforced by the caller.
 */
export function aliasesOf(name: string): { head: string | null; segments: string[] } {
  const segs = nameSegments(name)
  const full = foldForContainment(name)
  const ok = (s: string): boolean => nonCommon(foldedTokens(s)).length >= 2 && foldForContainment(s) !== full
  const head = segs.length > 1 && ok(segs[0]) ? segs[0] : null
  const segments = segs.slice(1).filter(ok)
  return { head, segments }
}

/**
 * Which ONE venue (of `names`) is this sentence about — by identity first, tokens last.
 * Levels are tried in order. An IDENTITY level (L1, L2, L2′) that matches two or
 * more venues means the sentence names several ("A và B đều ở gần") and the answer
 * is null — a token level below must not pick one of them. A TOKEN level (L3, L4)
 * that matches several is merely noisy and the next level is tried; nothing at any
 * level → null (unattributable).
 */
export function attributePlace(sentence: string, names: readonly string[]): PlaceAttribution | null {
  const hay = foldForContainment(sentence)
  if (!hay) return null
  const one = (matches: string[], level: AttributionLevel): PlaceAttribution | null =>
    matches.length === 1 ? { name: matches[0], level } : null

  // L1 — the full normalised name appears in the sentence. A name that is a single
  // category word ("Spa") cannot identify anything and is skipped.
  const l1 = [...new Set(names.filter(n => { const f = foldForContainment(n); return f.length > 2 && identifying(n) && hay.includes(f) }))]
  if (l1.length > 1) return null
  const r1 = one(l1, 'L1'); if (r1) return r1

  // L2 / L2′ — a unique alias (head, then other segments) appears in the sentence.
  const aliasIndex = new Map<string, Set<string>>() // folded alias → names that own it
  const heads = new Map<string, string>()
  for (const n of names) {
    const { head, segments } = aliasesOf(n)
    if (head) { const f = foldForContainment(head); heads.set(n, f); aliasIndex.set(f, (aliasIndex.get(f) ?? new Set()).add(n)) }
    for (const s of segments) { const f = foldForContainment(s); aliasIndex.set(f, (aliasIndex.get(f) ?? new Set()).add(n)) }
  }
  const uniqueAlias = (f: string): boolean => (aliasIndex.get(f)?.size ?? 0) === 1
  const l2 = [...new Set(names.filter(n => { const h = heads.get(n); return !!h && uniqueAlias(h) && hay.includes(h) }))]
  if (l2.length > 1) return null
  const r2 = one(l2, 'L2'); if (r2) return r2
  const l2p = [...new Set(names.filter(n => aliasesOf(n).segments.some(s => { const f = foldForContainment(s); return uniqueAlias(f) && hay.includes(f) })))]
  if (l2p.length > 1) return null
  const r2p = one(l2p, 'L2p'); if (r2p) return r2p

  // L3 — the existing distinctive-tokens-in-one-clause rule.
  const tokens = placeTokensFor(names)
  const l3 = tokens.filter(t => textNamesPlace(sentence, '', t)).map(t => t.name)
  const r3 = one([...new Set(l3)], 'L3'); if (r3) return r3

  // L4 — every token of the name (minus stop-words) is somewhere in the sentence.
  // Owner rule: only for names with ≥ 3 tokens or ≥ 1 non-common token, and the
  // subset test runs on the non-common tokens when there are any (a shared
  // "quán"/"spa" in the sentence must not vote).
  const sentenceTokens = new Set(foldedTokens(sentence))
  const l4 = names.filter(n => {
    const all = nonStop(foldedTokens(n))
    const nc = nonCommon(all)
    if (all.length < 3 && nc.length === 0) return false
    const probe = nc.length > 0 ? nc : all
    return probe.length > 0 && probe.every(t => sentenceTokens.has(t))
  })
  return one([...new Set(l4)], 'L4')
}
