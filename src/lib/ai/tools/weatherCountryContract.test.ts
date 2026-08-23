import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  VIETNAM,
  WEATHER_CITY_ENTRIES,
  matchWeatherCityInText,
  resolveWeatherPlace,
  weatherCacheKey,
  weatherPlaceResolution,
} from './cacheKeys'
import {
  CITY_MATCH_RADIUS_KM,
  VIETNAM_CITIES,
  VIETNAM_CITY_ENTRIES,
  cityForAlias,
  haversineKm,
  isSameCity,
} from './vietnamCities'

/**
 * F01 — the weather answer must be about the place that was asked for.
 *
 * Production said Đà Nẵng was 12°C. Đà Nẵng was 35°C; 12°C was Karlsruhe, Germany. Nothing
 * errored — `normalizeVN` stripped the tone marks, the city map handed wttr.in the bare ASCII
 * string "Da Nang", and the provider geocoded it to Germany. The model relayed the number as
 * fact, in Vietnamese, to a Vietnamese user.
 *
 * ============================================================================
 * TWO DEFECTS, NOT ONE
 * ============================================================================
 * Measured at the provider on 2026-08-22:
 *
 *   WRONG COUNTRY   "Da Nang"          → Karlsruhe, GERMANY    12°C
 *                   "Hue"              → Ipartelep, HUNGARY    17°C
 *                   "Ha Long"          → Nyane, LESOTHO         6°C
 *
 *   WRONG CITY      "Hue, Vietnam"     → Ban Hong, Vietnam     364 km  27°C
 *                   "Ha Long, Vietnam" → Gia Mien Noi, Vietnam 165 km
 *
 * 🚨 The second set is the one a country check cannot see, and it is why this file grew a
 * distance layer. Correctly suffixed, correctly in Vietnam, and still another province's weather
 * presented as Huế's.
 *
 * 🔑 An earlier version of this comment claimed the diacritic form was already correct. That
 * holds for Đà Nẵng and it is FALSE for Huế — bare "Huế" resolves to Hungary. Keeping the
 * accents is not a fix; measuring each query is.
 *
 * ============================================================================
 * WHAT IS GUARDED
 * ============================================================================
 *   1. the OUTGOING query, for every entry, is one that was measured to find the right place;
 *   2. the INCOMING answer is checked for country AND for distance, so neither "another country"
 *      nor "another province" can become a confident number;
 *   3. resolution round-trips, so the push path cannot lose the guard;
 *   4. no two cities can share a cache entry.
 *
 * Asserting only the outgoing string would let a provider change reintroduce the bug silently;
 * asserting only the incoming answer would leave every query one geocoder mood away from
 * failing. The live provider matrix lives in `src/lib/ai/__measure__/weatherCountryMatrix.test.ts`.
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
    // 🚨 NOT "Hue, Vietnam". That is country-qualified and still wrong: the provider answers it
    // with Ban Hong, 364 km inland, 27°C for a city that was 35°C. The province qualifier is what
    // finds the city — measured, not composed.
    ['Huế', 'Thua Thien Hue, Vietnam'],
    ['hue', 'Thua Thien Hue, Vietnam'],
    // Likewise: "Ha Long, Vietnam" lands 165 km away, and bare "Ha Long" lands in Lesotho.
    ['Hạ Long', 'Hong Gai, Vietnam'],
    ['ha long', 'Hong Gai, Vietnam'],
    ['Hà Nội', 'Ha Noi, Vietnam'],
    ['hn', 'Ha Noi, Vietnam'],
    ['Sài Gòn', 'Ho Chi Minh City, Vietnam'],
  ])('%s resolves to %s', (input, expected) => {
    expect(resolveWeatherPlace(input)).toBe(expected)
    expect(weatherPlaceResolution(input).expectedCountry).toBe(VIETNAM)
  })

  /**
   * Literals measured to resolve to the wrong PLACE, banned as output.
   *
   * The first three are wrong-country; the last two are the ones a country check cannot catch —
   * correctly suffixed with ", Vietnam" and still hundreds of kilometres from the city. This is
   * the assertion that fails first if anyone "simplifies" the table back toward the obvious form.
   */
  it.each([
    ['Da Nang', 'Karlsruhe, Germany'],
    ['Hue', 'Ipartelep, Hungary'],
    ['Ha Long', 'Nyane, Lesotho'],
    ['Hanoi', 'Hao Nam — a ward, not the city'],
    ['Hue, Vietnam', 'Ban Hong — 364 km inland'],
    ['Ha Long, Vietnam', 'Gia Mien Noi — 165 km away'],
  ])('never sends "%s" upstream (measured: %s)', (dangerous) => {
    const produced = WEATHER_CITY_ENTRIES.map(([, v]) => v)
    expect(produced).not.toContain(dangerous)
  })

  it('every mapped city carries coordinates to check the answer against', () => {
    // A query without coordinates is a city the distance guard cannot protect.
    for (const [alias] of WEATHER_CITY_ENTRIES) {
      const r = weatherPlaceResolution(alias)
      expect(r.expectedCoords, `${alias} has no canonical coordinates`).not.toBeNull()
      const [lat, lon] = r.expectedCoords!
      // Vietnam's bounding box, loosely — catches a transposed or zeroed pair.
      expect(lat).toBeGreaterThan(8); expect(lat).toBeLessThan(24)
      expect(lon).toBeGreaterThan(102); expect(lon).toBeLessThan(110)
    }
  })
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
    ['Quận 1, Hồ Chí Minh', 'Ho Chi Minh City, Vietnam'],
    ['sống ở Đà Nẵng', 'Da Nang, Vietnam'],
    ['Đà Nẵng', 'Da Nang, Vietnam'],
    ['mình ở Hạ Long', 'Hong Gai, Vietnam'],
    ['Huế', 'Thua Thien Hue, Vietnam'],
    ['TP HCM', 'Ho Chi Minh City, Vietnam'],
  ])('"%s" → %s', (text, query) => {
    expect(matchWeatherCityInText(text)).toBe(query)
  })

  /**
   * 🔑 Resolution round-trips.
   *
   * The morning-brief cron looks a city up here and hands the result to `getWeather`. If feeding a
   * canonical query back in did not resolve to the same city, it would fall through as a free-form
   * location — right query, NO country expectation and NO coordinates — and the guard would be
   * silently absent on the push path only. That is invisible from either side alone.
   */
  it.each(['Quận 1, Hồ Chí Minh', 'sống ở Đà Nẵng', 'mình ở Hạ Long', 'Huế'])(
    'the query found for "%s" resolves back to the same city, with both expectations intact',
    (text) => {
      const query = matchWeatherCityInText(text)!
      const round = weatherPlaceResolution(query)
      expect(round.query).toBe(query)
      expect(round.expectedCountry).toBe(VIETNAM)
      expect(round.expectedCoords).not.toBeNull()
    },
  )

  /**
   * Longest-alias-first only matters if one city's alias is a substring of another city's. None
   * are today, so this asserts the invariant rather than the ordering — if a future city breaks
   * it, this fails and the ordering becomes load-bearing.
   */
  it('no alias of one city is contained in an alias of a different city', () => {
    const collisions: string[] = []
    for (const [a, ca] of VIETNAM_CITY_ENTRIES) {
      for (const [b, cb] of VIETNAM_CITY_ENTRIES) {
        if (a === b || ca === cb) continue
        if (b.includes(a)) collisions.push(`"${a}" (${ca.query}) inside "${b}" (${cb.query})`)
      }
    }
    expect(collisions).toEqual([])
  })

  it('a longer alias still finds the right city', () => {
    expect(matchWeatherCityInText('tp hcm')).toBe('Ho Chi Minh City, Vietnam')
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
function providerPayload(area: string, country: string, coords?: readonly [number, number]) {
  const nearest: Record<string, unknown> = {
    areaName: [{ value: area }],
    country: [{ value: country }],
  }
  // Omitted entirely when not supplied, so the "provider sent no coordinates" case is a real
  // absence rather than a zero that would read as the Gulf of Guinea.
  if (coords) { nearest.latitude = String(coords[0]); nearest.longitude = String(coords[1]) }
  return {
    nearest_area: [nearest],
    current_condition: [{
      temp_C: '12', FeelsLikeC: '10', weatherDesc: [{ value: 'Partly cloudy' }],
      humidity: '93', windspeedKmph: '15',
    }],
    weather: [{ maxtempC: '22', mintempC: '12', hourly: [{ time: '1200', chanceofrain: '17' }] }],
  }
}

/** Coordinates the real provider actually returned on 2026-08-22, so the fixtures are not invented. */
const OBSERVED = {
  banHong: [13.283, 108.400] as const,       // what "Hue, Vietnam" answered — 364 km from Hue
  giaMienNoi: [20.100, 105.800] as const,    // what "Ha Long, Vietnam" answered — 165 km away
  kimLong: [16.4592, 107.5820] as const,     // what "Hue, Thua Thien Hue, Vietnam" answers — 0.5 km
  hongGai: [20.9564, 107.0826] as const,     // what "Ha Long, Quang Ninh, Vietnam" answers — 2.9 km
  haoNam: [21.033, 105.833] as const,        // what "Ha Noi, Vietnam" answers — 2.3 km, a ward
  daKao: [10.783, 106.700] as const,         // what "Ho Chi Minh City, Vietnam" answers — 0.7 km
  saintMerri: [48.858, 2.351] as const,      // what "Paris" answers
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
    // The URL is captured rather than discarded, so the assertion is about what was actually
    // requested. Without this, a broken map plus a working guard would look identical to a
    // correct map: every wrong answer refused, every right answer never asked for.
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      requested.push(String(url))
      return new Response(JSON.stringify(providerPayload('Da Nang', 'Vietnam')), { status: 200 })
    }))
    const getWeather = await freshGetWeather()
    await getWeather('Đà Nẵng', 'vi')
    expect(requested).toHaveLength(1)
    expect(requested[0]).toContain(encodeURIComponent('Da Nang, Vietnam'))
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

// ── 3. The right country is not the right place ──────────────────────────────────────────────

describe('F01 · a same-country wrong city is refused', () => {
  /**
   * The defect the country check could not see. "Hue, Vietnam" is correctly country-qualified and
   * the provider answered it with Ban Hong — Vietnam, 364 km inland, 27°C for a city that was
   * 35°C. Every assertion here uses coordinates the real provider returned.
   */
  it('🚨 Hue answered by Ban Hong (Vietnam, 364 km) is NOT weather', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Ban Hong', 'Vietnam', OBSERVED.banHong)), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Huế', 'vi') as Record<string, unknown>
    expect(out).toHaveProperty('error')
    expect(out.temp_C).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain('Ban Hong')
  })

  it('🚨 Ha Long answered by Gia Mien Noi (Vietnam, 165 km) is NOT weather', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Gia Mien Noi', 'Vietnam', OBSERVED.giaMienNoi)), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Hạ Long', 'vi') as Record<string, unknown>
    expect(out).toHaveProperty('error')
    expect(out.temp_C).toBeUndefined()
  })

  it('a ward inside the city IS the city — Hanoi answered by Hao Nam (2.3 km)', async () => {
    // The provider routinely names a ward rather than the city. Rejecting that would break
    // Hanoi, Ho Chi Minh City and Hue on every call.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Hao Nam', 'Vietnam', OBSERVED.haoNam)), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Hà Nội', 'vi') as Record<string, unknown>
    expect(out).not.toHaveProperty('error')
    expect(out.location).toBe('Hao Nam')
  })

  it.each([
    ['Huế', 'Kim Long', OBSERVED.kimLong],
    ['Hạ Long', 'Hong Gai', OBSERVED.hongGai],
    ['Sài Gòn', 'Da Kao', OBSERVED.daKao],
  ])('%s answered by %s is accepted', async (input, area, coords) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload(area, 'Vietnam', coords)), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather(input, 'vi') as Record<string, unknown>
    expect(out).not.toHaveProperty('error')
    expect(out.temp_C).toBe('12')
  })

  it('missing coordinates are not treated as a mismatch — the provider is flaky', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Kim Long', 'Vietnam')), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Huế', 'vi') as Record<string, unknown>
    expect(out).not.toHaveProperty('error')
  })

  it('a free-form location is never distance-checked — Paris stays Paris', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Saint-Merri', 'France', OBSERVED.saintMerri)), { status: 200 },
    )))
    const getWeather = await freshGetWeather()
    const out = await getWeather('Paris', 'en') as Record<string, unknown>
    expect(out).not.toHaveProperty('error')
    expect(out.country).toBe('France')
  })
})

describe('F01 · the radius is where the measurements put it', () => {
  it('accepts everything measured correct and rejects everything measured wrong', () => {
    // Distances observed on 2026-08-22 between each city and what the provider returned.
    const CORRECT = [0.3, 0.5, 0.7, 1.2, 1.4, 1.5, 1.9, 2.3, 2.5, 2.9, 3.6, 4.2]
    const WRONG = [165.4, 364.3]
    for (const d of CORRECT) expect(d, `${d} km must be inside the radius`).toBeLessThan(CITY_MATCH_RADIUS_KM)
    for (const d of WRONG) expect(d, `${d} km must be outside the radius`).toBeGreaterThan(CITY_MATCH_RADIUS_KM)
  })

  it('sits clear of both edges rather than balanced on one', () => {
    expect(CITY_MATCH_RADIUS_KM).toBeGreaterThan(4.2 * 2)    // headroom above the worst correct
    expect(CITY_MATCH_RADIUS_KM).toBeLessThan(165.4 / 2)     // margin below the best wrong
  })

  it('haversineKm reproduces the measured Hue error', () => {
    const hue = cityForAlias('hue')!
    expect(haversineKm(hue.coords, OBSERVED.banHong)).toBeGreaterThan(300)
    expect(isSameCity(hue.coords, OBSERVED.banHong)).toBe(false)
    expect(isSameCity(hue.coords, OBSERVED.kimLong)).toBe(true)
  })
})

describe('F01 · one city cannot be served another city weather from cache', () => {
  it('every distinct city has a distinct cache key', () => {
    const keys = VIETNAM_CITIES.map((c) => weatherCacheKey(c.query, 'vi'))
    expect(new Set(keys).size).toBe(VIETNAM_CITIES.length)
  })

  it('Hue and Ha Long — the two that were wrong — do not share a key', () => {
    expect(weatherCacheKey('Huế', 'vi')).not.toBe(weatherCacheKey('Hạ Long', 'vi'))
  })

  it('a refused Hue lookup does not poison Ha Long', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      calls.push(String(url))
      // Hue gets the wrong-place answer; Ha Long gets a correct one.
      return String(url).includes('Thua%20Thien')
        ? new Response(JSON.stringify(providerPayload('Ban Hong', 'Vietnam', OBSERVED.banHong)), { status: 200 })
        : new Response(JSON.stringify(providerPayload('Hong Gai', 'Vietnam', OBSERVED.hongGai)), { status: 200 })
    }))
    const getWeather = await freshGetWeather()
    const hue = await getWeather('Huế', 'vi') as Record<string, unknown>
    const haLong = await getWeather('Hạ Long', 'vi') as Record<string, unknown>
    expect(hue).toHaveProperty('error')
    expect(haLong).not.toHaveProperty('error')
    expect(haLong.location).toBe('Hong Gai')
    expect(calls).toHaveLength(2)   // two distinct upstream calls, not one cached answer reused
  })
})

describe('F01 · a phrase containing a city still resolves to that city', () => {
  /**
   * The live matrix found this: "TP Hồ Chí Minh" is not an alias, so it went upstream unmapped
   * and carried no expectations at all. It landed 0.7 km from the city by luck — right answer,
   * no guard.
   */
  it.each([
    ['TP Hồ Chí Minh', 'Ho Chi Minh City, Vietnam'],
    ['TP. Hồ Chí Minh', 'Ho Chi Minh City, Vietnam'],
    ['Thời tiết ở Đà Nẵng', 'Da Nang, Vietnam'],
    ['Quận 1, Hồ Chí Minh', 'Ho Chi Minh City, Vietnam'],
    ['thành phố Huế', 'Thua Thien Hue, Vietnam'],
  ])('"%s" → %s, fully guarded', (input, query) => {
    const r = weatherPlaceResolution(input)
    expect(r.query).toBe(query)
    expect(r.expectedCountry).toBe(VIETNAM)
    expect(r.expectedCoords).not.toBeNull()
  })

  /**
   * 🚨 Two aliases are two and three letters long. A bare substring test matches "hn" inside
   * "johnson" and "hcm" inside a product code, and would answer with Hanoi's weather for either.
   */
  it.each(['johnson', 'Johnson City', 'archnemesis', 'HCMX-200 sensor', 'Athens', 'Phnom Penh'])(
    '"%s" is NOT mistaken for a Vietnamese city',
    (text) => {
      const r = weatherPlaceResolution(text)
      expect(r.expectedCountry).toBeNull()
      expect(r.query).toBe(text)
    },
  )

  it('international city names are still passed through untouched', () => {
    for (const city of ['Paris', 'London', 'Tokyo', 'Singapore', 'Bangkok']) {
      expect(weatherPlaceResolution(city).query).toBe(city)
      expect(weatherPlaceResolution(city).expectedCoords).toBeNull()
    }
  })
})

describe('F01 · the radius boundary is deterministic', () => {
  /**
   * The threshold is only meaningful if its edges behave predictably. Real provider coordinates
   * cannot be dialled to a chosen distance, so these are constructed: a point due north of Huế at
   * a known separation. One degree of latitude is ~111.19 km, which is what makes the offsets
   * below land where they are meant to.
   */
  const hue = cityForAlias('hue')!.coords
  const KM_PER_DEGREE_LAT = 111.19
  const northOf = (km: number): readonly [number, number] => [hue[0] + km / KM_PER_DEGREE_LAT, hue[1]]

  it('the constructed offsets really are the distances they claim', () => {
    // Without this the three assertions below would be testing the helper, not the guard.
    for (const km of [1, 24.9, 25, 25.1, 100]) {
      expect(haversineKm(hue, northOf(km))).toBeCloseTo(km, 1)
    }
  })

  it.each([
    [1, true],
    [20, true],
    [24.5, true],
    [25.5, false],
    [30, false],
    [165, false],
    [364, false],
  ])('%s km from the city → accepted: %s', (km, accepted) => {
    expect(isSameCity(hue, northOf(km))).toBe(accepted)
  })

  /**
   * The tie-break, pinned as an equivalence rather than by constructing a point at exactly
   * 25.000000 km.
   *
   * 🚨 An earlier version of this test did try that, using 111.19 km per degree of latitude. The
   * point it produced was 25.00x km out, so `<=` said false and the test failed — it was measuring
   * the approximation, not the guard. A boundary assertion that depends on floating-point luck is
   * worse than none: it fails for a reason that has nothing to do with the behaviour it names.
   */
  it('acceptance is exactly "distance <= radius", inclusive', () => {
    for (const km of [0, 1, 12.5, 24.9, 25.05, 26, 50, 200]) {
      const point = northOf(km)
      expect(isSameCity(hue, point)).toBe(haversineKm(hue, point) <= CITY_MATCH_RADIUS_KM)
    }
    // And the city itself is trivially inside, which a sign error would break.
    expect(isSameCity(hue, hue)).toBe(true)
  })

  it('the boundary holds through getWeather, not only in the helper', async () => {
    const justOutside = northOf(CITY_MATCH_RADIUS_KM + 5)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Somewhere', 'Vietnam', justOutside)), { status: 200 },
    )))
    let getWeather = await freshGetWeather()
    expect(await getWeather('Huế', 'vi')).toHaveProperty('error')

    const justInside = northOf(CITY_MATCH_RADIUS_KM - 5)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(providerPayload('Somewhere', 'Vietnam', justInside)), { status: 200 },
    )))
    getWeather = await freshGetWeather()
    expect(await getWeather('Huế', 'vi')).not.toHaveProperty('error')
  })
})
