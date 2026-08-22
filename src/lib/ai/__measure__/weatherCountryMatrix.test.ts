import { describe, it, expect } from 'vitest'
import { VIETNAM, WEATHER_CITY_ENTRIES, resolveWeatherPlace } from '@/lib/ai/tools/cacheKeys'

// ── F01 live provider matrix ─────────────────────────────────────────────────────────────────
//
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/weatherCountryMatrix.test.ts
//
// Hits the REAL wttr.in for every city in WEATHER_CITY_MAP and asserts the country it actually
// answers with. Skipped by default — same convention as the other __measure__ probes, and for
// the same reason: it is network-dependent and wttr.in is intermittently flaky (three of ten
// lookups failed outright while this was being written).
//
// 🚨 This is the only test that can catch the real defect class. `weatherCountryContract.test.ts`
// proves the string we SEND is qualified and that a mismatched answer is refused; neither of
// those can notice the day wttr.in decides "Da Nang, Vietnam" means somewhere else. The unit
// tests protect the contract; this one protects the assumption the contract rests on.
//
// The bug it exists for: on 2026-08-22 production told a Vietnamese user Đà Nẵng was 12°C. It was
// 35°C. 12°C was Karlsruhe, Germany.

const MEASURE = process.env.TAPPY_MEASURE === '1'

// `lat`/`lon` are carried alongside the country because the country alone cannot answer the
// question this probe exists to ask. See the coordinate block further down.
type Resolved = { area: string; country: string; temp: string; lat: number | null; lon: number | null }

const asCoord = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function lookup(place: string): Promise<Resolved | { error: string }> {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(place)}?format=j1`, {
      headers: { 'User-Agent': 'curl/8.0', Accept: 'application/json' },
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const j = await res.json()
    const a = j.nearest_area?.[0]
    if (!a) return { error: 'no nearest_area' }
    return {
      area: a.areaName?.[0]?.value ?? '?',
      country: a.country?.[0]?.value ?? '?',
      temp: j.current_condition?.[0]?.temp_C ?? '?',
      lat: asCoord(a.latitude),
      lon: asCoord(a.longitude),
    }
  } catch (e) {
    return { error: String(e).slice(0, 60) }
  }
}

/** Distinct outgoing queries — the table has several aliases per city and one call each is enough. */
const PLACES = [...new Set(WEATHER_CITY_ENTRIES.map(([, value]) => value))]

/** Aliases a user actually types, including the diacritic forms that started this. */
const USER_INPUTS = [
  'Đà Nẵng', 'Da Nang', 'Huế', 'Hue', 'Hạ Long', 'Ha Long',
  'Hà Nội', 'Sài Gòn', 'Nha Trang', 'Đà Lạt', 'Phú Quốc',
]

// ── The country is necessary but not sufficient ──────────────────────────────────────────────
//
// F01 was reported as "wrong country" because that is how it presented: Đà Nẵng answered by
// Germany. But the defect is not really about countries — it is that we hand a free geocoder an
// ambiguous string and publish whatever comes back as if it were the city the user named. A
// country check catches the version of that bug which crosses a border and nothing else.
//
// Measured on 2026-08-22, AFTER the country qualifier was added, every one of these answers
// `country = Vietnam` and so passes every assertion above:
//
//     "Hue, Vietnam"      ->  Ban Hong, 26°C      364 km from Huế      (Lâm Đồng highlands)
//     "Ha Long, Vietnam"  ->  Gia Mien Noi, 25°C  163 km from Hạ Long
//
// Huế was 35°C that day. Reporting 26°C is the same failure the country fix was written for,
// scaled down from a continent to a province — and invisible to the checks that fix added.
//
// So this asserts the thing actually promised: the answer comes from the place we asked about.
const CITY_COORDS: Record<string, readonly [number, number]> = {
  'Ha Noi, Vietnam': [21.028, 105.834],
  'Ho Chi Minh City, Vietnam': [10.776, 106.700],
  'Da Nang, Vietnam': [16.047, 108.206],
  // 🔑 Keyed by the string we SEND, but the coordinate is the city the user MEANT. When the map
  // value changed to get a better answer, only the key moved — Huế is still Huế's centre and Hạ
  // Long is still Hạ Long's. Moving these to wherever the provider happens to land would turn the
  // assertion into a tautology and re-open exactly the bug it was written for.
  'Thua Thien Hue, Vietnam': [16.463, 107.590],
  'Hong Gai, Vietnam': [20.951, 107.079],
  'Can Tho, Vietnam': [10.045, 105.746],
  'Hai Phong, Vietnam': [20.865, 106.684],
  'Nha Trang, Vietnam': [12.238, 109.196],
  'Da Lat, Vietnam': [11.940, 108.458],
  'Vung Tau, Vietnam': [10.346, 107.084],
  'Hoi An, Vietnam': [15.880, 108.338],
  'Phu Quoc, Vietnam': [10.229, 103.960],
}

/**
 * How far the provider's nearest_area may sit from the city centre.
 *
 * wttr.in habitually answers with a ward or commune rather than the city itself — "Hanoi" comes
 * back as Hao Nam, Ho Chi Minh City as Đa Kao — and those are correct answers about the right
 * place, so the name cannot be compared. Measured spread for the ten cities that resolve
 * correctly is 0–9 km, so 50 km accepts every legitimate neighbourhood-level answer with room to
 * spare while still rejecting a different province.
 */
const MAX_KM_FROM_CITY = 50

/** Haversine, inline and deterministic — a test-only need must not add a production dependency. */
function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLon = (b[1] - a[1]) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

describe.skipIf(!MEASURE)('F01 live · every mapped city resolves inside Vietnam', () => {
  it.each(PLACES)('%s → Vietnam', async (place) => {
    const r = await lookup(place)
    if ('error' in r) {
      // A provider outage is not evidence about our mapping, and failing on it would make this
      // probe useless noise. It is reported so a run of all-skips cannot look like a pass.
      console.warn(`[weather-matrix] ${place}: provider unavailable — ${r.error}`)
      return
    }
    console.log(`[weather-matrix] ${place.padEnd(28)} → ${r.area.padEnd(20)} ${r.country.padEnd(12)} ${r.temp}C`)
    expect(r.country).toBe(VIETNAM)
  }, 30_000)
})

describe.skipIf(!MEASURE)('F01 live · what users type resolves inside Vietnam', () => {
  it.each(USER_INPUTS)('"%s" → Vietnam', async (input) => {
    const place = resolveWeatherPlace(input)
    const r = await lookup(place)
    if ('error' in r) {
      console.warn(`[weather-matrix] ${input}: provider unavailable — ${r.error}`)
      return
    }
    console.log(`[weather-matrix] "${input}" → sent "${place}" → ${r.area}, ${r.country} ${r.temp}C`)
    expect(r.country).toBe(VIETNAM)
  }, 30_000)
})

describe.skipIf(!MEASURE)('F01 live · international lookups still work', () => {
  // The fix must not have been "append Vietnam to everything".
  it.each([
    ['Paris', 'France'],
    ['London', 'United Kingdom'],
    ['Tokyo', 'Japan'],
    ['Singapore', 'Singapore'],
  ])('%s → %s', async (input, expectedCountry) => {
    const place = resolveWeatherPlace(input)
    expect(place).toBe(input)
    const r = await lookup(place)
    if ('error' in r) {
      console.warn(`[weather-matrix] ${input}: provider unavailable — ${r.error}`)
      return
    }
    console.log(`[weather-matrix] ${input.padEnd(28)} → ${r.area.padEnd(20)} ${r.country}`)
    expect(r.country).toBe(expectedCountry)
  }, 30_000)
})

describe.skipIf(!MEASURE)('F01 live · every mapped city resolves NEAR the city it names', () => {
  // A table that quietly lost its entries would make every case below vacuous.
  it('every outgoing query has a coordinate to be checked against', () => {
    expect(PLACES.length).toBeGreaterThan(0)
    const uncovered = PLACES.filter((p) => !CITY_COORDS[p])
    // 🔑 Fails on ADDING a city without coordinates, rather than skipping it. An unchecked entry
    // is exactly how "Ha Long" got into production resolving to Lesotho.
    expect(uncovered).toEqual([])
  })

  it.each(PLACES)(`%s is within ${MAX_KM_FROM_CITY} km of the city it names`, async (place) => {
    const expected = CITY_COORDS[place]
    expect(expected, `no coordinates recorded for "${place}"`).toBeDefined()

    const r = await lookup(place)
    if ('error' in r) {
      // Same tolerance as the country cases above: a provider outage says nothing about our map.
      console.warn(`[weather-matrix] ${place}: provider unavailable — ${r.error}`)
      return
    }
    if (r.lat === null || r.lon === null) {
      // Missing coordinates are missing evidence, not evidence of a wrong place.
      console.warn(`[weather-matrix] ${place}: provider returned no coordinates`)
      return
    }

    const km = distanceKm(expected, [r.lat, r.lon])
    console.log(
      `[weather-matrix] ${place.padEnd(28)} → ${r.area.padEnd(20)} ` +
        `${r.lat.toFixed(3)},${r.lon.toFixed(3)}  ${km.toFixed(0)} km  ${r.temp}C`,
    )
    expect(
      km,
      `"${place}" answered from ${r.area} (${r.lat},${r.lon}), ${km.toFixed(0)} km away — ` +
        `that is a different place, and its weather is a different city's weather`,
    ).toBeLessThanOrEqual(MAX_KM_FROM_CITY)
  }, 30_000)
})
