import { normalizeVN } from './intent'

// ── BUG 2 — the user's constraint must survive retrieval ─────────────────────
//
// 🚨 THE DEFECT. "Tìm nhà hàng buffet ở Hà Nội" became the Overpass query
// `amenity=restaurant` and nothing else. The word "buffet" was dropped at query
// construction: the keyword ladder in `searchPlacesOSM` had branches for
// cafe/spa/hotel/attraction/bar/gym/cinema/hospital/pharmacy/bank, none for
// buffet, and no mechanism to carry a cuisine or diet constraint at all.
// Measured on the reproduced turn: 0 of 10 returned rows carried `cuisine=buffet`.
//
// 🔑 WHY THIS IS THE ROOT OF THE FABRICATION BUG. The model was asked for buffet
// restaurants and handed ten ordinary ones. The gap between the request and the
// evidence is exactly what it filled from memory. Fixing retrieval removes the
// pressure; the grounding gate is the backstop for when it cannot be removed.
//
// 🚨 A CONSTRAINT IS NEVER SILENTLY DROPPED. Either it reaches the provider, or
// it is carried as a post-retrieval fact the reply must account for. What must
// not happen is "buffet in Hanoi" quietly becoming "restaurants in Hanoi".

export type FoodConstraintKind = 'buffet' | 'vegetarian' | 'vegan' | 'cafe' | 'bar' | 'seafood' | 'hotpot'

export interface FoodConstraint {
  kind: FoodConstraintKind
  /**
   * An Overpass tag filter appended to the element selector, or `null` when OSM
   * has no reliable tag for it. `null` means "enforce after retrieval" — never
   * "forget about it".
   */
  osmFilter: string | null
  /** What the user asked for, for the model to reference honestly. */
  label: string
}

/**
 * The recognised food constraints, matched against `normalizeVN` output
 * (lowercase, diacritics stripped) so "buffet"/"búp phê" and "chay" both land.
 *
 * 🔑 ONLY TAGS THAT ACTUALLY EXIST IN OSM. `cuisine` and `diet:*` are real,
 * widely-used keys. Nothing here invents provider syntax — an unsupported
 * constraint gets `osmFilter: null` and is enforced after retrieval instead.
 */
const CONSTRAINTS: ReadonlyArray<[RegExp, FoodConstraint]> = [
  [/\bbuffet\b|buop phe|bup phe|\bbuffe\b/, { kind: 'buffet', osmFilter: '["cuisine"~"buffet",i]', label: 'buffet' }],
  [/\bchay\b|vegetarian|an chay/, { kind: 'vegetarian', osmFilter: '["diet:vegetarian"~"yes|only",i]', label: 'chay' }],
  [/\bvegan\b|thuan chay/, { kind: 'vegan', osmFilter: '["diet:vegan"~"yes|only",i]', label: 'vegan' }],
  [/\bcafe\b|ca phe|coffee/, { kind: 'cafe', osmFilter: null, label: 'cafe' }],
  [/\bbar\b|\bpub\b/, { kind: 'bar', osmFilter: null, label: 'bar' }],
  [/hai san|seafood/, { kind: 'seafood', osmFilter: '["cuisine"~"seafood",i]', label: 'hải sản' }],
  [/lau\b|hot ?pot/, { kind: 'hotpot', osmFilter: '["cuisine"~"hot_pot|hotpot",i]', label: 'lẩu' }],
]

/**
 * Which constraints this query carries.
 *
 * `cafe` and `bar` return `osmFilter: null` on purpose: the existing keyword
 * ladder already turns them into `amenity=cafe` / `amenity=bar`, which is a
 * stronger filter than any cuisine tag. Listing them here keeps the constraint
 * VISIBLE to the rest of the pipeline without changing that behaviour.
 */
export function detectFoodConstraints(query: string): FoodConstraint[] {
  const q = normalizeVN((query || '').toLowerCase())
  const out: FoodConstraint[] = []
  for (const [re, c] of CONSTRAINTS) if (re.test(q)) out.push(c)
  return out
}

/** The Overpass tag filters to append, for constraints OSM can actually express. */
export function osmFilterFor(constraints: FoodConstraint[]): string {
  return constraints.map(c => c.osmFilter).filter((f): f is string => !!f).join('')
}

/** A retrieved row, loosely typed so both provider shapes satisfy it. */
export interface ConstraintCheckRow {
  name?: string
  cuisine?: string
  vegetarian?: boolean
  vegan?: boolean
  place_types?: string[]
}

/**
 * Does this row satisfy the constraint, on the evidence the row carries?
 *
 * 🚨 UNKNOWN IS NOT SATISFACTION, AND IT IS NOT REJECTION EITHER. A row with no
 * `cuisine` tag has not been shown to be a buffet — but OSM tagging is sparse
 * (measured: `cuisine` present on roughly half of VN venues), so treating
 * silence as a failure would empty the result list for an honest query. The
 * caller decides; this only reports what the evidence says.
 */
export function rowSatisfies(row: ConstraintCheckRow, c: FoodConstraint): boolean | null {
  const name = normalizeVN((row.name || '').toLowerCase())
  const cuisine = normalizeVN((row.cuisine || '').toLowerCase())
  const types = (row.place_types || []).join(' ').toLowerCase()

  switch (c.kind) {
    case 'buffet':
      if (cuisine.includes('buffet') || name.includes('buffet')) return true
      return cuisine ? false : null
    case 'vegetarian':
      // The venue's own name is real evidence here: "Nhà Hàng Chay …" states it.
      if (row.vegetarian === true || cuisine.includes('vegetarian') || /\bchay\b/.test(name)) return true
      return (row.vegetarian === undefined && !cuisine) ? null : false
    case 'vegan':
      if (row.vegan === true || cuisine.includes('vegan')) return true
      return (row.vegan === undefined && !cuisine) ? null : false
    case 'seafood':
      if (cuisine.includes('seafood') || /hai san/.test(name)) return true
      return cuisine ? false : null
    case 'hotpot':
      if (/hot_?pot/.test(cuisine) || /\blau\b/.test(name)) return true
      return cuisine ? false : null
    case 'cafe':
      return types.includes('cafe') || /\bcafe\b|ca phe|coffee/.test(name) ? true : null
    case 'bar':
      return types.includes('bar') || /\bbar\b|\bpub\b/.test(name) ? true : null
  }
}

/**
 * The honest note that travels with a result set which could not satisfy the
 * constraint, so the model states the limitation instead of inventing around it.
 */
export function unmetConstraintNote(constraints: FoodConstraint[], lang: string): string {
  const what = constraints.map(c => c.label).join(', ')
  return lang === 'vi'
    ? `Không tìm thấy địa điểm nào có dữ liệu xác nhận "${what}" trong khu vực này. Danh sách dưới đây là các địa điểm cùng khu vực nhưng CHƯA được xác nhận ${what} — hãy nói rõ điều đó với người dùng và tuyệt đối không khẳng định chúng là ${what}.`
    : `No venue with data confirming "${what}" was found in this area. The list below is nearby venues NOT confirmed as ${what} — say so explicitly and never assert that they are.`
}
