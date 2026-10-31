// ── Daily weather forecast, up to 10 days (CONSULT_ONE_BRAIN, 28/10/2026) ─────────────────────────────────────────────────────────────
//
// Measured 28/10 on localhost: "cuối tuần này Đà Nẵng thời tiết thế nào" could not be answered — get_weather (wttr.in) gives the current
// conditions and today only. Open-Meteo (open-meteo.com) serves a free daily forecast with no key: one geocoding call for the place name,
// one forecast call. Only the place name the model passes leaves the server; nothing about the person. Every failure is a structured error
// the model reports as a failed lookup, never a guess.

const GEO = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const TIMEOUT_MS = 6000
export const FORECAST_MAX_DAYS = 10

/** WMO weather codes (Open-Meteo docs) in Vietnamese / English. */
const WMO: Array<[number[], string, string]> = [
  [[0], 'trời quang', 'clear sky'],
  [[1, 2], 'ít mây, có nắng', 'partly cloudy'],
  [[3], 'nhiều mây', 'overcast'],
  [[45, 48], 'sương mù', 'fog'],
  [[51, 53, 55, 56, 57], 'mưa phùn', 'drizzle'],
  [[61, 63, 66, 80, 81], 'mưa', 'rain'],
  [[65, 67, 82], 'mưa to', 'heavy rain'],
  [[71, 73, 75, 77, 85, 86], 'tuyết', 'snow'],
  [[95], 'dông', 'thunderstorm'],
  [[96, 99], 'dông kèm mưa đá', 'thunderstorm with hail'],
]
export function weatherCodeText(code: number, lang: string): string {
  const row = WMO.find(([codes]) => codes.includes(code))
  return row ? (lang === 'en' ? row[2] : row[1]) : (lang === 'en' ? 'unknown' : 'không rõ')
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetchFn(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error(`http_${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

export interface ForecastDay { date: string; summary: string; temp_min_c: number | null; temp_max_c: number | null; rain_chance_pct: number | null; rain_mm: number | null; wind_max_kmh: number | null }
/** 01/11/2026 (measured T12, "you said rain tonight, why is it dry now"): the daily rows cannot answer now / tonight / the next hours,
 *  so the same call also returns the conditions now and the next 12 hours, local time of the place. */
export interface ForecastNow { time: string; summary: string; temp_c: number | null; humidity_pct: number | null; rain_mm: number | null }
export interface ForecastHour { time: string; summary: string; temp_c: number | null; rain_chance_pct: number | null; rain_mm: number | null }
export const FORECAST_NEXT_HOURS = 12
export type ForecastResult =
  | { location: string; country: string | null; now: ForecastNow | null; next_hours: ForecastHour[]; days: ForecastDay[]; source: 'open-meteo.com'; fetched_at: string; timezone: string }
  | { error: 'place_not_found' | 'forecast_unavailable'; note: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null)

export async function getWeatherForecast(place: string, days: number, lang = 'vi', fetchFn: typeof fetch = fetch, now: Date = new Date()): Promise<ForecastResult> {
  const n = Math.max(1, Math.min(FORECAST_MAX_DAYS, Math.round(days) || 7))
  const name = place.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80)
  if (!name) return { error: 'place_not_found', note: 'No place name was given.' }
  try {
    const geo = await getJson(`${GEO}?name=${encodeURIComponent(name)}&count=1&language=${lang === 'en' ? 'en' : 'vi'}&format=json`, fetchFn) as { results?: Array<{ name?: string; country?: string; latitude?: number; longitude?: number; timezone?: string }> }
    const hit = geo?.results?.[0]
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return { error: 'place_not_found', note: `The forecast service did not recognise "${name}". Ask for or try the city name.` }
    const tz = typeof hit.timezone === 'string' && hit.timezone ? hit.timezone : 'Asia/Ho_Chi_Minh'
    const q = new URLSearchParams({
      latitude: String(hit.latitude), longitude: String(hit.longitude),
      current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code', forecast_hours: String(FORECAST_NEXT_HOURS),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max', timezone: tz, forecast_days: String(n),
    })
    const f = await getJson(`${FORECAST}?${q.toString()}`, fetchFn) as { daily?: Record<string, unknown[]>; hourly?: Record<string, unknown[]>; current?: Record<string, unknown> }
    const d = f?.daily
    const dates = Array.isArray(d?.time) ? d!.time as string[] : []
    if (!dates.length) return { error: 'forecast_unavailable', note: 'The forecast service returned no days. This lookup FAILED; do not guess the weather.' }
    const at = (k: string, i: number) => (Array.isArray(d?.[k]) ? (d![k] as unknown[])[i] : undefined)
    const h = f?.hourly
    const hAt = (k: string, i: number) => (Array.isArray(h?.[k]) ? (h![k] as unknown[])[i] : undefined)
    const hours = Array.isArray(h?.time) ? (h!.time as string[]).slice(0, FORECAST_NEXT_HOURS) : []
    const c = f?.current
    return {
      location: [hit.name, hit.country].filter(Boolean).join(', '),
      country: hit.country ?? null,
      now: c && typeof c.time === 'string'
        ? { time: c.time, summary: weatherCodeText(Number(c.weather_code), lang), temp_c: num(c.temperature_2m), humidity_pct: num(c.relative_humidity_2m), rain_mm: num(c.precipitation) }
        : null,
      next_hours: hours.map((time, i) => ({ time, summary: weatherCodeText(Number(hAt('weather_code', i)), lang), temp_c: num(hAt('temperature_2m', i)), rain_chance_pct: num(hAt('precipitation_probability', i)), rain_mm: num(hAt('precipitation', i)) })),
      days: dates.map((date, i) => ({ date, summary: weatherCodeText(Number(at('weather_code', i)), lang), temp_min_c: num(at('temperature_2m_min', i)), temp_max_c: num(at('temperature_2m_max', i)), rain_chance_pct: num(at('precipitation_probability_max', i)), rain_mm: num(at('precipitation_sum', i)), wind_max_kmh: num(at('wind_speed_10m_max', i)) })),
      source: 'open-meteo.com',
      fetched_at: now.toISOString(),
      timezone: tz,
    }
  } catch (e) {
    return { error: 'forecast_unavailable', note: `The forecast service failed (${e instanceof Error ? e.message.slice(0, 40) : 'error'}). This lookup FAILED; do not guess the weather.` }
  }
}
