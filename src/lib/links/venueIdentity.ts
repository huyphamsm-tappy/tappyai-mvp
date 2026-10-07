// ── Venue identity for delivery-platform discovery (UAT 2026-09-28) ─────────────────────────
//
// MEASURED (live, audit replay): the food-delivery discovery query was the Google Maps name,
// exact-quoted, plus the whole locality —
//   "Cơm Niêu Chú Chen - Quận 1" Quận 1, TP. Hồ Chí Minh (site:food.grab.com/vn OR site:shopeefood.vn)
// — and returned 0 rows for every venue of the turn, so no card ever got a ShopeeFood/GrabFood
// button. The platforms title a page by the brand plus the BRANCH STREET
// ("Cơm Niêu Và Cháo Sườn Chú Chen - Nguyễn Trãi"), never by the Maps suffix " - Quận 1". The same
// venue, queried as its core name plus its street, unquoted, is found at rank 1.
//
// An unquoted query also returns OTHER venues (the index is fuzzy), so a hit is accepted only when
// its title carries every distinctive word of the venue's core name, and — when the title names a
// branch street — that street is the venue's own.

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const tokens = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(Boolean)

/** Words that name a KIND of venue, not this venue. */
const GENERIC = new Set(['quan', 'nha', 'hang', 'restaurant', 'the', 'va', 'and', 'tiem', 'shop', 'store', 'chi', 'nhanh', 'cn', 'co', 'so'])
/**
 * A trailing district the Maps name carries ("… Quận 1", "… Q.3"), or a city after a COMMA
 * ("Quán Bụi Central, Sài Gòn"). A city without a comma is part of the brand ("Cơm Ngon Hà Nội"):
 * stripping it made "Cơm Ngon" match "Cơm Ngon Siba" in Nghệ An (measured replay).
 */
const TRAILING_AREA = /(?:[\s,]+(?:qu[aậ]n\s*\d+|q\.?\s*\d+)|\s*,\s*(?:tp\.?\s*hcm|h[oồ]\s*ch[ií]\s*minh|s[aà]i\s*g[oò]n|h[aà]\s*n[oộ]i|[dđ][aà]\s*n[aẵ]ng))\s*$/iu

/** The venue's own name without the Maps branch / area suffix: "Cơm Niêu Chú Chen - Quận 1" → "Cơm Niêu Chú Chen". */
export function venueCoreName(name: string): string {
  let n = (name || '').split(/\s+[-–|]\s+|\s*\(/u)[0].trim()
  for (let i = 0; i < 2; i++) n = n.replace(TRAILING_AREA, '').trim()
  return n || (name || '').trim()
}

/** The street of a Vietnamese address: "283 Nguyễn Trãi, Quận 1, …" → "Nguyễn Trãi". */
export function streetOf(address: string | undefined): string | undefined {
  const first = (address || '').split(',')[0]?.trim() ?? ''
  const street = first
    .replace(/^(?:s[oố]\s*)?[\dA-Za-z]*\d[\dA-Za-z/\-]*\s+/u, '') // house number: 283, 32-34, 3bis, 1B, 12/4
    .replace(/^(?:đ\.|d\.|đường|duong)\s*/iu, '')
    .trim()
  return tokens(street).length >= 2 && !/\d/.test(street) ? street : undefined
}

const DELIVERY_WORDS = /(delivery|giao|online|food|mua|order|dat mon|thuong hieu)/

/**
 * Is a delivery-platform page (its title) THIS venue?
 *  · every distinctive word of the core name appears in the title, and
 *  · a branch the title names after " - " is the venue's own street (when the address is known).
 */
const CITY_SLUGS: Array<[RegExp, string]> = [[/ho chi minh|sai gon|tp hcm/, 'ho-chi-minh'], [/ha noi/, 'ha-noi'], [/da nang/, 'da-nang']]

export function venueTitleMatches(name: string, title: string | undefined, address?: string, url?: string): boolean {
  if (!title) return false
  // ShopeeFood files a venue under its city (`shopeefood.vn/<city>/<slug>`): another city is another venue.
  const slug = (url || '').match(/shopeefood\.vn\/([a-z-]+)\//)?.[1]
  const addr = fold(address || '').replace(/[^a-z0-9]+/g, ' ')
  const city = CITY_SLUGS.find(([re]) => re.test(addr))?.[1]
  if (slug && city && slug !== 'thuong-hieu' && slug !== city) return false
  const want = tokens(venueCoreName(name)).filter(t => !GENERIC.has(t))
  if (want.length === 0) return false
  const [, ...rest] = title.split(/\s+[-–|]\s+/u)
  // The whole title: a Maps name often carries the branch street as part of the name
  // ("Phở 24 Nguyễn Tri Phương"), which the platform writes after a dash ("Phở 24 - Nguyễn Tri Phương").
  const have = new Set(tokens(title))
  if (!want.every(t => have.has(t))) return false
  const branch = fold(rest.join(' '))
  const street = streetOf(address)
  if (branch && street && !DELIVERY_WORDS.test(branch) && !branch.includes(fold(street))) return false
  return true
}
