// ── A citation travels with its sentence (30/10/2026) ──────────────────────────────────────────────────────────────────────────────────
//
// The answer cites a source right after the statement ("… 120.000đ/người (theo [Vietravel](https://…)).", "… đừng cố đi thuyền.
// [Dự báo thời tiết](https://…)"). Measured on localhost 29–30/10: when a guard removed such a statement, its citation stayed behind as a
// fragment of its own — "Vietravel).", a bare "Dự báo thời tiết" line — because the citation was not part of the sentence the guard cut.
// These helpers say, from the text's STRUCTURE only (markdown links, bare URLs, punctuation), whether a piece of text is nothing but a
// citation, so a guard that drops a sentence drops the citation that hangs on it. No word list. Pure.

/** Markdown links and images, and bare URLs. */
const LINK_RE = /!?\[[^\]\n]*\]\([^)\n]*\)|https?:\/\/[^\s<>()]+/g

/** True when `segment` has a link and nothing else that reads: no letter or digit outside its links (brackets and punctuation only). */
export function isCitationOnly(segment: string): boolean {
  if (!segment.match(LINK_RE)) return false
  return !/[\p{L}\p{N}]/u.test(segment.replace(LINK_RE, ' '))
}

/** `s` with every link / URL replaced by the same number of "x": a clause scan then never stops at a bracket that belongs to a link. */
export function maskLinks(s: string): string {
  return s.replace(LINK_RE, m => 'x'.repeat(m.length))
}

/** Text that ends a sentence: a stop, then closing emphasis / quotes / brackets, then only spaces. */
export const ENDS_SENTENCE = /[.!?…][*_"'”’)\]]*[ \t]*$/u
