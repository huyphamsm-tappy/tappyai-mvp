import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchPlaces, __resetPlacesBreaker } from './food'
import { placesCacheKey } from './cacheKeys'
import { getCache } from './common'

/**
 * What a failed Google call is allowed to leave behind: nothing.
 *
 * Before this, every answer was cached for thirty minutes — including the OpenStreetMap fallback
 * that ran when Google failed. One 403 therefore pinned a query to fallback data for half an hour,
 * so the first request AFTER quota recovered still did not reach Google. With a 100/day quota and
 * a daily reset, that is exactly the window where recovery matters most.
 *
 * Every upstream is stubbed. Proving cache behaviour against the real provider would spend the
 * quota this layer exists to protect.
 */

const QUERY = 'quan bun bo ngon'
const LOCATION = 'TP HCM'
const LANG = 'vi'
const key = placesCacheKey(QUERY, LOCATION, 'restaurant', null, LANG)

/** Counts Google attempts; every other upstream (Overpass, Nominatim, Serper) answers emptily. */
function stubFetch(googleStatus: number | 'timeout') {
  const googleCalls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: unknown) => {
    const u = String(url)
    if (u.includes('places.googleapis.com')) {
      googleCalls.push(u)
      if (googleStatus === 'timeout') await new Promise(r => setTimeout(r, 10_000))
      return new Response(JSON.stringify({ error: { message: 'nope' } }), { status: googleStatus as number })
    }
    void init
    // Overpass / Nominatim / Serper: valid, empty, so the fallback produces no places.
    return new Response(JSON.stringify({ elements: [], results: [] }), { status: 200 })
  }))
  return googleCalls
}

describe('a failed Google call is never cached as a successful answer', () => {
  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-real'
    process.env.PLACES_PROVIDER = 'google' // the Google path runs only under this setting (2026-09-19)
    // Test ISOLATION, not the contract: the availability breaker is module state, so a 403 armed
    // by one case here would otherwise decide the next case's outcome. The immediate-retry test
    // below does not depend on this — it passes on production behaviour alone, with the breaker
    // left exactly as the first 429 leaves it.
    __resetPlacesBreaker()
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); delete process.env.PLACES_PROVIDER })

  it('429 quota exhaustion leaves no cache entry, and the next call retries Google', async () => {
    const calls = stubFetch(429)
    await searchPlaces(QUERY, LOCATION, 'restaurant', LANG, null)
    expect(getCache(key)).toBeNull()

    // The whole point: once quota resets, the very next request must reach Google.
    await searchPlaces(QUERY, LOCATION, 'restaurant', LANG, null)
    expect(calls.length).toBe(2)
  })

  it('403 permission denied leaves no cache entry', async () => {
    stubFetch(403)
    await searchPlaces(QUERY + ' 403', LOCATION, 'restaurant', LANG, null)
    expect(getCache(placesCacheKey(QUERY + ' 403', LOCATION, 'restaurant', null, LANG))).toBeNull()
  })

  it('a 5xx leaves no cache entry', async () => {
    stubFetch(503)
    await searchPlaces(QUERY + ' 503', LOCATION, 'restaurant', LANG, null)
    expect(getCache(placesCacheKey(QUERY + ' 503', LOCATION, 'restaurant', null, LANG))).toBeNull()
  })

  it('chat is never killed by a Places failure — a result object still comes back', async () => {
    stubFetch(429)
    const r = await searchPlaces(QUERY + ' alive', LOCATION, 'restaurant', LANG, null)
    // No throw, and a shape the caller can render prose around.
    expect(r).toBeTruthy()
    expect(typeof r).toBe('object')
  })

  it('a Google success IS cached', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      if (String(url).includes('places.googleapis.com')) {
        return new Response(JSON.stringify({
          places: [{ id: 'p1', displayName: { text: 'Bún Bò Huế O Châu' }, formattedAddress: '22 Cao Bá Nhạ, Quận 1, TP HCM', rating: 4.6, userRatingCount: 210 }],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ elements: [], results: [] }), { status: 200 })
    }))
    const k = placesCacheKey(QUERY + ' ok', 'Quận 1', 'restaurant', null, LANG)
    await searchPlaces(QUERY + ' ok', 'Quận 1', 'restaurant', LANG, null)
    const cached = getCache(k) as { source?: string } | null
    expect(cached).not.toBeNull()
    expect(cached?.source).toBe('Google Maps')
  })
})
