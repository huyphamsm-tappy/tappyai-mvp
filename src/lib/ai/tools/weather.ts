import { normalizeVN } from '@/lib/ai/intent'
import { getCache, setCache } from './common'

// ===== WEATHER: wttr.in (free, no API key) =====
export async function getWeather(location: string) {
  const cacheKey = 'weather:' + (location || '').toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const cityMap: Record<string, string> = {
    'ha noi': 'Hanoi', 'hanoi': 'Hanoi', 'hn': 'Hanoi',
    'ho chi minh': 'Ho Chi Minh City', 'tp hcm': 'Ho Chi Minh City', 'hcm': 'Ho Chi Minh City', 'sai gon': 'Ho Chi Minh City', 'saigon': 'Ho Chi Minh City', 'tphcm': 'Ho Chi Minh City',
    'da nang': 'Da Nang', 'danang': 'Da Nang',
    'hue': 'Hue', 'can tho': 'Can Tho', 'hai phong': 'Hai Phong',
    'nha trang': 'Nha Trang', 'da lat': 'Da Lat', 'dalat': 'Da Lat',
    'vung tau': 'Vung Tau', 'hoi an': 'Hoi An', 'phu quoc': 'Phu Quoc',
  }
  const norm = normalizeVN((location || '').toLowerCase().trim())
  const place = cityMap[norm] || location || 'Hanoi'
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
    result = {
      location: data.nearest_area?.[0]?.areaName?.[0]?.value || place,
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
    result = { error: 'Khong lay duoc du lieu thoi tiet luc nay', note: 'Xem thoi tiet tai: ' + fallbackUrl, search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut
  return result
}

// ===== GOLD PRICE: vang.today (free, no API key) =====
export async function getGoldPrice(query: string) {
  const cacheKey = 'gold:' + (query || '').toLowerCase().trim()
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
        unit: 'VND/luong cho vang trong nuoc (1 luong = 10 chi = 37.5g), USD/oz cho vang the gioi (XAUUSD)',
        updated_time: data.time, updated_date: data.date,
        prices: list,
      }
    } else {
      throw new Error('no data')
    }
  } catch {
    result = { error: 'Khong lay duoc gia vang luc nay', note: 'Xem gia vang tai: ' + fallbackUrl, search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 5 * 60 * 1000) // cache 5 phut, gia vang cap nhat thuong xuyen
  return result
}
