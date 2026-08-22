import { getCache, setCache } from './common'
import { messages } from '@/lib/ai/messages'
import { goldCacheKey, weatherCacheKey, weatherPlaceResolution } from './cacheKeys'

// ===== WEATHER: wttr.in (free, no API key) =====
export async function getWeather(location: string, lang = 'vi') {
  // Resolve BEFORE keying: wttr.in is called for the canonical city, so every
  // spelling that resolves to it ("Hà Nội", "ha noi", "HN") is one upstream call
  // and must share one entry. It used to be three keys for one result.
  const { query: place, expectedCountry } = weatherPlaceResolution(location)
  const cacheKey = weatherCacheKey(location, lang)
  const cached = getCache(cacheKey)
  if (cached) return cached
  const fallbackUrl = 'https://www.google.com/search?q=' + encodeURIComponent('thoi tiet ' + place)

  let result: unknown
  try {
    const resp = await Promise.race([
      fetch('https://wttr.in/' + encodeURIComponent(place) + '?format=j1', {
        headers: { 'User-Agent': 'curl/8.0', 'Accept': 'application/json' }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const data = await (resp as Response).json()
    const cur = data.current_condition?.[0]
    const today = data.weather?.[0]
    if (!cur) throw new Error('no data')

    // ── The geocoder answered about somewhere else ────────────────────────────────────────────
    //
    // 🚨 This is the deterministic half of the Da Nang / Hue / Ha Long fix, and it is here
    // because the map alone is not a guarantee. The map makes the OUTGOING string unambiguous;
    // this checks the INCOMING answer actually came from the country we asked about.
    //
    // It exists because the failure mode is not an error — it is a confident wrong number. When
    // "Da Nang" resolved to Karlsruhe the tool returned a perfectly well-formed result and the
    // model reported 12°C for a city that was 35°C. Nothing downstream could tell.
    //
    // Refusing is the right answer, not "return it and let the model notice": the model DID
    // sometimes notice, and what the user then saw was the assistant narrating its own
    // correction mid-answer. A tool that cannot answer the question asked must say so.
    //
    // Scoped to a KNOWN mismatch. `expectedCountry` is null for free-form locations (Paris,
    // Tokyo), where any country is legitimate, and a missing `nearest_area` is not evidence of
    // anything — the provider is intermittently flaky, and refusing on absent metadata would
    // turn a hiccup into an outage.
    const resolvedCountry: string | null = data.nearest_area?.[0]?.country?.[0]?.value ?? null
    if (expectedCountry && resolvedCountry && resolvedCountry !== expectedCountry) {
      console.error(JSON.stringify({
        type: 'tappyai_weather_country_mismatch',
        requested: location, sent: place, expectedCountry, resolvedCountry,
        resolvedArea: data.nearest_area?.[0]?.areaName?.[0]?.value ?? null,
      }))
      throw new Error('country mismatch')
    }

    result = {
      location: data.nearest_area?.[0]?.areaName?.[0]?.value || place,
      // Returned so the answer can never claim a place it did not come from. The guard above
      // stops the known-wrong case; this keeps the honest case attributable.
      country: resolvedCountry,
      temp_C: cur.temp_C,
      feels_like_C: cur.FeelsLikeC,
      condition: cur.weatherDesc?.[0]?.value?.trim(),
      humidity_percent: cur.humidity,
      wind_kmph: cur.windspeedKmph,
      today_max_C: today?.maxtempC,
      today_min_C: today?.mintempC,
      chance_of_rain_percent: today?.hourly?.find((h: { time: string }) => h.time === '1200')?.chanceofrain ?? today?.hourly?.[4]?.chanceofrain,
      source: 'wttr.in',
    }
  } catch {
    result = { error: messages.weather.fetchError(lang), note: messages.weather.seeAt(lang, fallbackUrl), search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut
  return result
}

// ===== GOLD PRICE: vang.today (free, no API key) =====
export async function getGoldPrice(query: string, lang = 'vi') {
  // `query` is accepted for the tool schema but never read below: the upstream
  // URL is fixed and the code list is fixed, so the result is identical for
  // every phrasing. Keying on it split one answer across "giá vàng", "vàng SJC",
  // "SJC", "" — all of them the same fetch.
  void query
  const cacheKey = goldCacheKey(lang)
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://www.vang.today'
  let result: unknown
  try {
    const resp = await Promise.race([
      fetch('https://www.vang.today/api/prices', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const data = await (resp as Response).json()
    if (data?.success && data.prices && typeof data.prices === 'object') {
      const wanted = ['SJL1L10', 'SJ9999', 'PQHN24NTT', 'PQHNVM', 'DOHNL', 'XAUUSD']
      type GoldEntry = { name: string; buy: number; sell: number; change_buy: number; change_sell: number; currency: string }
      const entries = Object.entries(data.prices as Record<string, GoldEntry>)
      const filtered = entries.filter(([code]) => wanted.includes(code))
      const list = (filtered.length ? filtered : entries).map(([code, v]) => ({ type_code: code, ...v }))
      result = {
        source: 'vang.today',
        unit: messages.gold.unit(lang),
        updated_time: data.time, updated_date: data.date,
        prices: list,
      }
    } else {
      throw new Error('no data')
    }
  } catch {
    result = { error: messages.gold.fetchError(lang), note: messages.gold.seeAt(lang, fallbackUrl), search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 5 * 60 * 1000) // cache 5 phut, gia vang cap nhat thuong xuyen
  return result
}
