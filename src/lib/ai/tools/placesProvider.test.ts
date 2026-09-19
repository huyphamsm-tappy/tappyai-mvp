import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchPlaces, __resetPlacesBreaker } from './food'
import { __clearToolCache } from './common'
import { placesProvider, PLACES_PROVIDER_DEFAULT, __resetPlacesProviderWarning } from './placesProvider'

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER SELECTION NEVER DEPENDS ON A SECRET'S PRESENCE (release close-out B.1, 2026-09-19).
//
// Before: Google Places (New) ran whenever GOOGLE_PLACES_API_KEY existed, so adding or removing
// that one variable in Vercel silently switched the production pipeline — and every V3
// measurement was taken on Serper-first (the audit key 403s). Now PLACES_PROVIDER decides,
// defaults to serper, and a VALID Google key with PLACES_PROVIDER=serper makes no Google call.
// ─────────────────────────────────────────────────────────────────────────────

let googleCalls = 0
let serperMapsCalls = 0
let osmCalls = 0

const SERPER_MAPS = { places: [
  { title: 'Quán Serper A', address: '1 Lê Lợi, Quận 1, Hồ Chí Minh', latitude: 10.776, longitude: 106.701, rating: 4.6, ratingCount: 120, cid: '1' },
  { title: 'Quán Serper B', address: '2 Lê Lợi, Quận 1, Hồ Chí Minh', latitude: 10.777, longitude: 106.702, rating: 4.4, ratingCount: 80, cid: '2' },
] }
const GOOGLE_ROWS = { places: [
  { id: 'g1', displayName: { text: 'Quán Google A' }, formattedAddress: '1 Lê Lợi, Quận 1, Hồ Chí Minh', location: { latitude: 10.776, longitude: 106.701 }, rating: 4.7, userRatingCount: 300 },
  { id: 'g2', displayName: { text: 'Quán Google B' }, formattedAddress: '2 Lê Lợi, Quận 1, Hồ Chí Minh', location: { latitude: 10.777, longitude: 106.702 }, rating: 4.5, userRatingCount: 200 },
] }
const OSM_ROWS = { elements: [
  { type: 'node', lat: 10.776, lon: 106.701, tags: { name: 'Quán OSM A', 'addr:street': 'Lê Lợi' } },
  { type: 'node', lat: 10.777, lon: 106.702, tags: { name: 'Quán OSM B', 'addr:street': 'Lê Lợi' } },
] }

function stub() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('places.googleapis.com')) { googleCalls++; return new Response(JSON.stringify(GOOGLE_ROWS), { status: 200 }) }
    if (url.includes('google.serper.dev/maps')) { serperMapsCalls++; return new Response(JSON.stringify(SERPER_MAPS), { status: 200 }) }
    if (url.includes('overpass') || url.includes('maps.mail.ru')) { osmCalls++; return new Response(JSON.stringify(OSM_ROWS), { status: 200 }) }
    return new Response(JSON.stringify({ organic: [], images: [], places: [] }), { status: 200 })
  }))
}

const ORIGINAL = { key: process.env.GOOGLE_PLACES_API_KEY, serper: process.env.SERPER_API_KEY, provider: process.env.PLACES_PROVIDER }

beforeEach(() => {
  googleCalls = 0; serperMapsCalls = 0; osmCalls = 0
  __resetPlacesBreaker(); __clearToolCache(); __resetPlacesProviderWarning()
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-valid-not-a-real-secret'
  process.env.SERPER_API_KEY = 'test-serper-not-a-real-secret'
  delete process.env.PLACES_PROVIDER
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL.key === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = ORIGINAL.key
  if (ORIGINAL.serper === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = ORIGINAL.serper
  if (ORIGINAL.provider === undefined) delete process.env.PLACES_PROVIDER; else process.env.PLACES_PROVIDER = ORIGINAL.provider
})

describe('placesProvider — the setting', () => {
  it('defaults to serper (what V3 was measured on) when unset or blank', () => {
    expect(PLACES_PROVIDER_DEFAULT).toBe('serper')
    expect(placesProvider({})).toBe('serper')
    expect(placesProvider({ PLACES_PROVIDER: '  ' })).toBe('serper')
  })
  it('accepts serper | google | osm, case-insensitively', () => {
    expect(placesProvider({ PLACES_PROVIDER: 'google' })).toBe('google')
    expect(placesProvider({ PLACES_PROVIDER: 'OSM' })).toBe('osm')
    expect(placesProvider({ PLACES_PROVIDER: 'Serper' })).toBe('serper')
  })
  it('an unknown value is a logged config error and falls back to serper', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(placesProvider({ PLACES_PROVIDER: 'bing' })).toBe('serper')
      expect(err.mock.calls.some(c => String(c[0]).includes('tappyai_config_error'))).toBe(true)
    } finally { err.mockRestore() }
  })
})

describe('🚨 a valid Google key with PLACES_PROVIDER=serper makes NO Google call', () => {
  it('default (unset): Serper /maps answers, Google is never called', async () => {
    const r = await searchPlaces('quán ăn ngon', 'Quận 1', 'restaurant', 'vi', { lat: 10.7769, lng: 106.7009 }) as { source?: string; results?: unknown[] }
    expect(googleCalls).toBe(0)
    expect(serperMapsCalls).toBeGreaterThan(0)
    expect(r.results?.length).toBeGreaterThan(0)
  })
  it('PLACES_PROVIDER=serper explicitly: same', async () => {
    process.env.PLACES_PROVIDER = 'serper'
    await searchPlaces('quán ăn ngon', 'Quận 1', 'restaurant', 'vi', { lat: 10.7769, lng: 106.7009 })
    expect(googleCalls).toBe(0)
    expect(serperMapsCalls).toBeGreaterThan(0)
  })
  it('PLACES_PROVIDER=google: Google is called first and answers (the pre-2026-09-19 chain)', async () => {
    process.env.PLACES_PROVIDER = 'google'
    const r = await searchPlaces('quán ăn ngon', 'Quận 1', 'restaurant', 'vi', { lat: 10.7769, lng: 106.7009 }) as { source?: string }
    expect(googleCalls).toBe(1)
    expect(r.source).toBe('Google Maps')
  })
  it('PLACES_PROVIDER=osm: neither Google nor Serper /maps; OSM answers', async () => {
    process.env.PLACES_PROVIDER = 'osm'
    const r = await searchPlaces('quán ăn ngon', 'Quận 1', 'restaurant', 'vi', { lat: 10.7769, lng: 106.7009 }) as { source?: string }
    expect(googleCalls).toBe(0)
    expect(serperMapsCalls).toBe(0)
    expect(osmCalls).toBeGreaterThan(0)
    expect(r.source).toBe('OpenStreetMap')
  })
  it('removing the Google key under the default changes nothing (the key is not the switch)', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY
    const r = await searchPlaces('quán ăn ngon', 'Quận 1', 'restaurant', 'vi', { lat: 10.7769, lng: 106.7009 }) as { results?: unknown[] }
    expect(googleCalls).toBe(0)
    expect(serperMapsCalls).toBeGreaterThan(0)
    expect(r.results?.length).toBeGreaterThan(0)
  })
})
