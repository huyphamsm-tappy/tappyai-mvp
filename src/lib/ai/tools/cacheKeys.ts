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

/** Cities whose weather resolves to one canonical wttr.in place. Mirrors the
 *  lookup getWeather performs, so the key matches the upstream call. */
const WEATHER_CITY_MAP: Record<string, string> = {
  'ha noi': 'Hanoi', 'hanoi': 'Hanoi', 'hn': 'Hanoi',
  'ho chi minh': 'Ho Chi Minh City', 'tp hcm': 'Ho Chi Minh City', 'hcm': 'Ho Chi Minh City',
  'sai gon': 'Ho Chi Minh City', 'saigon': 'Ho Chi Minh City', 'tphcm': 'Ho Chi Minh City',
  'da nang': 'Da Nang', 'danang': 'Da Nang',
  'hue': 'Hue', 'can tho': 'Can Tho', 'hai phong': 'Hai Phong',
  'nha trang': 'Nha Trang', 'da lat': 'Da Lat', 'dalat': 'Da Lat',
  'vung tau': 'Vung Tau', 'hoi an': 'Hoi An', 'phu quoc': 'Phu Quoc',
}

/** The place getWeather will actually query wttr.in for. Exported so the cache
 *  key and the fetch cannot drift apart. */
export function resolveWeatherPlace(location: string | null | undefined): string {
  const raw = (location ?? '').trim()
  const norm = normalizeVN(raw.toLowerCase())
  return WEATHER_CITY_MAP[norm] || raw || 'Hanoi'
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
