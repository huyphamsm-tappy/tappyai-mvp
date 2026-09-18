import { normalizeVN } from '@/lib/ai/intent'
import { VIETNAM_CITY_ENTRIES } from './vietnamCities'

/**
 * The place string that goes into a Serper `/maps` query.
 *
 * Serper answers `priceLevel` CONSISTENTLY only when the place part reads like a Google Maps
 * query. Measured 2026-09-17 on the audit environment — same `ll`, same venues, minutes apart:
 * "quán ăn ngon Quận 1 Ho Chi Minh" → 18/20 rows carried `priceLevel`; "quán ăn ngon Quận 1,
 * TP HCM" → 0/20. The model writes the `location` argument freely, so the CITY part is rewritten
 * to the canonical English name the city table already carries (without ", Vietnam"), the part
 * before it (a district, a ward) is kept as written, and commas go. Nothing else about the
 * request changes: same endpoint, same `ll`, same rows, same fields.
 *
 * Owner-approved 2026-09-17 ("location-string normalization for Serper so priceLevel is returned
 * consistently"). An unknown place is passed through as written (commas removed) — this never
 * invents a city.
 */

/** Longest alias first so "tp hcm" wins over "hcm" and "ho chi minh" over "hcm". */
const ALIASES: ReadonlyArray<readonly [string, string]> = VIETNAM_CITY_ENTRIES
  .map(([alias, city]) => [alias, city.query.replace(/,\s*Vietnam$/i, '')] as const)
  .sort((a, b) => b[0].length - a[0].length)

/** A whole-token match of the alias inside normalised text, with an optional "tp"/"tp." prefix. */
const aliasPattern = (alias: string) =>
  new RegExp(`(^|[^a-z0-9])(?:tp\\.?\\s*)?${alias.replace(/ /g, '\\s+')}(?=[^a-z0-9]|$)`, 'i')

export function normalizeSerperLocation(location: string | null | undefined): string {
  const raw = (location ?? '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  // Work on a diacritic-folded copy so the alias is found, but splice the canonical name into
  // the ORIGINAL string so the district keeps its own spelling ("Quận 1", "Sơn Trà").
  const folded = normalizeVN(raw).toLowerCase()
  for (const [alias, canonical] of ALIASES) {
    const m = aliasPattern(alias).exec(folded)
    if (!m) continue
    // `folded` and `raw` have the same length: normalizeVN only strips combining marks and
    // maps đ→d one-to-one, so the match offsets line up.
    const start = m.index + m[1].length
    let end = start + (m[0].length - m[1].length)
    // Already canonical ("Ho Chi Minh City" carries the alias "ho chi minh"): stable, no rewrite.
    const canonicalFolded = canonical.toLowerCase()
    if (folded.startsWith(canonicalFolded, start)) end = start + canonicalFolded.length
    if (folded.length !== raw.length) return raw.slice(0, start).trim() + ' ' + canonical
    return (raw.slice(0, start) + canonical + raw.slice(end)).replace(/\s+/g, ' ').trim()
  }
  return raw
}

/** `query + normalised location`, or the query alone when there is no location. */
export function serperMapsQuery(query: string, location: string | null | undefined): string {
  const loc = normalizeSerperLocation(location)
  return loc ? `${query} ${loc}` : query
}
