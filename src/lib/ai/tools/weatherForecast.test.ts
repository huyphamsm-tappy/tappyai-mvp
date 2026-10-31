import { describe, it, expect } from 'vitest'
import { getWeatherForecast, weatherCodeText, FORECAST_MAX_DAYS } from './weatherForecast'

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
    expect(urls[1]).toContain('forecast_hours=12')
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
    expect(weatherCodeText(95, 'en')).toBe('thunderstorm')
    expect(weatherCodeText(42, 'vi')).toBe('không rõ')
  })
})
