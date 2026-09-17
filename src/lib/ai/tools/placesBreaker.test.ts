import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchPlaces, googlePlacesLikelyAvailable, __resetPlacesBreaker } from './food'
import { __clearToolCache } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE PLACES IS UNAVAILABLE ON THIS PROJECT, AND THE PRODUCT MUST NOT CARE.
//
// Verified 2026-09-08: legacy Places still answers "You must enable Billing on
// the Google Cloud Project" (Maps Platform onboarding incomplete), and the New
// API's SearchTextRequest carries an effective limit of 100/day against Google's
// own 75,000 default — currently exhausted, so it answers 429.
//
// These tests hold two lines at once:
//   · a refusal we have already had is not bought again, and
//   · nothing about the answer changes when Google is skipped.
//
// 🔄 …WITHOUT EVER COSTING US THE RECOVERY CALL. A 429 is a spent ALLOWANCE, and
// Google resets it on its own clock; the request right after that reset is the
// one that matters most. So the first 429 records the refusal and nothing more —
// the very next call still reaches Google — and only a SECOND consecutive 429
// arms the breaker. A 403 is a project CONFIGURATION state that cannot change
// inside the window, so it still arms on the first refusal. See food.ts.
// ─────────────────────────────────────────────────────────────────────────────

let googleCalls = 0
let osmCalls = 0

const OSM_ROWS = {
  elements: [
    { type: 'node', lat: 21.02, lon: 105.85, tags: { name: 'Quán A', 'addr:street': 'Phố A' } },
    { type: 'node', lat: 21.03, lon: 105.86, tags: { name: 'Quán B', 'addr:street': 'Phố B' } },
  ],
}

function stub(googleStatus: number) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('places.googleapis.com')) {
      googleCalls++
      return new Response(JSON.stringify({ error: { code: googleStatus, message: 'refused' } }), { status: googleStatus })
    }
    if (url.includes('overpass') || url.includes('maps.mail.ru')) {
      osmCalls++
      return new Response(JSON.stringify(OSM_ROWS), { status: 200 })
    }
    return new Response(JSON.stringify({ organic: [], images: [] }), { status: 200 })
  }))
}

beforeEach(() => {
  googleCalls = 0; osmCalls = 0
  __resetPlacesBreaker()
  __clearToolCache()
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-a-real-secret'
  delete process.env.SERPER_API_KEY
})
afterEach(() => { vi.unstubAllGlobals() })

describe('🚨 a refusal is not bought twice', () => {
  it('429 (quota exhausted) arms the breaker on the SECOND refusal, never the first', async () => {
    stub(429)
    await searchPlaces('cafe breaker-429-a', 'Ha Noi', 'cafe')
    expect(googleCalls).toBe(1)
    // 🚨 The recovery call. A quota that reset a second ago is indistinguishable from one that
    // did not, and only asking can tell them apart — so this turn MUST reach Google.
    await searchPlaces('cafe breaker-429-b', 'Ha Noi', 'cafe')
    expect(googleCalls, 'the turn after a 429 must still be allowed to find a reset').toBe(2)
    // Two in a row is evidence the allowance really is spent; now it stops being re-bought.
    await searchPlaces('cafe breaker-429-c', 'Ha Noi', 'cafe')
    expect(googleCalls, 'a twice-confirmed refusal is not bought a third time').toBe(2)
  })

  it('403 (permission/billing) arms it the same way', async () => {
    stub(403)
    await searchPlaces('cafe breaker-403-a', 'Ha Noi', 'cafe')
    await searchPlaces('cafe breaker-403-b', 'Ha Noi', 'cafe')
    expect(googleCalls).toBe(1)
  })

  it('🚨 it is a breaker, not a kill switch — it expires', async () => {
    stub(429)
    await searchPlaces('cafe breaker-expiry-a', 'Ha Noi', 'cafe')
    expect(googlePlacesLikelyAvailable(), 'one 429 leaves the door open').toBe(true)
    await searchPlaces('cafe breaker-expiry-b', 'Ha Noi', 'cafe')
    expect(googlePlacesLikelyAvailable()).toBe(false)
    // 10 minutes later Google is tried again, so a quota reset or a completed
    // onboarding is picked up on its own.
    expect(googlePlacesLikelyAvailable(Date.now() + 11 * 60 * 1000)).toBe(true)
  })

  it('a healthy Google is never skipped', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
      if (url.includes('places.googleapis.com')) {
        googleCalls++
        return new Response(JSON.stringify({ places: [{
          id: 'p1', displayName: { text: 'Quán Google' }, formattedAddress: '1 Phố X',
          googleMapsUri: 'https://maps.google.com/?cid=1', rating: 4.6, userRatingCount: 200,
        }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ elements: [], organic: [] }), { status: 200 })
    }))
    await searchPlaces('cafe healthy-a', 'Ha Noi', 'cafe')
    await searchPlaces('cafe healthy-b', 'Ha Noi', 'cafe')
    expect(googleCalls).toBe(2)
    expect(googlePlacesLikelyAvailable()).toBe(true)
  })
})

describe('🚨 skipping Google changes NOTHING about the answer', () => {
  it('the OSM rows, and the honest status, are identical either way', async () => {
    stub(429)
    const first = await searchPlaces('cafe parity-probe', 'Ha Noi', 'cafe') as Record<string, unknown>
    // A second refusal, which is what arms the breaker (the first only records it).
    await searchPlaces('cafe parity-arm', 'Ha Noi', 'cafe')
    __clearToolCache()
    // Breaker now armed: this turn never touches Google.
    const callsBefore = googleCalls
    const second = await searchPlaces('cafe parity-probe', 'Ha Noi', 'cafe') as Record<string, unknown>
    expect(googleCalls).toBe(callsBefore)
    expect(second.source).toBe(first.source)
    expect(second.place_search_status).toBe('has_results')
    expect(JSON.stringify(second.results)).toBe(JSON.stringify(first.results))
    expect(osmCalls).toBeGreaterThan(0)
  })

  it('🚨 no Google-shaped field is invented when Google never answered', async () => {
    stub(429)
    const r = await searchPlaces('cafe nofab-probe', 'Ha Noi', 'cafe') as {
      results?: Array<Record<string, unknown>>
    }
    for (const row of r.results ?? []) {
      for (const f of ['google_rating', 'rating_value', 'rating_count', 'price_level', 'open_now', 'place_types', 'photo_names']) {
        expect(row[f], `${f} must stay absent, not be guessed`).toBeUndefined()
      }
      expect(row.name).toBeTruthy()   // …while the real OSM facts are all there
      expect(row.maps_link).toBeTruthy()
    }
  })
})
