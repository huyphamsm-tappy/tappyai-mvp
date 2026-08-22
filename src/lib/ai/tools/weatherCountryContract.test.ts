import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  VIETNAM,
  WEATHER_CITY_ENTRIES,
  matchWeatherCityInText,
  resolveWeatherPlace,
  weatherCacheKey,
  weatherPlaceResolution,
} from './cacheKeys'

/**
 * F01 — a Vietnamese city must never come back as another country's weather.
 *
 * Production said Đà Nẵng was 12°C. Đà Nẵng was 35°C; 12°C was Karlsruhe, Germany. Nothing
 * errored — `normalizeVN` stripped the tone marks, the city map handed wttr.in the bare ASCII
 * string "Da Nang", and the provider geocoded it to Germany. The model relayed the number as
 * fact, in Vietnamese, to a Vietnamese user.
 *
 * Measured at the provider on 2026-08-22:
 *     "Da Nang" → Karlsruhe, GERMANY 12°C     "Đà Nẵng" → Da Nang, VIETNAM 35°C
 *     "Hue"     → Ipartelep, HUNGARY 17°C     "Ha Long" → Nyane, LESOTHO 6°C
 *
 * The diacritic form was already correct, so the map — whose job was to remove ambiguity — was
 * the thing introducing it.
 *
 * This file guards BOTH halves of the fix, because either alone is insufficient:
 *
 *   1. the OUTGOING string is country-qualified, for every entry, not just the three that were
 *      caught by hand;
 *   2. the INCOMING answer is checked against the country we were entitled to expect, so a
 *      geocoder that resolves somewhere else cannot become a confident number.
 *
 * 🚨 Asserting only (1) would let a future provider change reintroduce the bug silently, and
 * asserting only (2) would leave every query one geocoder mood away from failing. The live
 * provider matrix lives in `src/lib/ai/__measure__/weatherCountryMatrix.test.ts`.
 */

// ── 1. The outgoing string ───────────────────────────────────────────────────────────────────

describe('F01 · every mapped city is country-qualified', () => {
  it('has entries to check (a table that emptied itself would pass everything below)', () => {
    expect(WEATHER_CITY_ENTRIES.length).toBeGreaterThanOrEqual(15)
  })

  it.each(WEATHER_CITY_ENTRIES.map(([alias, value]) => ({ alias, value })))(
    '"$alias" → "$value" names Vietnam',
    ({ value }) => {
      expect(value.endsWith(`, ${VIETNAM}`)).toBe(true)
    },
  )

  /**
   * The specific strings that were measured to resolve abroad. A qualifier check alone would
   * still pass if someone "qualified" a value as "Da Nang, Viet Nam" — a spelling the provider
   * does not resolve — so the exact known-good values are pinned too.
   */
  it.each([
    ['Đà Nẵng', 'Da Nang, Vietnam'],
    ['đà nẵng', 'Da Nang, Vietnam'],
    ['Da Nang', 'Da Nang, Vietnam'],
    ['da nang', 'Da Nang, Vietnam'],
    ['DANANG', 'Da Nang, Vietnam'],
    ['Huế', 'Hue, Vietnam'],
    ['hue', 'Hue, Vietnam'],
    ['Hạ Long', 'Ha Long, Vietnam'],
    ['ha long', 'Ha Long, Vietnam'],
    ['Hà Nội', 'Ha Noi, Vietnam'],
    ['hn', 'Ha Noi, Vietnam'],
    ['Sài Gòn', 'Ho Chi Minh City, Vietnam'],
  ])('%s resolves to %s', (input, expected) => {
    expect(resolveWeatherPlace(input)).toBe(expected)
    expect(weatherPlaceResolution(input).expectedCountry).toBe(VIETNAM)
  })

  /**
   * The three literals that caused the incident, banned as OUTPUT. This is the assertion that
   * fails first if anyone "simplifies" the map back to bare city names.
   */
  it.each(['Da Nang', 'Hue', 'Ha Long', 'Hanoi'])(
    'never sends the bare ambiguous string "%s" upstream',
    (dangerous) => {
      const produced = WEATHER_CITY_ENTRIES.map(([, v]) => v)
      expect(produced).not.toContain(dangerous)
    },
  )
})

describe('F01 · free-form locations are untouched', () => {
  /**
   * Qualifying everything with ", Vietnam" would fix three cities by breaking every other
   * country. Anything not in the table is passed through verbatim and carries NO expectation,
   * because a free-form place can legitimately be anywhere.
   */
  it.each(['Paris', 'London', 'Tokyo', 'Singapore', 'Bangkok', 'New York', 'Seoul'])(
    '%s is sent as-is with no country expectation',
    (city) => {
      const r = weatherPlaceResolution(city)
      expect(r.query).toBe(city)
      expect(r.expectedCountry).toBeNull()
      expect(r.query).not.toMatch(/Vietnam/)
    },
  )

  it('an empty location keeps the historical default, which is a known city', () => {
    const r = weatherPlaceResolution('')
    expect(r.query).toBe('Ha Noi, Vietnam')
    expect(r.expectedCountry).toBe(VIETNAM)
  })
})

describe('F01 · one city is still one cache entry', () => {
  it('every spelling of Da Nang shares a key, and differs from Hue', () => {
    const keys = ['Đà Nẵng', 'da nang', 'DANANG', 'Da Nang'].map((s) => weatherCacheKey(s, 'vi'))
    expect(new Set(keys).size).toBe(1)
    expect(weatherCacheKey('Huế', 'vi')).not.toBe(keys[0])
  })

  it('language is part of the key', () => {
    expect(weatherCacheKey('Đà Nẵng', 'vi')).not.toBe(weatherCacheKey('Đà Nẵng', 'en'))
  })
})

describe('F01 · free-text locations find their city, or none at all', () => {
  /**
   * The morning-brief cron reads whatever the user saved on their profile. It used to carry its
   * own city table — with the same bare-ASCII defect — and defaulted to Ho Chi Minh City for
   * anything it did not recognise, which is a silent wrong answer delivered as a push.
   */
  it.each([
    ['Quận 1, Hồ Chí Minh', 'ho chi minh'],
    ['sống ở Đà Nẵng', 'da nang'],
    ['Đà Nẵng', 'da nang'],
    ['mình ở Hạ Long', 'ha long'],
    ['Huế', 'hue'],
    ['TP HCM', 'tp hcm'],
  ])('"%s" → %s', (text, alias) => {
    expect(matchWeatherCityInText(text)).toBe(alias)
    // …and whatever it matched still resolves to a country-qualified query.
    expect(resolveWeatherPlace(matchWeatherCityInText(text))).toMatch(/, Vietnam$/)
  })

  it('a longer alias wins over a shorter one it contains', () => {
    expect(matchWeatherCityInText('tp hcm')).toBe('tp hcm')
  })

  it.each(['Paris', 'somewhere else entirely', '', null, undefined])(
    'returns null for %s rather than guessing a default city',
    (text) => {
      expect(matchWeatherCityInText(text as string | null | undefined)).toBeNull()
    },
  )
})

// ── 2. The incoming answer ───────────────────────────────────────────────────────────────────

/** A wttr.in payload shaped exactly like the real one, for a given resolved place. */
function providerPayload(area: string, country: string) {
  return {
    nearest_area: [{ areaName: [{ value: area }], country: [{ value: country }] }],
    current_condition: [{
      temp_C: '12', FeelsLikeC: '10', weatherDesc: [{ value: 'Partly cloudy' }],
      humidity: '93', windspeedKmph: '15',
    }],
    weather: [{ maxtempC: '22', mintempC: '12', hourly: [{ time: '1200', chanceofrain: '17' }] }],
  }
}

/** Fresh module graph per case: the tool cache is a module-level Map and would leak between them. */
async function freshGetWeather() {
  vi.resetModules()
  return (await import('./weather')).getWeather
}

afterEach(() => { vi.unstubAllGlobals() })

describe('F01 · a mismatched country is refused, not relayed', () => {
  it('🚨 Da Nang answered by Germany does NOT become a weather result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Karlsruhe', 'Germany')), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Đà Nẵng', 'vi') as Record<string, unknown>

    // The exact production symptom: a well-formed result carrying another continent's number.
    expect(out).toHaveProperty('error')
    expect(out.temp_C).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain('Karlsruhe')
    expect(JSON.stringify(out)).not.toContain('12')
  })

  it('🚨 Hue answered by Hungary is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Ipartelep', 'Hungary')), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Huế', 'vi') as Record<string, unknown>
    expect(out).toHaveProperty('error')
    expect(out.temp_C).toBeUndefined()
  })

  it('🚨 Ha Long answered by Lesotho is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Nyane', 'Lesotho')), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Hạ Long', 'vi') as Record<string, unknown>
    expect(out).toHaveProperty('error')
  })

  it('a Vietnamese city answered by Vietnam is returned, and says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Da Nang', 'Vietnam')), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Đà Nẵng', 'vi') as Record<string, unknown>
    expect(out).not.toHaveProperty('error')
    expect(out.location).toBe('Da Nang')
    expect(out.country).toBe('Vietnam')
    expect(out.temp_C).toBe('12')
  })

  it('the outgoing URL carries the qualifier — the guard is not covering for a broken map', async () => {
    const spy = vi.fn(async (...args: unknown[]) => {
      void args
      return new Response(JSON.stringify(providerPayload('Da Nang', 'Vietnam')), { status: 200 })
    })
    vi.stubGlobal('fetch', spy)
    const getWeather = await freshGetWeather()
    await getWeather('Đà Nẵng', 'vi')
    const requestedUrl = String(spy.mock.calls[0]?.[0] ?? '')
    expect(requestedUrl).toContain(encodeURIComponent('Da Nang, Vietnam'))
  })
})

describe('F01 · the guard does not overreach', () => {
  it('Paris answered by France is fine — no expectation, no refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Saint-Merri', 'France')), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Paris', 'en') as Record<string, unknown>
    expect(out).not.toHaveProperty('error')
    expect(out.country).toBe('France')
  })

  it('missing country metadata is not treated as a mismatch (the provider is flaky)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      current_condition: [{ temp_C: '33', FeelsLikeC: '38', weatherDesc: [{ value: 'Sunny' }], humidity: '70', windspeedKmph: '9' }],
      weather: [{ maxtempC: '34', mintempC: '27', hourly: [{ time: '1200', chanceofrain: '10' }] }],
    }), { status: 200 })))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Đà Nẵng', 'vi') as Record<string, unknown>
    expect(out).not.toHaveProperty('error')
    expect(out.temp_C).toBe('33')
    expect(out.country).toBeNull()
  })
})
