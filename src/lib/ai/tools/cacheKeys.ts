import {
  VIETNAM_CITY_ENTRIES,
  cityForAlias,
  cityForName,
  cityInText,
} from '@/lib/ai/tools/vietnamCities'

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

/** The country every mapped city must resolve to, spelled as wttr.in spells it. */
export const VIETNAM = 'Vietnam' as const

/**
 * The city table itself now lives in `vietnamCities.ts`, together with each city's coordinates.
 *
 * 🔑 They were separate — the query here, the coordinates in travel.ts — and that gap is the whole
 * of F01's second half. A country-qualified query ("Hue, Vietnam") can still resolve 364 km away,
 * and nothing on this side of the split knew where Huế was, so nothing could tell. Merging them
 * is what lets `getWeather` check the answer rather than only the country of the answer.
 *
 * Free-form locations are deliberately NOT in that table and pass through untouched, so "Paris",
 * "Tokyo" and "Bangkok" keep resolving to Paris, Tokyo and Bangkok. Qualifying every location
 * with ", Vietnam" would fix a few Vietnamese cities by breaking every other country.
 */

/** Read-only view of the city table, for tests and for callers that need the same values. */
export const WEATHER_CITY_ENTRIES: ReadonlyArray<readonly [string, string]> =
  VIETNAM_CITY_ENTRIES.map(([alias, city]) => [alias, city.query] as const)

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
  /**
   * Where the requested city actually is, or `null` for a free-form location.
   *
   * 🚨 The country was never enough. "Hue, Vietnam" returned Ban Hong — right country, 364 km
   * away, 26°C for a city that was 35°C — and a country check waves that through. This is the
   * field that lets getWeather tell "a station across the city" from "a different province".
   */
  expectedCoords: readonly [number, number] | null
}

/**
 * The place getWeather will actually query, together with the country that answer must come from.
 *
 * Exported so the cache key, the fetch and the verification cannot drift apart — the previous
 * split (key derived here, fetch performed there) is what let a wrong value ship unnoticed.
 */
export function weatherPlaceResolution(location: string | null | undefined): WeatherPlace {
  const raw = (location ?? '').trim()
  // No location at all keeps the historical default, and that default is a known city, so it
  // carries the same expectations as any other entry in the table.
  //
  // 🚨 The exact lookup is not enough on its own. The model sends what the user wrote, and
  // "TP Hồ Chí Minh" is not an alias — it normalizes to "tp ho chi minh" while the table holds
  // "tp hcm" and "ho chi minh". The live matrix caught it: the query went upstream unmapped, so
  // it landed 0.7 km from the city by luck while carrying NO country and NO coordinates to check
  // against. Right answer, no guard. `cityInText` matches whole tokens, so a longer phrase
  // containing a city still finds it.
  const city = raw ? (cityForName(raw) ?? cityInText(raw)) : cityForAlias('ha noi')
  if (city) return { query: city.query, expectedCountry: VIETNAM, expectedCoords: city.coords }
  return { query: raw, expectedCountry: null, expectedCoords: null }
}

/** The place getWeather will actually query wttr.in for. Exported so the cache
 *  key and the fetch cannot drift apart. */
export function resolveWeatherPlace(location: string | null | undefined): string {
  return weatherPlaceResolution(location).query
}

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
 * Returns the city's canonical query (feed it straight to `getWeather`), or null when nothing
 * matches. Null means "we do not know this place", which a caller should treat as no answer
 * rather than guessing a default city at the user.
 */
export function matchWeatherCityInText(text: string | null | undefined): string | null {
  return cityInText(text)?.query ?? null
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
