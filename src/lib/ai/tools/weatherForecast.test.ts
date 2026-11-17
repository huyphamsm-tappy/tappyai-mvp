import { describe, it, expect } from 'vitest'
import { getWeatherForecast, weatherCodeText, metSymbolText, rainWindows, FORECAST_MAX_DAYS } from './weatherForecast'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('getWeatherForecast (Open-Meteo, no key)', () => {
  it('geocodes the place, asks for the days, and returns one plain row per day with the source and time', async () => {
    const urls: string[] = []
    const fetchFn = (async (u: string) => {
      urls.push(String(u))
      if (String(u).includes('geocoding-api')) return ok({ results: [{ name: 'Đà Nẵng', country: 'Việt Nam', latitude: 16.07, longitude: 108.22, timezone: 'Asia/Ho_Chi_Minh' }] })
      return ok({ daily: { time: ['2026-10-31', '2026-11-01'], weather_code: [61, 2], temperature_2m_max: [28.44, 29], temperature_2m_min: [23, 23.5], precipitation_probability_max: [80, 20], precipitation_sum: [12.3, 0.4], wind_speed_10m_max: [18, 12] } })
    }) as unknown as typeof fetch
    const r = await getWeatherForecast('Đà Nẵng', 4, 'vi', fetchFn, new Date('2026-10-28T16:00:00Z'))
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.location).toBe('Đà Nẵng, Việt Nam')
    expect(r.days).toEqual([
      { date: '2026-10-31', summary: 'mưa', temp_min_c: 23, temp_max_c: 28.4, rain_chance_pct: 80, rain_mm: 12.3, wind_max_kmh: 18 },
      { date: '2026-11-01', summary: 'ít mây, có nắng', temp_min_c: 23.5, temp_max_c: 29, rain_chance_pct: 20, rain_mm: 0.4, wind_max_kmh: 12 },
    ])
    expect(r.source).toBe('open-meteo.com')
    expect(r.fetched_at).toBe('2026-10-28T16:00:00.000Z')
    expect(urls[0]).toContain('name=%C4%90%C3%A0%20N%E1%BA%B5ng')
    expect(urls[1]).toContain('forecast_days=4')
    expect(urls[1]).toContain('timezone=Asia%2FHo_Chi_Minh')
  })
  it('01/11 (measured T12 "you said rain tonight, it is dry now"): one call also returns the weather NOW and the next 12 hours hour by hour', async () => {
    const urls: string[] = []
    const fetchFn = (async (u: string) => {
      urls.push(String(u))
      if (String(u).includes('geocoding-api')) return ok({ results: [{ name: 'Thành phố Hồ Chí Minh', country: 'Việt Nam', latitude: 10.82, longitude: 106.63, timezone: 'Asia/Ho_Chi_Minh' }] })
      return ok({
        current: { time: '2026-10-30T19:00', temperature_2m: 28.04, relative_humidity_2m: 79, precipitation: 0, weather_code: 3 },
        hourly: { time: ['2026-10-30T19:00', '2026-10-30T20:00', '2026-10-30T21:00'], temperature_2m: [28, 27.6, 27.1], precipitation_probability: [10, 19, 45], precipitation: [0, 0, 0.6], weather_code: [3, 3, 80] },
        daily: { time: ['2026-10-30'], weather_code: [80], temperature_2m_max: [33], temperature_2m_min: [25], precipitation_probability_max: [70], precipitation_sum: [4.2], wind_speed_10m_max: [14] },
      })
    }) as unknown as typeof fetch
    const r = await getWeatherForecast('Sài Gòn', 1, 'vi', fetchFn, new Date('2026-10-30T12:07:00Z'))
    if ('error' in r) throw new Error('unexpected error')
    expect(r.now).toEqual({ time: '2026-10-30T19:00', summary: 'nhiều mây', temp_c: 28, humidity_pct: 79, rain_mm: 0 })
    expect(r.next_hours).toEqual([
      { time: '2026-10-30T19:00', summary: 'nhiều mây', temp_c: 28, rain_chance_pct: 10, rain_mm: 0 },
      { time: '2026-10-30T20:00', summary: 'nhiều mây', temp_c: 27.6, rain_chance_pct: 19, rain_mm: 0 },
      { time: '2026-10-30T21:00', summary: 'mưa', temp_c: 27.1, rain_chance_pct: 45, rain_mm: 0.6 },
    ])
    expect(r.days).toHaveLength(1)
    expect(urls[1]).toContain('current=temperature_2m%2Crelative_humidity_2m%2Cprecipitation%2Cweather_code')
    expect(urls[1]).toContain('hourly=temperature_2m%2Cprecipitation_probability%2Cprecipitation%2Cweather_code')
    expect(urls[1]).not.toContain('forecast_hours') // 14/11: the hourly series spans the whole horizon now; "next 12 hours" is cut from it at the current hour
  })
  it('14/11 ("ngày mai mấy giờ mưa?" had no hours to read): the next 12 hours start at the CURRENT hour of a whole-horizon series, and each day carries its rain windows', async () => {
    const hrs = (d: string) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)
    const times = [...hrs('2026-11-14'), ...hrs('2026-11-15')]
    const chance = times.map(t => (t.startsWith('2026-11-15') && +t.slice(11, 13) >= 13 && +t.slice(11, 13) <= 19 ? 70 : 5))
    const mm = times.map(t => (t === '2026-11-15T16:00' ? 5.2 : t.startsWith('2026-11-15') && +t.slice(11, 13) >= 13 && +t.slice(11, 13) <= 19 ? 0.4 : 0))
    const fetchFn = (async (u: string) => String(u).includes('geocoding')
      ? ok({ results: [{ name: 'Thành phố Hồ Chí Minh', country: 'Việt Nam', latitude: 10.82, longitude: 106.63, timezone: 'Asia/Ho_Chi_Minh' }] })
      : ok({
        current: { time: '2026-11-14T15:00', temperature_2m: 31, relative_humidity_2m: 70, precipitation: 0, weather_code: 3 },
        hourly: { time: times, temperature_2m: times.map(() => 30), precipitation_probability: chance, precipitation: mm, weather_code: times.map(() => 3) },
        daily: { time: ['2026-11-14', '2026-11-15'], weather_code: [3, 95] },
      })) as unknown as typeof fetch
    const r = await getWeatherForecast('TP.HCM', 2, 'vi', fetchFn)
    if ('error' in r) throw new Error('unexpected error')
    expect(r.next_hours).toHaveLength(12)
    expect(r.next_hours[0].time).toBe('2026-11-14T15:00')
    expect(r.next_hours[11].time).toBe('2026-11-15T02:00')
    expect(r.days[0].rain_windows).toEqual([])
    expect(r.days[1].rain_windows).toEqual([{ from: '13:00', to: '20:00', max_chance_pct: 70, rain_mm: 7.6 }])
  })
  it('rainWindows: separate runs stay separate, a dry hour ends a run, 0.2 mm or 50 % counts, the last hour ends at 24:00', () => {
    const row = (hour: number, chance: number | null, mm: number | null) => ({ hour, chance, mm })
    expect(rainWindows([row(1, 10, 0), row(2, 49, 0.1)])).toEqual([])
    expect(rainWindows([row(6, 50, 0), row(7, 10, 0.2), row(8, 10, 0), row(9, 80, 1), row(23, null, 3)])).toEqual([
      { from: '06:00', to: '08:00', max_chance_pct: 50, rain_mm: 0.2 },
      { from: '09:00', to: '10:00', max_chance_pct: 80, rain_mm: 1 },
      { from: '23:00', to: '24:00', max_chance_pct: null, rain_mm: 3 },
    ])
  })
  it('a forecast without the current / hourly blocks still returns its days (now: null, next_hours: [])', async () => {
    const fetchFn = (async (u: string) => String(u).includes('geocoding') ? ok({ results: [{ name: 'Huế', latitude: 16, longitude: 107 }] }) : ok({ daily: { time: ['2026-10-29'], weather_code: [2] } })) as unknown as typeof fetch
    const r = await getWeatherForecast('Huế', 1, 'vi', fetchFn)
    expect(r).toMatchObject({ now: null, next_hours: [], days: [{ date: '2026-10-29', summary: 'ít mây, có nắng' }] })
  })
  it('days are clamped to 1..10', async () => {
    const urls: string[] = []
    const fetchFn = (async (u: string) => { urls.push(String(u)); return String(u).includes('geocoding') ? ok({ results: [{ name: 'X', latitude: 1, longitude: 2 }] }) : ok({ daily: { time: ['2026-10-29'] } }) }) as unknown as typeof fetch
    await getWeatherForecast('X', 40, 'vi', fetchFn)
    await getWeatherForecast('X', 0, 'vi', fetchFn)
    expect(urls[1]).toContain(`forecast_days=${FORECAST_MAX_DAYS}`)
    expect(urls[3]).toContain('forecast_days=7')
  })
  it('an unknown place, an HTTP error or no days are structured errors, never a made-up forecast', async () => {
    const none = (async () => ok({ results: [] })) as unknown as typeof fetch
    expect(await getWeatherForecast('Nowhere', 3, 'vi', none)).toMatchObject({ error: 'place_not_found' })
    const down = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch
    expect(await getWeatherForecast('Huế', 3, 'vi', down)).toMatchObject({ error: 'forecast_unavailable' })
    const empty = (async (u: string) => String(u).includes('geocoding') ? ok({ results: [{ name: 'Huế', latitude: 16, longitude: 107 }] }) : ok({ daily: {} })) as unknown as typeof fetch
    expect(await getWeatherForecast('Huế', 3, 'vi', empty)).toMatchObject({ error: 'forecast_unavailable' })
    expect(await getWeatherForecast('   ', 3, 'vi', none)).toMatchObject({ error: 'place_not_found' })
  })
  it('weather codes read in both languages; an unknown code is said to be unknown', () => {
    expect(weatherCodeText(95, 'vi')).toBe('dông')
  })
})

// 14/11/2026: the two failures measured on the baseline (place not found for "TP Hồ Chí Minh" / "Vĩnh Hy, Ninh Thuận"; the forecast host not answering).
describe('getWeatherForecast — place names the geocoder does not hold, and a forecast host that is down', () => {
  const geoRow = (name: string, admin1: string, extra: Record<string, unknown> = {}) => ({ name, admin1, country: 'Việt Nam', latitude: 10.8, longitude: 106.6, timezone: 'Asia/Ho_Chi_Minh', ...extra })
  const daily = { daily: { time: ['2026-11-14'], weather_code: [2] } }
  const geoUrl = (u: string) => decodeURIComponent(new URL(u).searchParams.get('name') ?? '')

  it('"TP Hồ Chí Minh" (not held) finds "Hồ Chí Minh"; the whole text is still asked first', async () => {
    const asked: string[] = []
    const fetchFn = (async (u: string) => {
      if (!String(u).includes('geocoding')) return ok(daily)
      asked.push(geoUrl(String(u)))
      return ok({ results: geoUrl(String(u)) === 'Hồ Chí Minh' ? [geoRow('Thành phố Hồ Chí Minh', 'Thành phố Hồ Chí Minh')] : [] })
    }) as unknown as typeof fetch
    const r = await getWeatherForecast('TP. Hồ Chí Minh, Việt Nam', 1, 'vi', fetchFn)
    expect(asked[0]).toBe('TP. Hồ Chí Minh, Việt Nam')
    expect(r).toMatchObject({ location: 'Thành phố Hồ Chí Minh, Việt Nam' })
  })
  it('a name + province: the same-named place in ANOTHER province is rejected, the wider area answers and says so in `location`', async () => {
    const fetchFn = (async (u: string) => {
      if (!String(u).includes('geocoding')) return ok(daily)
      const q = geoUrl(String(u))
      if (q === 'Vĩnh Hy') return ok({ results: [geoRow('Vĩnh Hy', 'Gia Lai')] })
      if (q === 'Ninh Thuận') return ok({ results: [geoRow('Ninh Thuận', 'Lam Dong')] })
      return ok({ results: [] })
    }) as unknown as typeof fetch
    const r = await getWeatherForecast('Vĩnh Hy, Ninh Thuận', 1, 'vi', fetchFn)
    if ('error' in r) throw new Error('unexpected error')
    expect(r.location).toBe('Ninh Thuận, Việt Nam')
  })
  it('a qualifier that matches the hit keeps the first name (Phú Quốc, Kiên Giang → Phú Quốc)', async () => {
    const fetchFn = (async (u: string) => {
      if (!String(u).includes('geocoding')) return ok(daily)
      return ok({ results: geoUrl(String(u)) === 'Phú Quốc' ? [geoRow('Phú Quốc', 'Kiên Giang')] : [] })
    }) as unknown as typeof fetch
    expect(await getWeatherForecast('Phú Quốc, Kiên Giang', 1, 'vi', fetchFn)).toMatchObject({ location: 'Phú Quốc, Việt Nam' })
  })
  it('a country-level hit is never taken for a city', async () => {
    const fetchFn = (async (u: string) => String(u).includes('geocoding') ? ok({ results: geoUrl(String(u)) === 'Việt Nam' ? [geoRow('Việt Nam', '', { feature_code: 'PCLI' })] : [] }) : ok(daily)) as unknown as typeof fetch
    expect(await getWeatherForecast('Xyz, Việt Nam', 1, 'vi', fetchFn)).toMatchObject({ error: 'place_not_found' })
  })

  const metBody = {
    properties: {
      timeseries: [
        { time: '2026-11-14T08:00:00Z', data: { instant: { details: { air_temperature: 28.9, relative_humidity: 71.7, wind_speed: 5 } }, next_1_hours: { summary: { symbol_code: 'lightrain_day' }, details: { precipitation_amount: 0.6 } }, next_6_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 3 } } } },
        { time: '2026-11-14T09:00:00Z', data: { instant: { details: { air_temperature: 27.5, wind_speed: 8 } }, next_1_hours: { summary: { symbol_code: 'cloudy' }, details: { precipitation_amount: 0 } }, next_6_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 2 } } } },
        { time: '2026-11-15T08:00:00Z', data: { instant: { details: { air_temperature: 30, wind_speed: 4 } }, next_6_hours: { summary: { symbol_code: 'clearsky_day' }, details: { precipitation_amount: 0 } } } },
      ],
    },
  }
  const downForecast = (calls: Array<{ u: string; ua?: string }>, met: () => Response) => (async (u: string, init?: RequestInit) => {
    const s = String(u)
    calls.push({ u: s, ua: (init?.headers as Record<string, string> | undefined)?.['user-agent'] })
    if (s.includes('geocoding')) return ok({ results: [geoRow('Quy Nhơn', 'Gia Lai', { latitude: 13.78, longitude: 109.22 })] })
    if (s.includes('api.open-meteo.com')) throw new Error('connect timeout')
    return met()
  }) as unknown as typeof fetch

  it('when the forecast host is down, MET Norway answers from the same coordinates (identifying User-Agent, local time, daily rows, no invented rain chance)', async () => {
    const calls: Array<{ u: string; ua?: string }> = []
    const r = await getWeatherForecast('Quy Nhơn', 2, 'vi', downForecast(calls, () => ok(metBody)), new Date('2026-11-14T08:30:00Z'))
    if ('error' in r) throw new Error('unexpected error: ' + r.note)
    expect(r.source).toBe('met.no')
    const met = calls.find(c => c.u.includes('api.met.no'))!
    expect(met.u).toContain('lat=13.7800')
    expect(met.u).toContain('lon=109.2200')
    expect(met.ua).toMatch(/TappyAI/)
    expect(r.now).toEqual({ time: '2026-11-14T15:00', summary: 'mưa nhẹ', temp_c: 28.9, humidity_pct: 71.7, rain_mm: 0.6 })
    expect(r.next_hours.map(h => h.time)).toEqual(['2026-11-14T15:00', '2026-11-14T16:00'])
    expect(r.next_hours[0].rain_chance_pct).toBeNull()
    expect(r.days).toEqual([
      { date: '2026-11-14', summary: 'mưa', temp_min_c: 27.5, temp_max_c: 28.9, rain_chance_pct: null, rain_mm: 0.6, wind_max_kmh: 28.8, rain_windows: [{ from: '15:00', to: '16:00', max_chance_pct: null, rain_mm: 0.6 }] },
      { date: '2026-11-15', summary: 'trời quang', temp_min_c: 30, temp_max_c: 30, rain_chance_pct: null, rain_mm: 0, wind_max_kmh: 14.4 },
    ])
  })
  it('when both sources fail the answer is still a structured failure, never a made-up forecast', async () => {
    const calls: Array<{ u: string }> = []
    expect(await getWeatherForecast('Quy Nhơn', 2, 'vi', downForecast(calls, () => new Response('x', { status: 503 })))).toMatchObject({ error: 'forecast_unavailable' })
    expect(await getWeatherForecast('Quy Nhơn', 2, 'vi', downForecast(calls, () => ok({ properties: { timeseries: [] } })))).toMatchObject({ error: 'forecast_unavailable' })
  })
  it('the first source is tried first and the second is NOT called when it answers', async () => {
    const urls: string[] = []
    const fetchFn = (async (u: string) => { urls.push(String(u)); return String(u).includes('geocoding') ? ok({ results: [geoRow('Huế', 'Huế')] }) : ok(daily) }) as unknown as typeof fetch
    await getWeatherForecast('Huế', 1, 'vi', fetchFn)
    expect(urls.some(u => u.includes('api.met.no'))).toBe(false)
  })
  it('MET symbol codes read in both languages', () => {
    expect(metSymbolText('heavyrainandthunder_day', 'vi')).toBe('dông')
    expect(metSymbolText('lightrainshowers_night', 'en')).toBe('light rain')
    expect(metSymbolText('partlycloudy_day', 'vi')).toBe('ít mây, có nắng')
    expect(metSymbolText(undefined, 'vi')).toBe('không rõ')
  })
})

describe('weather code table', () => {
  it('weather codes read in both languages; an unknown code is said to be unknown', () => {
    expect(weatherCodeText(95, 'vi')).toBe('dông')
    expect(weatherCodeText(95, 'en')).toBe('thunderstorm')
    expect(weatherCodeText(42, 'vi')).toBe('không rõ')
  })
})
