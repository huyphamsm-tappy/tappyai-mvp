import { normalizeVN } from '@/lib/ai/intent'

// ── Tool cache keys ──────────────────────────────────────────────────────────
//
// One place for every key, so the normalization rules are visible together and
// testable without a network call.
//
// Two rules govern every key here:
//   same semantic request  -> same key      (or one answer is paid for twice)
//   different request      -> different key (or a user gets someone else's answer)
//
// Deliberately NOT normalized: Vietnamese diacritics. "quán ăn" and "quan an"
// look interchangeable, but the query is handed VERBATIM to Google Places as
// textQuery, so they are genuinely different upstream calls — and stripping tone
// marks merges distinct words (mắt / mất / mát -> mat). That would be a
// correctness bug dressed up as a cache win. Diacritics ARE folded in the one
// place where the code itself already canonicalizes: the weather city map.

/**
 * Normalizes a key component: Unicode NFC, lowercase, whitespace runs collapsed,
 * trimmed. Every transform here is loss-free with respect to meaning — the same
 * text always keys the same way, and different text never collides.
 *
 * NFC matters because "ế" can arrive precomposed (U+1EBF) or decomposed
 * (e + U+0302 + U+0301). Identical to the user, different bytes, two cache
 * entries for one answer.
 */
export function cacheKeyPart(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** The country every city in WEATHER_CITY_MAP must resolve to, spelled as wttr.in spells it. */
export const VIETNAM = 'Vietnam' as const

/**
 * Cities whose weather resolves to one canonical wttr.in place.
 *
 * 🚨 EVERY VALUE IS COUNTRY-QUALIFIED. That is the point of this table, not a style choice.
 * The provider geocodes whatever string we hand it, and a bare ASCII Vietnamese city name is
 * not unique on Earth — measured against wttr.in on 2026-08-22:
 *
 *     "Da Nang"  ->  Karlsruhe, GERMANY   12°C   (Da Nang was 35°C)
 *     "Hue"      ->  Ipartelep, HUNGARY   17°C
 *     "Ha Long"  ->  Nyane, LESOTHO        6°C
 *
 * The cruel part is that the diacritic form resolves correctly on its own: "Đà Nẵng" returns
 * Da Nang, Vietnam. `normalizeVN` strips the tone marks, this map handed back bare "Da Nang",
 * and the answer came from Germany — so the lookup meant to make the query unambiguous was the
 * thing making it ambiguous. A user asking in Vietnamese was told, in Vietnamese, that Đà Nẵng
 * was 12°C. Nothing errored; the number was simply another continent's.
 *
 * 🔑 Adding a city here WITHOUT ", Vietnam" reintroduces that bug. `weatherPlaceResolution.test.ts`
 * therefore asserts the qualifier on every entry, not on a remembered list of the three that
 * happened to be caught.
 *
 * Free-form locations are deliberately NOT in this table and are passed through untouched, so
 * "Paris", "Tokyo" and "Bangkok" keep resolving to Paris, Tokyo and Bangkok. Qualifying every
 * location with ", Vietnam" would fix these three cities by breaking every other country.
 */
const WEATHER_CITY_MAP: Record<string, string> = {
  // "Ha Noi, Vietnam" rather than "Hanoi": the provider answers the former with Hanoi itself and
  // the latter with Hao Nam, a ward inside it.
  'ha noi': 'Ha Noi, Vietnam', 'hanoi': 'Ha Noi, Vietnam', 'hn': 'Ha Noi, Vietnam',
  'ho chi minh': 'Ho Chi Minh City, Vietnam', 'tp hcm': 'Ho Chi Minh City, Vietnam',
  'hcm': 'Ho Chi Minh City, Vietnam', 'sai gon': 'Ho Chi Minh City, Vietnam',
  'saigon': 'Ho Chi Minh City, Vietnam', 'tphcm': 'Ho Chi Minh City, Vietnam',
  'da nang': 'Da Nang, Vietnam', 'danang': 'Da Nang, Vietnam',
  // The province, not the city: ", Vietnam" got the country right and the province wrong.
  // "Hue, Vietnam" resolves to Ban Hong, 364 km south in the Lâm Đồng highlands — 26°C on a day
  // Huế was 35°C. "Thua Thien Hue, Vietnam" resolves to Kim Long, a ward of Huế itself, 1 km out.
  // ("Hue City, Vietnam" is worse still at 534 km; the provider is not reasoning about these
  // strings, it is matching them.)
  'hue': 'Thua Thien Hue, Vietnam',
  // Ha Long was absent entirely, so it fell through to the pass-through branch as bare
  // "Ha Long" — which is a place in Lesotho. Present here for the same reason as the rest.
  //
  // Named by its central ward rather than the city: "Ha Long, Vietnam" lands on Gia Mien Noi,
  // 163 km away, while "Hong Gai, Vietnam" is Hạ Long's own centre, 0 km out. Hạ Long with its
  // diacritics also resolves correctly, but every other value here is ASCII and one accented
  // entry would invite the next one to be added without measuring.
  'ha long': 'Hong Gai, Vietnam', 'halong': 'Hong Gai, Vietnam',
  'can tho': 'Can Tho, Vietnam', 'hai phong': 'Hai Phong, Vietnam',
  'nha trang': 'Nha Trang, Vietnam', 'da lat': 'Da Lat, Vietnam', 'dalat': 'Da Lat, Vietnam',
  'vung tau': 'Vung Tau, Vietnam', 'hoi an': 'Hoi An, Vietnam', 'phu quoc': 'Phu Quoc, Vietnam',
}

/** Read-only view of the city table, for tests and for callers that need the same values. */
export const WEATHER_CITY_ENTRIES: ReadonlyArray<readonly [string, string]> =
  Object.entries(WEATHER_CITY_MAP)

/** What getWeather will ask the provider, and what it is entitled to expect back. */
export type WeatherPlace = {
  /** The exact string sent upstream. */
  query: string
  /**
   * The country the provider MUST answer with, or `null` when we have no basis to expect one.
   *
   * Non-null only for the cities in the table above, because those are the only places where we
   * know the answer with certainty. A free-form location could legitimately be in any country,
   * and inventing an expectation for it would reject correct results.
   */
  expectedCountry: string | null
}

/**
 * The place getWeather will actually query, together with the country that answer must come from.
 *
 * Exported so the cache key, the fetch and the verification cannot drift apart — the previous
 * split (key derived here, fetch performed there) is what let a wrong value ship unnoticed.
 */
export function weatherPlaceResolution(location: string | null | undefined): WeatherPlace {
  const raw = (location ?? '').trim()
  const mapped = WEATHER_CITY_MAP[normalizeVN(raw.toLowerCase())]
  if (mapped) return { query: mapped, expectedCountry: VIETNAM }
  // No location at all keeps the historical default, and that default is a known city, so it
  // carries the same expectation as any other entry in the table.
  if (!raw) return { query: WEATHER_CITY_MAP['ha noi'], expectedCountry: VIETNAM }
  return { query: raw, expectedCountry: null }
}

/** The place getWeather will actually query wttr.in for. Exported so the cache
 *  key and the fetch cannot drift apart. */
export function resolveWeatherPlace(location: string | null | undefined): string {
  return weatherPlaceResolution(location).query
}

/** Longest first, so "tp hcm" wins over "hcm" and a specific alias is never shadowed. */
const WEATHER_CITY_ALIASES: readonly string[] =
  Object.keys(WEATHER_CITY_MAP).sort((a, b) => b.length - a.length)

/**
 * Finds a known city inside a free-text location string.
 *
 * The stored location on a profile is whatever the user typed — "Quận 1, Hồ Chí Minh",
 * "sống ở Đà Nẵng" — so an exact lookup misses almost all of them. Diacritics are folded first,
 * which is why the alias list itself needs no accented duplicates: "Đà Nẵng" and "da nang" both
 * normalize onto the same key.
 *
 * 🔑 Lives here rather than at the call site so there is ONE list of cities. The morning-brief
 * cron kept its own copy, and that copy carried the same bare-ASCII defect as the map above —
 * two places to fix meant one of them stayed broken.
 *
 * Returns the matched alias (feed it to `resolveWeatherPlace`), or null when nothing matches.
 * Null means "we do not know this place", which a caller should treat as no answer rather than
 * guessing a default city at the user.
 */
export function matchWeatherCityInText(text: string | null | undefined): string | null {
  const hay = normalizeVN((text ?? '').toLowerCase())
  if (!hay) return null
  return WEATHER_CITY_ALIASES.find((alias) => hay.includes(alias)) ?? null
}

/** Keyed on the RESOLVED city: "Hà Nội", "ha noi" and "HN" are one upstream
 *  call, so they must be one entry. They used to be three. */
export function weatherCacheKey(location: string | null | undefined, lang: string): string {
  return `weather:${cacheKeyPart(resolveWeatherPlace(location))}:${lang}`
}

/** getGoldPrice fetches one fixed URL and filters a fixed code list — `query` is
 *  never read, so it must not be in the key. Including it split a single answer
 *  across every phrasing ("giá vàng", "vàng SJC", "SJC", ""). */
export function goldCacheKey(lang: string): string {
  return `gold:${lang}`
}

/** GPS is rounded to 2 decimal places (~1.1 km) — unchanged from before, so
 *  location precision in the key is exactly what it always was. */
export function placesCacheKey(
  query: string,
  location: string | undefined,
  type: string | undefined,
  locationBias: { lat: number; lng: number } | null | undefined,
  lang: string,
): string {
  const bias = locationBias ? `:${locationBias.lat.toFixed(2)},${locationBias.lng.toFixed(2)}` : ''
  return `places:${cacheKeyPart(query)}:${cacheKeyPart(location)}:${type || ''}${bias}:${lang}`
}

export function newsCacheKey(query: string, lang: string): string {
  return `news:${cacheKeyPart(query)}:${lang}`
}

export function webSearchCacheKey(query: string, lang: string): string {
  return `websearch:${cacheKeyPart(query)}:${lang}`
}

export function productsCacheKey(query: string, lang: string): string {
  return `products:${cacheKeyPart(query)}:${lang}`
}

export function flightsCacheKey(origin: string, destination: string, lang: string): string {
  return `flights:${cacheKeyPart(origin)}:${cacheKeyPart(destination)}:${lang}`
}

export function hotelsCacheKey(
  location: string,
  checkIn: string | undefined,
  checkOut: string | undefined,
  maxBudgetVnd: number | undefined,
  lang: string,
): string {
  return `hotels:${cacheKeyPart(location)}:${checkIn || ''}:${checkOut || ''}:${maxBudgetVnd || ''}:${lang}`
}

export function transportCacheKey(
  origin: string,
  destination: string,
  mode: string | undefined,
  lang: string,
): string {
  return `transport:${cacheKeyPart(origin)}:${cacheKeyPart(destination)}:${mode || 'auto'}:${lang}`
}
