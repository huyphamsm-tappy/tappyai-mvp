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

type Resolved = { area: string; country: string; temp: string }

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
