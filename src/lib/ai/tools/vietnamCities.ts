import { normalizeVN } from '@/lib/ai/intent'

/**
 * The one table of Vietnamese cities: what to ask a provider for, and where the place actually is.
 *
 * ============================================================================
 * WHY THE QUERY AND THE COORDINATES LIVE TOGETHER
 * ============================================================================
 * They were separate, and both halves of F01 came out of that gap.
 *
 * `WEATHER_CITY_MAP` (cacheKeys.ts) knew the outgoing string. `TRANSPORT_CITY_COORDS` (travel.ts)
 * knew where the same cities were. Nothing could compare them, so nothing at runtime noticed when
 * "Hue, Vietnam" — correctly country-qualified — answered with a place 364 km inland. The
 * information needed to catch it was already in the repository, in a file the weather tool never
 * imported.
 *
 * ============================================================================
 * THE QUERY STRINGS ARE MEASURED, NOT COMPOSED
 * ============================================================================
 * 🚨 Every `query` was checked against the real provider. They are not a pattern applied by hand —
 * three had to be spelled differently from the obvious form before the geocoder found the place:
 *
 *     "Da Nang"                  -> Karlsruhe, GERMANY      (12°C; Da Nang was 35°C)
 *     "Hue, Vietnam"             -> Ban Hong, Vietnam       364 km, 26°C vs 35°C
 *     "Hue City, Vietnam"        -> Quinh Loi, Vietnam      534 km  ← the obvious "improvement"
 *     "Ha Long, Vietnam"         -> Gia Mien Noi, Vietnam   165 km
 *     "Thua Thien Hue, Vietnam"  -> Kim Long, Vietnam       ~1 km   ✅
 *     "Hong Gai, Vietnam"        -> Hong Gai, Vietnam       ~3 km   ✅
 *
 * 🔑 Adding a city without measuring it is how this returns. The country suffix is necessary and
 * NOT sufficient — Hue and Ha Long both carried it and both were wrong.
 *
 * ============================================================================
 * COORDINATES
 * ============================================================================
 * From OpenStreetMap Nominatim, the geocoder this codebase already calls (travel.ts, food.ts), so
 * the numbers have a source rather than an author. They agreed with the pre-existing transport
 * table to within 0.5 km for Huế and 2.7 km for Đà Nẵng, which is what made merging the two tables
 * safe rather than a rewrite.
 *
 * 🔑 The coordinate is the city the USER MEANT, never wherever the provider happened to land.
 * Moving it to match the answer would turn every check below into a tautology.
 */
export type VietnamCity = {
  /** Exactly what a geocoding provider is asked for. Measured, never composed. */
  readonly query: string
  /** Where the city actually is, for validating what comes back. */
  readonly coords: readonly [number, number]
}

/**
 * Alias → city. Aliases are the diacritic-folded, lower-cased forms `normalizeVN` produces, so
 * "Đà Nẵng", "da nang" and "DANANG" all arrive here as the same key.
 */
const CITIES: Record<string, VietnamCity> = (() => {
  const c = (query: string, lat: number, lon: number): VietnamCity => ({ query, coords: [lat, lon] })

  const haNoi = c('Ha Noi, Vietnam', 21.0285, 105.8542)
  const hcmc = c('Ho Chi Minh City, Vietnam', 10.7769, 106.7009)
  const daNang = c('Da Nang, Vietnam', 16.0544, 108.2022)
  // The province, not the city — see the header. Kept exactly as production spells it.
  const hue = c('Thua Thien Hue, Vietnam', 16.4639, 107.5863)
  // Hạ Long named by its central ward, for the same reason.
  const haLong = c('Hong Gai, Vietnam', 20.9454, 107.1073)
  const canTho = c('Can Tho, Vietnam', 10.0452, 105.7469)
  const haiPhong = c('Hai Phong, Vietnam', 20.8449, 106.6881)
  const nhaTrang = c('Nha Trang, Vietnam', 12.2388, 109.1967)
  const daLat = c('Da Lat, Vietnam', 11.9404, 108.4583)
  const vungTau = c('Vung Tau, Vietnam', 10.3460, 107.0843)
  const hoiAn = c('Hoi An, Vietnam', 15.8801, 108.3380)
  const phuQuoc = c('Phu Quoc, Vietnam', 10.2270, 103.9648)
  // Present in travel.ts's coordinate table but never in the weather map. Folding the two tables
  // together is what brings them in; each was measured before being kept.
  const quyNhon = c('Quy Nhon, Vietnam', 13.7820, 109.2192)
  const saPa = c('Sa Pa, Vietnam', 22.3364, 103.8438)
  const ninhBinh = c('Ninh Binh, Vietnam', 20.2506, 105.9745)

  return {
    'ha noi': haNoi, 'hanoi': haNoi, 'hn': haNoi,
    'ho chi minh': hcmc, 'hcm': hcmc, 'saigon': hcmc, 'sai gon': hcmc, 'tp hcm': hcmc, 'tphcm': hcmc,
    'da nang': daNang, 'danang': daNang,
    'hue': hue,
    // 🔑 "hong gai" is an alias, not decoration. Hạ Long's canonical query names its central ward
    // rather than the city, so unlike every other entry the query does NOT contain its own city
    // name — and resolution stops round-tripping: the morning-brief cron looks the city up, hands
    // `getWeather` the canonical query, and that query resolves to nothing, arriving as a
    // free-form location with no country and no coordinates to check. Right query, guard silently
    // absent, on the push path only. Listing the ward closes it, and it also means a user who
    // types "Hồng Gai" gets Hạ Long instead of a pass-through.
    'ha long': haLong, 'halong': haLong, 'hong gai': haLong,
    'can tho': canTho, 'hai phong': haiPhong, 'nha trang': nhaTrang,
    'da lat': daLat, 'dalat': daLat, 'vung tau': vungTau,
    'hoi an': hoiAn, 'phu quoc': phuQuoc, 'quy nhon': quyNhon,
    'sa pa': saPa, 'sapa': saPa, 'ninh binh': ninhBinh,
  }
})()

/** Every alias → city pair, for tests and for callers that need to iterate. */
export const VIETNAM_CITY_ENTRIES: ReadonlyArray<readonly [string, VietnamCity]> = Object.entries(CITIES)

/** The distinct cities, deduplicated across their aliases. */
export const VIETNAM_CITIES: readonly VietnamCity[] = [...new Set(Object.values(CITIES))]

/** Exact lookup on an already-normalized alias. */
export function cityForAlias(alias: string): VietnamCity | null {
  return CITIES[alias] ?? null
}

/**
 * Exact lookup that normalizes first: "Đà Nẵng", "da nang", "DANANG" all find the same city.
 *
 * Deliberately exact. Phrase matching lives in `cityInText`, and `weatherPlaceResolution` tries
 * this first and that second — which is also what makes resolution idempotent, since every
 * canonical query contains its own city as a whole token.
 */
export function cityForName(name: string | null | undefined): VietnamCity | null {
  const raw = (name ?? '').trim()
  if (!raw) return null
  return CITIES[normalizeVN(raw.toLowerCase())] ?? null
}

/** Longest alias first, so "tp hcm" is never shadowed by "hcm". */
const ALIASES_BY_LENGTH: readonly string[] = Object.keys(CITIES).sort((a, b) => b.length - a.length)

/** Whole-token match for an alias inside normalized text. */
const aliasPattern = (alias: string) =>
  new RegExp(`(^|[^a-z0-9])${alias.replace(/ /g, '\\s+')}([^a-z0-9]|$)`)

/**
 * Finds a known city inside free text.
 *
 * Stored locations and typed queries are whatever a user wrote — "Quận 1, Hồ Chí Minh",
 * "sống ở Đà Nẵng", "TP Hồ Chí Minh" — so an exact lookup misses nearly all of them.
 *
 * 🚨 Whole tokens, not `includes`. Two aliases are two and three letters — "hn" and "hcm" — and a
 * bare substring test matches "hn" inside "johnson" and would hand back Hanoi's weather for a
 * surname. The boundary is what makes short aliases safe to keep.
 *
 * Returns null when nothing matches. Null means "we do not know this place", and a caller must
 * treat that as no answer rather than guessing a default city at the user.
 */
export function cityInText(text: string | null | undefined): VietnamCity | null {
  const hay = normalizeVN((text ?? '').toLowerCase())
  if (!hay) return null
  const alias = ALIASES_BY_LENGTH.find((a) => aliasPattern(a).test(hay))
  return alias ? CITIES[alias] : null
}

/**
 * Great-circle distance in kilometres.
 *
 * Moved here from travel.ts so the coordinates and the one operation performed on them live
 * together; travel.ts and the live provider matrix both import it rather than keeping copies.
 * There were three implementations of this function in the repository before this file existed.
 */
export function haversineKm(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * How far the provider's answer may be from the city before it is a different place.
 *
 * ============================================================================
 * MEASURED, NOT CHOSEN
 * ============================================================================
 * Every mapped city was queried against the real provider and the returned coordinates compared
 * with the canonical ones above. The distribution has no middle:
 *
 *   correct answers   0.3  0.7  1.2  1.4  1.5  1.9  1.9  2.3  2.5  2.9  3.6  4.2   km
 *   wrong answers                                              165.4      364.3   km
 *
 * 🔑 A second, independent measurement (the matrix test that shipped with the country fix) put the
 * correct spread at 0–9 km using slightly different canonical coordinates and a different day's
 * stations. 25 km clears BOTH: 6× the worst answer measured here, ~2.8× the worst measured there,
 * and still 6.6× below the nearest wrong answer.
 *
 * That earlier test chose 50 km. Both numbers reject 165 km and 364 km, so neither is wrong — but
 * they fail in opposite directions. 25 km errs toward refusing a legitimate far-flung station,
 * which surfaces as "weather unavailable"; 50 km errs toward accepting a place up to 50 km away,
 * which surfaces as a confident wrong number. This whole defect class is the second kind, so the
 * tighter bound is the safer one, and 25 km is still wider than any Vietnamese city.
 */
export const CITY_MATCH_RADIUS_KM = 25

/** Is this provider answer the city that was asked for? */
export function isSameCity(
  expected: readonly [number, number],
  actual: readonly [number, number],
): boolean {
  return haversineKm(expected, actual) <= CITY_MATCH_RADIUS_KM
}
