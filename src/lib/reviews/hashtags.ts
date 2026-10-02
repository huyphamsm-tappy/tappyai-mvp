// Hashtags typed (or suggested) in the post composer.
//
// A tag is stored WITHOUT its leading "#"; the UI adds exactly one "#" when it renders. The old
// composer rendered `#{tag}` over whatever the model returned, and the model returns "#Bali", so the
// screen showed "##Bali ##DuLichIndonesia" (owner 02/10). Every tag now goes through
// `normalizeHashtag`, which strips ALL leading "#" characters.

export const HASHTAG_MAX_COUNT = 10
export const HASHTAG_MAX_LENGTH = 40

/** "##Bali" -> "Bali"; "  #du lich " -> "dulich"; anything with no letter or digit -> "". */
export function normalizeHashtag(raw: string): string {
  const stripped = String(raw ?? '').normalize('NFC').replace(/^[#\s]+/, '').replace(/[^\p{L}\p{N}_]/gu, '')
  return stripped.slice(0, HASHTAG_MAX_LENGTH)
}

/** Free text typed by the poster ("#anngon, #bali  dulich") -> unique normalised tags, in order. */
export function parseHashtags(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of String(text ?? '').split(/[\s,;]+/)) {
    const tag = normalizeHashtag(piece)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= HASHTAG_MAX_COUNT) break
  }
  return out
}

/** Merge lists (the first list leads), normalised and de-duplicated, capped at the server's 10. */
export function mergeHashtags(...lists: string[][]): string[] {
  return parseHashtags(lists.flat().join(' '))
}
