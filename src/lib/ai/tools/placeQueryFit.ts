// What a place row's NAME can say about what the person asked for (03/11).
//
// The one-brain model searches places and reads the rows; the rows say a name, a rating and a distance, not a menu. When the person named a specific
// thing ("hủ tiếu xương", "cà phê yên tĩnh có wifi"), a row whose name shows none of it may still be a good answer, but it must not be presented as
// one without other evidence. This is that signal, computed from the query and the names alone: per row, which specific terms the name shows and
// which it misses. Never a filter and never a reorder: a name does not list a menu. Pure.

const GENERIC = new Set([
  // place words and politeness
  'quan', 'nha', 'hang', 'tiem', 'cua', 'an', 'uong', 'ngon', 'gan', 'day', 'o', 'tai', 'cho', 'toi', 'minh', 'tui', 'cha', 'ong', 'ba', 'oi', 'nhe', 'a', 'di', 'co', 'va', 'la', 'nao',
  'tot', 'dep', 're', 'gia', 'view', 'tim', 'kiem', 'mot', 'cai', 'nhung', 'the', 'near', 'me', 'best', 'good', 'in', 'at', 'of', 'and', 'restaurant',
  // location words
  'phuong', 'duong', 'tp', 'hcm', 'ho', 'chi', 'minh', 'sai', 'gon', 'ha', 'noi', 'da', 'nang', 'thanh', 'pho', 'khu', 'vuc', 'q', 'p',
])

/** Lowercase, diacritics folded, đ → d, only letters and digits as separators. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}
const words = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(Boolean)

export interface PlaceQueryFit {
  /** The specific terms of the query (folded). */
  terms: string[]
  rows: Array<{ name: string; shows: string[]; missing: string[] }>
  /** Names of the rows that show every specific term. */
  fullMatches: string[]
  /** One sentence for the model when terms exist but no row name shows all of them; else null. */
  note: string | null
}

export function placeQueryFit(query: string, rows: ReadonlyArray<{ name?: unknown }>): PlaceQueryFit {
  const terms: string[] = []
  for (const w of words(query)) {
    if (GENERIC.has(w) || /^\d+$/.test(w) || terms.includes(w)) continue
    terms.push(w)
  }
  const out: PlaceQueryFit['rows'] = []
  for (const r of rows) {
    if (typeof r?.name !== 'string' || !r.name.trim()) continue
    const have = new Set(words(r.name))
    out.push({ name: r.name, shows: terms.filter(t => have.has(t)), missing: terms.filter(t => !have.has(t)) })
  }
  const fullMatches = terms.length > 0 ? out.filter(r => r.missing.length === 0).map(r => r.name) : []
  const note = terms.length > 0 && fullMatches.length === 0
    ? `No row name shows all of: ${terms.join(' ')}. A name is only a weak signal, but do not present a row as serving what the person named unless its own evidence says so; otherwise say plainly that it is not a specialist, or look for the item on delivery or menu pages.`
    : null
  return { terms, rows: out, fullMatches, note }
}
