// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// ── Gate 2 S5 (PROPOSAL): a server-built search URL carries only a keyword the USER gave ─────────────────────────────────────────────
//
// Before: the product-search appendix, the wrong-model block, the no-result block, the search_places / weather fallbacks, the
// search_products marketplace links and the web search link were all filled with the keyword the MODEL passed to a tool, and those
// URLs were granted 'action' -- a model could publish a search for words the user never wrote (gate2/s5/S5-DOSSIER.md).
// After: such a keyword is used only when EVERY one of its folded tokens appears in the user's own words or in a slot that code
// extracted from them (gate2/s5/S5-ADDENDUM.md §2.2). Strict subset: no stop-word list, and one shared word is NOT enough -- the
// Luna intent check (luna.ts) keeps a value on a single overlap, which is exactly what this must not do.

/** NFD without combining marks, đ → d, lower case, every non letter / digit → one space, trimmed. */
export function foldKeyword(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const tokens = (s: string): string[] => foldKeyword(s).split(' ').filter(Boolean)

/**
 * True when the keyword is non-empty and every one of its tokens is in the union of the tokens of `sources` (the user's texts and
 * code-extracted slots). Missing / empty sources are ignored; an empty keyword is never user-derived.
 */
export function isUserDerived(keyword: string | null | undefined, sources: ReadonlyArray<string | null | undefined>): boolean {
  if (typeof keyword !== 'string') return false
  const want = tokens(keyword)
  if (want.length === 0) return false
  const have = new Set<string>()
  for (const s of sources) if (typeof s === 'string') for (const t of tokens(s)) have.add(t)
  return want.every(t => have.has(t))
}

/** Count-only log of a server-built search link dropped because its keyword was not user-derived (never the keyword itself). */
export function logSearchKeywordDropped(path: 'q1' | 'q2' | 'q3' | 'q4' | 'weather' | 'products' | 'web'): void {
  console.log(JSON.stringify({ type: 'tappyai_search_keyword', path, dropped: true }))
}
