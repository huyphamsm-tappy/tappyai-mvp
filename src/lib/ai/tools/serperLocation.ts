import { normalizeVN } from '@/lib/ai/intent'
import { VIETNAM_CITY_ENTRIES } from './vietnamCities'

/**
 * The place string that goes into a Serper `/maps` query.
 *
 * The model writes the `location` argument freely ("Quận 1, TP HCM", "Q.1 TP.HCM", "Quận 1, Hồ Chí
 * Minh"). The CITY part is rewritten to the canonical English name the city table already carries
 * (without ", Vietnam"), the part before it (a district, a ward) is kept as written, and commas
 * go — one stable, Maps-shaped string per (query, city), which also makes the 30-minute place
 * cache hit across the model's spellings. Nothing else about the request changes: same endpoint,
 * same `ll`, same rows, same fields.
 *
 * 🚨 This was first thought to be why `priceLevel` came back for one spelling and not another
 * (2026-09-17: "Quận 1 Ho Chi Minh" 18/20, "Quận 1, TP HCM" 0/20). Re-measured 2026-09-18 with
 * the IDENTICAL string: the answer alternates 19/20 → 0/20 → 19/20, seconds apart — the bands are
 * non-deterministic upstream regardless of spelling. The consistency fix is therefore the single
 * retry in `serperPlaces` (an answer with no band on any row is asked once more); this file only
 * keeps the query canonical.
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

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

/**
 * `query + normalised location`, or the query alone when there is no location.
 *
 * Phase 7 (2026-09-22, golden G1b): the model's query already ended in the area ("rạp chiếu phim
 * gần Quận 7") and the location repeated it, so Maps read "rạp chiếu phim gần Quận 7 Quận 7 Ho Chi
 * Minh City" and answered with LOTTE Mart, Co.opmart and a karaoke shop. A trailing "gần / ở /
 * tại / quanh / khu vực <area>" whose area the location already names is dropped — the location
 * carries it once, in the form `/maps` answers best.
 */
export function serperMapsQuery(query: string, location: string | null | undefined): string {
  const loc = normalizeSerperLocation(location)
  if (!loc) return query
  const m = query.match(/^(.*?)\s+(?:gần|gan|ở|o|tại|tai|quanh|khu vực|khu vuc)\s+(.+)$/i)
  if (m && m[1].trim() && fold(`${location ?? ''} ${loc}`).includes(fold(m[2].trim()))) return `${m[1].trim()} ${loc}`
  return `${query} ${loc}`
}
