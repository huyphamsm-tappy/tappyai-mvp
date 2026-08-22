import { describe, it, expect } from 'vitest'
import { resolveWeatherPlace } from '@/lib/ai/tools/cacheKeys'
import {
  CITY_MATCH_RADIUS_KM,
  VIETNAM_CITIES,
  cityForName,
  cityInText,
  haversineKm,
} from '@/lib/ai/tools/vietnamCities'

// ── F01 live provider matrix ─────────────────────────────────────────────────────────────────
//
//   TAPPY_MEASURE=1 npx vitest run src/lib/ai/__measure__/weatherCountryMatrix.test.ts \
//     --disable-console-intercept
//
// Hits the REAL wttr.in for every city and asserts BOTH the country it answers with and how far
// that answer is from the city. Skipped by default — same convention as the other __measure__
// probes, and for the same reason: it is network-dependent and wttr.in is intermittently flaky.
//
// 🚨 This is the only test that can catch the real defect class. The unit tests prove the contract;
// this one protects the assumption the contract rests on — that these particular query strings
// still find these particular places. When that assumption broke for "Hue, Vietnam", every unit
// test stayed green and users got another province's weather.
//
// 🔑 An earlier version asserted country only. It passed while "Hue, Vietnam" was answering from
// 364 km away, because Ban Hong is in Vietnam. Distance is the assertion that would have caught it.

const MEASURE = process.env.TAPPY_MEASURE === '1'

type Resolved = { area: string; country: string; lat: number; lon: number; temp: string }

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
      lat: Number(a.latitude),
      lon: Number(a.longitude),
      temp: j.current_condition?.[0]?.temp_C ?? '?',
    }
  } catch (e) {
    return { error: String(e).slice(0, 60) }
  }
}

/** What a user types, including the forms that were wrong before. */
const USER_INPUTS = [
  'Đà Nẵng', 'Da Nang', 'Huế', 'Hue', 'Hạ Long', 'Ha Long',
  'Hà Nội', 'Sài Gòn', 'TP Hồ Chí Minh',
  // Cities that were never in the weather table, to show the map is not hiding a wider problem.
  'Quy Nhơn', 'Sa Pa', 'Ninh Bình', 'Cần Thơ', 'Hải Phòng',
]

describe.skipIf(!MEASURE)('F01 live · every city answers from inside itself', () => {
  it.each(VIETNAM_CITIES.map((c) => c.query))('%s', async (query) => {
    const city = VIETNAM_CITIES.find((c) => c.query === query)!
    const r = await lookup(query)
    if ('error' in r) {
      // A provider outage says nothing about our mapping, and failing on it would make this probe
      // noise. Reported so a run of all-skips cannot be mistaken for a pass.
      console.warn(`[weather-matrix] ${query}: PROVIDER UNAVAILABLE — ${r.error}`)
      return
    }
    const km = haversineKm(city.coords, [r.lat, r.lon])
    console.log(
      `[weather-matrix] ${query.padEnd(30)} → ${r.area.padEnd(18)} ${r.country.padEnd(10)} ` +
      `${km.toFixed(1).padStart(7)} km  ${r.temp}C`,
    )
    expect(r.country).toBe('Vietnam')
    expect(km, `${query} answered ${km.toFixed(1)} km away — that is a different place`)
      .toBeLessThanOrEqual(CITY_MATCH_RADIUS_KM)
  }, 30_000)
})

describe.skipIf(!MEASURE)('F01 live · what users type lands in the right city', () => {
  it.each(USER_INPUTS)('"%s"', async (input) => {
    const city = cityForName(input) ?? cityInText(input)
    const place = resolveWeatherPlace(input)
    const r = await lookup(place)
    if ('error' in r) {
      console.warn(`[weather-matrix] "${input}": PROVIDER UNAVAILABLE — ${r.error}`)
      return
    }
    const km = city ? haversineKm(city.coords, [r.lat, r.lon]) : null
    console.log(
      `[weather-matrix] "${input}" → sent "${place}" → ${r.area}, ${r.country} ` +
      `${km === null ? '(unmapped)' : `${km.toFixed(1)} km`} ${r.temp}C`,
    )
    expect(r.country).toBe('Vietnam')
    if (km !== null) {
      expect(km, `"${input}" answered ${km.toFixed(1)} km away`).toBeLessThanOrEqual(CITY_MATCH_RADIUS_KM)
    }
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
      console.warn(`[weather-matrix] ${input}: PROVIDER UNAVAILABLE — ${r.error}`)
      return
    }
    console.log(`[weather-matrix] ${input.padEnd(30)} → ${r.area.padEnd(18)} ${r.country}`)
    expect(r.country).toBe(expectedCountry)
  }, 30_000)
})
