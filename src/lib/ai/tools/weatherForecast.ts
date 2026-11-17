// ── Daily weather forecast, up to 10 days (CONSULT_ONE_BRAIN, 28/10/2026) ─────────────────────────────────────────────────────────────
//
// Measured 28/10 on localhost: "cuối tuần này Đà Nẵng thời tiết thế nào" could not be answered — get_weather (wttr.in) gives the current
// conditions and today only. Open-Meteo (open-meteo.com) serves a free daily forecast with no key: one geocoding call for the place name,
// one forecast call. Only the place name the model passes leaves the server; nothing about the person. Every failure is a structured error
// the model reports as a failed lookup, never a guess.

//
// 14/11/2026 (measured on the 24-turn baseline, 8 of them asked for weather): 4 failed with place_not_found in ~1 s and 6 with
// forecast_unavailable after ~7.5 s. Cause 1: the geocoder does not know "TP Hồ Chí Minh" or "Vĩnh Hy, Ninh Thuận" (a name + province it has no
// row for) although it knows "Hồ Chí Minh" and "Vĩnh Hy" — the lookup now falls back, only after a miss, to the name without an
// administrative prefix and to the first name with the rest as a check (a same-named place in another province is rejected), then to the
// wider area; the place it matched is in `location`. Cause 2: api.open-meteo.com did not accept a TCP connection from the test machine
// (connect timeout; the same URL answered ECONNRESET from a second route, so it is the service, not one network) while the geocoder host
// answered in 1 s. When it fails, MET Norway's locationforecast (api.met.no, free, no key, asks for an identifying User-Agent) answers
// from the same coordinates; only a latitude and longitude leave the server.
const GEO = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const MET = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
const MET_UA = 'TappyAI/1.0 https://www.tappyai.com'
const TIMEOUT_MS = 6000
/** The forecast host normally answers in well under a second: waiting the full 6 s before the fallback is the cost of an outage. */
const FORECAST_TIMEOUT_MS = 4000
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

async function getJson(url: string, fetchFn: typeof fetch, timeoutMs = TIMEOUT_MS, headers: Record<string, string> = {}): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetchFn(url, { signal: ctrl.signal, headers: { accept: 'application/json', ...headers } })
    if (!r.ok) throw new Error(`http_${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

/** 14/11/2026 (measured: "ngày mai có mưa không, mấy giờ?" answered "chưa có giờ mưa cụ thể" while the hourly data held it — rain 13:00–19:00, peak 16:00):
 *  the tool only handed over the NEXT 12 hours, so a question about tomorrow's hours had no hours to read. Each day now carries its rain WINDOWS,
 *  computed from the hourly series of the whole horizon: runs of hours with a chance ≥ 50 % or ≥ 0.2 mm. `to` is the end of the last rainy hour. */
export interface RainWindow { from: string; to: string; max_chance_pct: number | null; rain_mm: number | null }
export interface ForecastDay { date: string; summary: string; temp_min_c: number | null; temp_max_c: number | null; rain_chance_pct: number | null; rain_mm: number | null; wind_max_kmh: number | null; rain_windows?: RainWindow[] }
const RAIN_CHANCE_PCT = 50
const RAIN_MM = 0.2
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
/** Rows of ONE day, in hour order → the runs of rainy hours. A gap in the hours ends a run. */
export function rainWindows(rows: Array<{ hour: number; chance: number | null; mm: number | null }>): RainWindow[] {
  const out: RainWindow[] = []
  let cur: { from: number; last: number; max: number | null; mm: number } | null = null
  for (const r of rows) {
    const rainy = (r.chance !== null && r.chance >= RAIN_CHANCE_PCT) || (r.mm !== null && r.mm >= RAIN_MM)
    if (!rainy) { if (cur) { out.push({ from: hh(cur.from), to: hh(cur.last + 1), max_chance_pct: cur.max, rain_mm: num(cur.mm) }); cur = null } continue }
    if (cur && r.hour === cur.last + 1) { cur.last = r.hour; cur.max = r.chance === null ? cur.max : Math.max(cur.max ?? 0, r.chance); cur.mm += r.mm ?? 0 }
    else {
      if (cur) out.push({ from: hh(cur.from), to: hh(cur.last + 1), max_chance_pct: cur.max, rain_mm: num(cur.mm) })
      cur = { from: r.hour, last: r.hour, max: r.chance, mm: r.mm ?? 0 }
    }
  }
  if (cur) out.push({ from: hh(cur.from), to: hh(cur.last + 1), max_chance_pct: cur.max, rain_mm: num(cur.mm) })
  return out
}
/** 01/11/2026 (measured T12, "you said rain tonight, why is it dry now"): the daily rows cannot answer now / tonight / the next hours,
 *  so the same call also returns the conditions now and the next 12 hours, local time of the place. */
export interface ForecastNow { time: string; summary: string; temp_c: number | null; humidity_pct: number | null; rain_mm: number | null }
export interface ForecastHour { time: string; summary: string; temp_c: number | null; rain_chance_pct: number | null; rain_mm: number | null }
export const FORECAST_NEXT_HOURS = 12
export type ForecastResult =
  | { location: string; country: string | null; now: ForecastNow | null; next_hours: ForecastHour[]; days: ForecastDay[]; source: 'open-meteo.com' | 'met.no'; /** 17/11: the source's own site, so the answer can LINK its source (urlGrants: a 'source' reference) */ source_url: string; fetched_at: string; timezone: string }
  | { error: 'place_not_found' | 'forecast_unavailable'; note: string }
type ForecastOk = Exclude<ForecastResult, { error: unknown }>

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null)

interface GeoHit { name?: string; country?: string; admin1?: string; latitude?: number; longitude?: number; timezone?: string; feature_code?: string }
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
/** "TP. Hồ Chí Minh" → "Hồ Chí Minh": the administrative word people put in front of a Vietnamese place name (not part of the name the geocoder holds). */
function stripAdminPrefix(s: string): string {
  const t = s.normalize('NFC').trim()
  const m = /^(?:tp|t\.p|thanh pho|tinh|quan|huyen|thi xa|thi tran)(?:\.|\s)\s*/.exec(fold(t))
  return m ? t.slice(m[0].length).trim() : t
}

/** The place a name means. Whole text first (as before); only after a miss: without the administrative prefix, the first name checked against the
 *  rest of the text (province / country), then the wider area. A country-level hit is never taken for a city. */
async function locate(name: string, lang: string, fetchFn: typeof fetch): Promise<GeoHit | null> {
  const ask = async (q: string, quals: string[]): Promise<GeoHit | null> => {
    const g = await getJson(`${GEO}?name=${encodeURIComponent(q)}&count=${quals.length ? 5 : 1}&language=${lang === 'en' ? 'en' : 'vi'}&format=json`, fetchFn) as { results?: GeoHit[] }
    const rows = (g?.results ?? []).filter(r => typeof r.latitude === 'number' && typeof r.longitude === 'number' && !String(r.feature_code ?? '').startsWith('PCL'))
    if (!quals.length) return rows[0] ?? null
    const wanted = quals.map(fold).filter(Boolean)
    return rows.find(r => { const where = fold([r.admin1, r.country, r.name].filter(Boolean).join(' ')); return wanted.some(w => where.includes(w)) }) ?? null
  }
  const whole = await ask(name, [])
  if (whole) return whole
  const segs = name.split(/[,;]/).map(s => stripAdminPrefix(s)).filter(Boolean)
  if (segs.length > 1) { const h = await ask(segs[0], segs.slice(1)); if (h) return h }
  else if (segs[0] && segs[0] !== name) { const h = await ask(segs[0], []); if (h) return h }
  for (const s of segs.slice(1)) { const h = await ask(s, []); if (h) return h }
  return null
}

const LOCAL_FMT = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function localParts(d: Date, fmt: Intl.DateTimeFormat) { const o: Record<string, string> = {}; for (const p of fmt.formatToParts(d)) o[p.type] = p.value; return o }

/** MET Norway symbol codes ("lightrain_day", "partlycloudy_night", "heavyrainandthunder"…) in the same words as the WMO table. */
export function metSymbolText(code: string | undefined, lang: string): string {
  const vi = lang !== 'en'
  const s = String(code ?? '').replace(/_(day|night|polartwilight)$/, '')
  if (!s) return vi ? 'không rõ' : 'unknown'
  if (/thunder/.test(s)) return vi ? 'dông' : 'thunderstorm'
  if (/snow/.test(s)) return vi ? 'tuyết' : 'snow'
  if (/heavy(rain|sleet)/.test(s)) return vi ? 'mưa to' : 'heavy rain'
  if (/light(rain|sleet)/.test(s)) return vi ? 'mưa nhẹ' : 'light rain'
  if (/rain|sleet/.test(s)) return vi ? 'mưa' : 'rain'
  if (s === 'fog') return vi ? 'sương mù' : 'fog'
  if (s === 'clearsky') return vi ? 'trời quang' : 'clear sky'
  if (/^(fair|partlycloudy)$/.test(s)) return vi ? 'ít mây, có nắng' : 'partly cloudy'
  if (s === 'cloudy') return vi ? 'nhiều mây' : 'overcast'
  return vi ? 'không rõ' : 'unknown'
}

interface MetStep {
  time?: string
  data?: {
    instant?: { details?: Record<string, number> }
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
  }
}

/** MET Norway answer in the shape the tool returns (no rain probability: the service does not give one → null). Null when it has no usable series. */
async function metForecast(hit: GeoHit, n: number, tz: string, lang: string, fetchFn: typeof fetch, now: Date): Promise<ForecastOk | null> {
  const j = await getJson(`${MET}?lat=${Number(hit.latitude).toFixed(4)}&lon=${Number(hit.longitude).toFixed(4)}`, fetchFn, TIMEOUT_MS, { 'user-agent': MET_UA }) as { properties?: { timeseries?: MetStep[] } }
  const steps = (j?.properties?.timeseries ?? []).filter(s => typeof s.time === 'string' && !Number.isNaN(Date.parse(s.time)) && s.data?.instant?.details)
  if (!steps.length) return null
  const fmt = LOCAL_FMT(tz)
  const day = (t: string) => { const o = localParts(new Date(t), fmt); return `${o.year}-${o.month}-${o.day}` }
  const clock = (t: string) => { const o = localParts(new Date(t), fmt); return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}` }
  let i0 = 0
  steps.forEach((s, i) => { if (Date.parse(s.time!) <= now.getTime()) i0 = i })
  const first = steps[i0]
  const d1 = first.data!.next_1_hours
  const rain = (s: MetStep) => s.data?.next_1_hours?.details?.precipitation_amount ?? s.data?.next_6_hours?.details?.precipitation_amount
  const hourly = steps.slice(i0).filter(s => s.data?.next_1_hours).slice(0, FORECAST_NEXT_HOURS)
  const byDay = new Map<string, MetStep[]>()
  for (const s of steps) { const k = day(s.time!); byDay.set(k, [...(byDay.get(k) ?? []), s]) }
  const today = day(now.toISOString())
  const days: ForecastDay[] = [...byDay.entries()].filter(([k]) => k >= today).slice(0, n).map(([date, ss]) => {
    const temps = ss.map(s => s.data!.instant!.details!.air_temperature).filter((v): v is number => typeof v === 'number')
    const winds = ss.map(s => s.data!.instant!.details!.wind_speed).filter((v): v is number => typeof v === 'number')
    const rains = ss.map(rain).filter((v): v is number => typeof v === 'number')
    const words = ss.map(s => metSymbolText(s.data?.next_6_hours?.summary?.symbol_code ?? s.data?.next_1_hours?.summary?.symbol_code, lang)).filter(w => w !== (lang === 'en' ? 'unknown' : 'không rõ'))
    const count = new Map<string, number>(); for (const w of words) count.set(w, (count.get(w) ?? 0) + 1)
    const summary = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (lang === 'en' ? 'unknown' : 'không rõ')
    // Only the hourly part of the series (the first ~2.5 days) can say at which hours it rains; later days have 6-hour blocks and carry no windows.
    const hourRows = ss.filter(s => s.data?.next_1_hours).map(s => ({ hour: Number(clock(s.time!).slice(11, 13)), chance: null, mm: num(s.data!.next_1_hours!.details?.precipitation_amount) }))
    return { ...(hourRows.length ? { rain_windows: rainWindows(hourRows) } : {}), date, summary, temp_min_c: temps.length ? num(Math.min(...temps)) : null, temp_max_c: temps.length ? num(Math.max(...temps)) : null, rain_chance_pct: null, rain_mm: rains.length ? num(rains.reduce((a, b) => a + b, 0)) : null, wind_max_kmh: winds.length ? num(Math.max(...winds) * 3.6) : null }
  })
  if (!days.length) return null
  const fd = first.data!.instant!.details!
  return {
    location: [hit.name, hit.country].filter(Boolean).join(', '),
    country: hit.country ?? null,
    now: { time: clock(first.time!), summary: metSymbolText(d1?.summary?.symbol_code ?? first.data?.next_6_hours?.summary?.symbol_code, lang), temp_c: num(fd.air_temperature), humidity_pct: num(fd.relative_humidity), rain_mm: num(d1?.details?.precipitation_amount) },
    next_hours: hourly.map(s => ({ time: clock(s.time!), summary: metSymbolText(s.data!.next_1_hours!.summary?.symbol_code, lang), temp_c: num(s.data!.instant!.details!.air_temperature), rain_chance_pct: null, rain_mm: num(s.data!.next_1_hours!.details?.precipitation_amount) })),
    days,
    source: 'met.no',
    source_url: 'https://www.met.no/en',
    fetched_at: now.toISOString(),
    timezone: tz,
  }
}

export async function getWeatherForecast(place: string, days: number, lang = 'vi', fetchFn: typeof fetch = fetch, now: Date = new Date()): Promise<ForecastResult> {
  const n = Math.max(1, Math.min(FORECAST_MAX_DAYS, Math.round(days) || 7))
  const name = place.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80)
  if (!name) return { error: 'place_not_found', note: 'No place name was given.' }
  let located: { hit: GeoHit; tz: string } | null = null
  try {
    const hit = await locate(name, lang, fetchFn)
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return { error: 'place_not_found', note: `The forecast service did not recognise "${name}". Ask for or try the city name.` }
    const tz = typeof hit.timezone === 'string' && hit.timezone ? hit.timezone : 'Asia/Ho_Chi_Minh'
    located = { hit, tz }
    return await openMeteoForecast(hit, n, tz, lang, fetchFn, now)
  } catch (e) {
    // The primary forecast host failed or sent nothing usable: the same coordinates go to the second source before the lookup is called failed.
    if (located) {
      try {
        const alt = await metForecast(located.hit, n, located.tz, lang, fetchFn, now)
        if (alt) return alt
      } catch { /* fall through to the structured error */ }
    }
    return { error: 'forecast_unavailable', note: `The forecast service failed (${e instanceof Error ? e.message.slice(0, 40) : 'error'}). This lookup FAILED; do not guess the weather.` }
  }
}

class NoDays extends Error { constructor() { super('no_days') } }

async function openMeteoForecast(hit: GeoHit, n: number, tz: string, lang: string, fetchFn: typeof fetch, now: Date): Promise<ForecastOk> {
  {
    const q = new URLSearchParams({
      latitude: String(hit.latitude), longitude: String(hit.longitude),
      current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max', timezone: tz, forecast_days: String(n),
    })
    const f = await getJson(`${FORECAST}?${q.toString()}`, fetchFn, FORECAST_TIMEOUT_MS) as { daily?: Record<string, unknown[]>; hourly?: Record<string, unknown[]>; current?: Record<string, unknown> }
    const d = f?.daily
    const dates = Array.isArray(d?.time) ? d!.time as string[] : []
    if (!dates.length) throw new NoDays()
    const at = (k: string, i: number) => (Array.isArray(d?.[k]) ? (d![k] as unknown[])[i] : undefined)
    const h = f?.hourly
    const hAt = (k: string, i: number) => (Array.isArray(h?.[k]) ? (h![k] as unknown[])[i] : undefined)
    const allHours = Array.isArray(h?.time) ? h!.time as string[] : []
    const c = f?.current
    // The hourly series now spans the whole horizon (from 00:00 today): "the next 12 hours" start at the current hour, the rain windows use all of it.
    const start = typeof c?.time === 'string' ? Math.max(0, allHours.findIndex(t => t >= String(c.time))) : 0
    const hours = allHours.slice(start, start + FORECAST_NEXT_HOURS)
    const windowsOf = (date: string) => {
      const rows: Array<{ hour: number; chance: number | null; mm: number | null }> = []
      allHours.forEach((t, i) => { if (t.startsWith(date)) rows.push({ hour: Number(t.slice(11, 13)), chance: num(hAt('precipitation_probability', i)), mm: num(hAt('precipitation', i)) }) })
      return rows.length ? { rain_windows: rainWindows(rows) } : {}
    }
    return {
      location: [hit.name, hit.country].filter(Boolean).join(', '),
      country: hit.country ?? null,
      now: c && typeof c.time === 'string'
        ? { time: c.time, summary: weatherCodeText(Number(c.weather_code), lang), temp_c: num(c.temperature_2m), humidity_pct: num(c.relative_humidity_2m), rain_mm: num(c.precipitation) }
        : null,
      next_hours: hours.map((time, j) => { const i = start + j; return { time, summary: weatherCodeText(Number(hAt('weather_code', i)), lang), temp_c: num(hAt('temperature_2m', i)), rain_chance_pct: num(hAt('precipitation_probability', i)), rain_mm: num(hAt('precipitation', i)) } }),
      days: dates.map((date, i) => ({ date, summary: weatherCodeText(Number(at('weather_code', i)), lang), temp_min_c: num(at('temperature_2m_min', i)), temp_max_c: num(at('temperature_2m_max', i)), rain_chance_pct: num(at('precipitation_probability_max', i)), rain_mm: num(at('precipitation_sum', i)), wind_max_kmh: num(at('wind_speed_10m_max', i)), ...windowsOf(date) })),
      source: 'open-meteo.com',
      source_url: 'https://open-meteo.com/',
      fetched_at: now.toISOString(),
      timezone: tz,
    }
  }
}
