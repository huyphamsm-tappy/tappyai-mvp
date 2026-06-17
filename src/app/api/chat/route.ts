import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ===== In-memory cache (theo Vercel instance, giam goi API lap lai cho cung 1 query) =====
type CacheEntry = { data: unknown; expires: number }
const cache = new Map<string, CacheEntry>()

function getCache(key: string): unknown | null {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.data
  if (hit) cache.delete(key)
  return null
}
function setCache(key: string, data: unknown, ttlMs: number) {
  if (cache.size > 300) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
  cache.set(key, { data, expires: Date.now() + ttlMs })
}

// ===== Phan loai nhanh: chitchat (khong can tool) vs can tool =====
function normalizeVN(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}
function classifyIntent(text: string): 'chitchat' | 'tool' {
  const t = normalizeVN(text.toLowerCase().trim())
  if (t.length === 0 || t.length > 40) return 'tool'
  const chitchat = /^(chao|hi|hello|alo|xin chao|cam on|thank|thanks|ok|oke|okie|uh|u|um|tam biet|bye|haha|hehe|hihi|ban la ai|ban ten gi|tappyai la gi|test)/i
  return chitchat.test(t) ? 'chitchat' : 'tool'
}

// ===== BUDGET: extract tu message va filter ket qua tool =====
type Budget = { min: number; max: number; type: 'range' | 'under' | 'around' }

function parseMoneyAmount(numStr: string, unit: string): number | null {
  const n = parseFloat(numStr.replace(/\./g, '').replace(/,/g, '.'))
  if (isNaN(n) || n <= 0) return null
  const u = (unit || '').toLowerCase().trim()
  if (u === 'k') return n * 1000
  if (u === 'tr' || u.startsWith('tri') || u.startsWith('trieu')) return n * 1_000_000
  if (u === 'ngan' || u.startsWith('nghin')) return n * 1000
  if (!u && n > 0 && n <= 9999) return n * 1000 // "300" → 300.000đ heuristic
  return n
}

function extractBudget(userMessage: string): Budget | null {
  const t = normalizeVN(userMessage.toLowerCase())
  const N = '([\\d][\\d.,]*)'
  const U = '\\s*(k|tr|trieu|ngan|nghin)?'

  // Range: "300k-500k" / "tu 300k den 500k" / "300.000-500.000"
  const rangeRe = new RegExp(`(?:tu\\s+)?${N}${U}\\s*(?:den|toi|-)\\s*${N}${U}`)
  let m = t.match(rangeRe)
  if (m) {
    const min = parseMoneyAmount(m[1], m[2] || '')
    const max = parseMoneyAmount(m[3], m[4] || '')
    if (min !== null && max !== null && max >= min && max > 0) return { min, max, type: 'range' as const }
  }

  // Under: "duoi / khong qua / toi da X"
  const underRe = new RegExp(`(?:duoi|khong qua|toi da)\\s+${N}${U}`)
  m = t.match(underRe)
  if (m) {
    const max = parseMoneyAmount(m[1], m[2] || '')
    if (max !== null && max > 0) return { min: 0, max, type: 'under' as const }
  }

  // Around: "tam / khoang X" → ±20%
  const aroundRe = new RegExp(`(?:tam|khoang|xap xi)\\s+${N}${U}`)
  m = t.match(aroundRe)
  if (m) {
    const base = parseMoneyAmount(m[1], m[2] || '')
    if (base !== null && base > 0) return { min: Math.round(base * 0.8), max: Math.round(base * 1.2), type: 'around' as const }
  }

  return null
}

const PROMO_KEYWORDS = ['tinh tien', 'khuyen mai', 'uu dai', 'giam gia', 'tang kem', 'mua tang', 'flash sale', 'sale off', 'giam con', 'chi con', 'chi tu']
// Khach san/resort cao cap - luon uoc tinh > 1.5 trieu/dem, bat ke co gia trong snippet hay khong
const LUXURY_KEYWORDS = ['5 sao', '5-sao', 'five star', 'pullman', 'intercontinental', 'marriott', 'sheraton', 'hilton', 'hyatt', 'novotel', 'sofitel', 'melia', 'movenpick', 'radisson', 'wyndham', 'imperial hotel', 'resort luxury', 'luxury resort']

function extractPricesVND(text: string): number[] {
  const t = normalizeVN(text.toLowerCase())
  const prices: number[] = []
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d{3})+)\s*(?:d\b|dong|vnd)?/g)) {
    const n = parseFloat(m[1].replace(/\./g, '').replace(/,/g, ''))
    if (!isNaN(n) && n >= 5000) prices.push(n)
  }
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*k\b/g)) {
    const n = parseFloat(m[1]) * 1000
    if (!isNaN(n) && n >= 5000) prices.push(n)
  }
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:trieu|tri\b)/g)) {
    const n = parseFloat(m[1].replace(',', '.')) * 1_000_000
    if (!isNaN(n) && n > 0) prices.push(n)
  }
  return prices
}

function extractRepresentativePriceVND(text: string): number | null {
  const prices = extractPricesVND(text)
  if (prices.length === 0) return null
  // Neu co promo language → dung MAX price (gia goc cao hon), khong cho promo danh lua filter
  const t = normalizeVN(text.toLowerCase())
  const hasPromo = PROMO_KEYWORDS.some(k => t.includes(k))
  return hasPromo ? Math.max(...prices) : Math.min(...prices)
}

const LUXURY_PRICE_FLOOR = 1_500_000 // uoc tinh gia toi thieu khach san 5 sao

function filterResultsByBudget<T extends { title?: string; snippet?: string; price_vnd?: number }>(
  items: T[], budget: Budget
): T[] {
  const tol = 1.1
  const enforceMin = budget.type === 'range' && budget.min > 0
  return items.filter(item => {
    if (typeof item.price_vnd === 'number') {
      const ok = item.price_vnd <= budget.max * tol
      return enforceMin ? ok && item.price_vnd >= budget.min * 0.9 : ok
    }
    // QUAN TRONG: check ca 'link' vi URL co the chua ten thuong hieu (vd agoda.com/pullman-vung-tau/...)
    const itemAny = item as Record<string, unknown>
    const linkText = typeof itemAny.link === 'string' ? itemAny.link : ''
    const text = normalizeVN(((item.title || '') + ' ' + (item.snippet || '') + ' ' + linkText).toLowerCase())
    // Luxury check TRUOC price check: loai ngay bat ke co price trong snippet hay khong
    const isLuxury = LUXURY_KEYWORDS.some(k => text.includes(k))
    if (isLuxury && budget.max < LUXURY_PRICE_FLOOR) return false
    const price = extractRepresentativePriceVND(text)
    if (price !== null) {
      const underMax = price <= budget.max * tol
      const aboveMin = enforceMin ? price >= budget.min * 0.9 : true
      return underMax && aboveMin
    }
    return true
  })
}

function fmtBudget(budget: Budget): string {
  const f = (n: number) => n >= 1_000_000
    ? (n / 1_000_000 % 1 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)) + ' triệu'
    : n / 1000 + 'k'
  return budget.min > 0 ? `${f(budget.min)}-${f(budget.max)}` : `dưới ${f(budget.max)}`
}

function fmtSuggest(n: number): string {
  return n >= 1_000_000
    ? (n / 1_000_000 % 1 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)) + ' triệu'
    : n / 1000 + 'k'
}

function applyBudgetFilter(result: unknown, budget: Budget, category: string): unknown {
  if (!result || typeof result !== 'object') return result
  const r = { ...(result as Record<string, unknown>) }

  // Filter search_results (hotel, general)
  if (Array.isArray(r.search_results)) {
    const before = r.search_results as Array<{ title?: string; snippet?: string }>
    const after = filterResultsByBudget(before, budget)
    if (after.length === 0 && before.length > 0) {
      const suggest = Math.round(budget.max * 1.2 / 1000) * 1000
      return {
        budget_filter_empty: true,
        budget_range: fmtBudget(budget),
        message: `Trong tầm ${fmtBudget(budget)} ở khu vực này mình chưa tìm được ${category} phù hợp. Bạn có muốn nới budget lên ${fmtSuggest(suggest)} không, hay mình tìm khu vực khác?`,
      }
    }
    r.search_results = after
    // hotel_list tu OSM khong co gia → xoa khi co budget de tranh Claude recommend sai
    if (Array.isArray(r.hotel_list)) r.hotel_list = []
  }

  // Filter price_search_results (places - food/spa/entertainment)
  if (Array.isArray(r.price_search_results)) {
    r.price_search_results = filterResultsByBudget(
      r.price_search_results as Array<{ title?: string; snippet?: string }>, budget
    )
  }

  // Filter flights by price_vnd
  if (Array.isArray(r.flights)) {
    type FlightEntry = { price_vnd: number }
    const before = r.flights as FlightEntry[]
    const after = before.filter(f => f.price_vnd <= budget.max * 1.1)
    if (after.length === 0 && before.length > 0) {
      const suggest = Math.round(budget.max * 1.2 / 1000) * 1000
      return {
        budget_filter_empty: true,
        budget_range: fmtBudget(budget),
        message: `Trong tầm ${fmtBudget(budget)} mình chưa tìm được ${category} phù hợp. Bạn có muốn nới budget lên ${fmtSuggest(suggest)} không?`,
      }
    }
    r.flights = after
  }

  // QUAN TRONG: Neu budget thap, inject lenh cam truc tiep vao tool result
  // Haiku doc tool results rat ky - injection nay hieu qua hon system prompt
  if (budget.max < LUXURY_PRICE_FLOOR) {
    r._LENH_BAT_BUOC = `⚠️ LENH BAT BUOC - DOC TRUOC KHI VIET PHAN HOI: Nguoi dung co budget ${fmtBudget(budget)} VND - THAP HON gia khach san cao cap. TUYET DOI KHONG duoc de cap bat ky thuong hieu nao sau day du chi la de so sanh hay goi y: Pullman, Marriott, Hilton, Sheraton, Intercontinental, Sofitel, Novotel, Melia, Hyatt, Wyndham, Movenpick, Radisson, Imperial, Renaissance, Lotte, JW Marriott, Grand Mercure. Chi de cap cac khach san co trong search_results (da duoc loc theo budget). Neu khong con search_results phu hop, bao user nang budget.`
  }

  return r
}

// ===== Chon san tool phu hop nhat de force goi (tranh model chon nham khi toolChoice=required) =====
function detectForcedTool(text: string): 'search_places' | 'get_news' | 'search_products' | 'web_search' | 'get_weather' | 'get_gold_price' | 'get_flight_prices' | 'get_hotel_prices' | 'get_transport_options' | null {
  const t = normalizeVN(text.toLowerCase().trim())
  if (/ve may bay|chuyen bay|bay tu|bay den|hang khong|gia ve bay|dat ve bay|vietjet|bamboo airways|pacific airlines|vietnam airlines/.test(t)) return 'get_flight_prices'
  if (/gia phong|gia khach san|dat phong|booking\.com|\bagoda\b|(khach san|hotel|resort).*gia|gia.*(khach san|hotel|resort)/.test(t)) return 'get_hotel_prices'
  if (/xe khach|ve xe (khach|do)|limousine|tau hoa|tau lua|duong sat|\btaxi\b|\bgrab\b|xanh sm|\bxe om\b|di chuyen (tu|den|toi|trong|quanh)|gia ve xe|tu .* den .* (bao nhieu|het|gia|bang gi)/.test(t)) return 'get_transport_options'
  if (/nha hang|quan an|an gi|an ngon|cafe|ca phe|coffee|\bspa\b|massage|khach san|\bhotel\b|resort|\bbar\b|\bpub\b|\bgym\b|fitness|rap chieu|cinema|xem phim|benh vien|hospital|clinic|pharmacy|nha thuoc|\batm\b|ngan hang|\bbank\b|dia diem|o dau|gan day|gan toi|\btiem\b/.test(t)) return 'search_places'
  if (/tin tuc|tin moi|bao chi|thoi su|tin nong|tin the gioi/.test(t)) return 'get_news'
  if (/\bmua\b|san pham|shopee|tiki|lazada|dat hang|order hang/.test(t)) return 'search_products'
  if (/gia vang|vang sjc|vang 9999|vang mieng|vang nhan|gia vang the gioi|xau\s*\/?\s*usd/.test(t)) return 'get_gold_price'
  if (/thoi tiet|du bao|nhiet do|troi mua|troi nang|troi co lanh|may co|nang khong|mua khong/.test(t)) return 'get_weather'
  if (/ty gia|hoi suat|gia xang|gia dau|ket qua|\bti so\b|diem so|ai la|tong thong|thu tuong|chu tich|vn-index|chung khoan|xo so|lich am|ngay bao nhieu|\?|nghia la|nhu the nao|khi nao|vi sao|tai sao|moi nhat|cap nhat|hien nay|hien tai/.test(t)) return 'web_search'
  return null
}

// ===== STEP 1.2: LOCATION INTENT DETECTION =====
function detectLocationIntent(text: string): 'offline' | 'online' | 'unknown' {
  const t = normalizeVN(text.toLowerCase().trim())
  // Online signals
  const onlineRe = /\bonline\b|ship\b|\border\b|giao\s*hang|free\s*ship|voucher|flash\s*sale|\bshopee\b|\blazada\b|\btiki\b|\bsendo\b|mua\s*tren|dat\s*hang\s*online|giao\s*tan\s*noi|\bcod\b|mua\s*online/
  // Offline signals: district names, streets, nearby, physical store
  const offlineRe = /\bq\.\s*\d+\b|\bq\.\s*[a-z]+|\bquan\s+\d+\b|\bquan\s+(binh|phu|go|tan|nha|hoc|can|cu|thu|ba|cau|dong|hai|hoan|tay|thanh)\b|\bphuong\s+\w+|\bhuyen\s+\w+|\bduong\s+[a-z]|\bpho\s+[a-z]|\bgan\s+(day|nha|minh)\b|\bkhu\s+vuc\b|\bo\s+dau\b|\bcho\s+nao\b|\bcua\s*hang\b|\btiem\b|\bchi\s*nhanh\b|\bsieu\s*thi\b|\btrung\s*tam\s*thuong\s*mai\b|\bmall\b|\bplaza\b|\bden\s+(mua|xem)\b|\bghe\s+(qua|toi|vao)\b/
  if (offlineRe.test(t)) return 'offline'
  if (onlineRe.test(t)) return 'online'
  return 'unknown'
}

function isShoppingQuery(text: string): boolean {
  const t = normalizeVN(text.toLowerCase())
  return /\b(ao|giay|dep|tui\b|dien thoai|laptop|may tinh|tablet|my pham|son moi|nuoc hoa|dong ho|trang suc|kinh mat|balo|sandal|sneaker|boot|hoodie|jacket|legging|vay|dam|quan\s*jean|quan\s*short|do\s*the\s*thao|thoi\s*trang|phu\s*kien|tui\s*xach|vi\s*da|hang\s*hieu)\b/.test(t)
}
// ===== END STEP 1.2 =====

async function getNews(query: string) {
  const cacheKey = 'news:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const feeds = [
    { url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', name: 'VnExpress' },
    { url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', name: 'Tuoi Tre' },
    { url: 'https://dantri.com.vn/rss/home.rss', name: 'Dan Tri' },
  ]
  let result: unknown
  try {
    const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 2)
    const articles: Array<{ title: string; description: string; link: string; source: string; published: string }> = []
    await Promise.all(feeds.map(async feed => {
      try {
        const resp = await Promise.race([
          fetch(feed.url, { headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ])
        const xml = await (resp as Response).text()
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
        for (const item of items.slice(0, 30)) {
          if (articles.length >= 8) break
          const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim()
          const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]*>/g, '').trim()
          const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || item.match(/<guid>(.*?)<\/guid>/)?.[1] || '').trim()
          const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
          if (!title) continue
          const tl = title.toLowerCase(), dl = desc.toLowerCase()
          const matches = queryTerms.length === 0 || queryTerms.some(k => tl.includes(k) || dl.includes(k))
          if (matches) articles.push({ title, description: desc.slice(0, 200), link, source: feed.name, published: pub ? new Date(pub).toLocaleDateString('vi-VN') : 'Moi nhat' })
        }
      } catch { /* skip feed */ }
    }))
    result = articles.length === 0
      ? { note: 'Khong tim thay tin tuc lien quan', articles: [] }
      : { query, total: articles.length, articles: articles.slice(0, 5) }
  } catch {
    result = { error: 'Khong the tai tin tuc', articles: [] }
  }
  setCache(cacheKey, result, 10 * 60 * 1000) // cache 10 phut, tin tuc cap nhat thuong xuyen
  return result
}

async function searchPlacesOSM(query: string, location?: string) {
  const loc = location || 'Ha Noi'
  const googleMapsUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(query + ' ' + loc)
  try {
    const cityCoords: Record<string, [number, number]> = {
      'ha noi': [21.0285, 105.8542], 'hanoi': [21.0285, 105.8542], 'hn': [21.0285, 105.8542],
      'ho chi minh': [10.7769, 106.7009], 'hcm': [10.7769, 106.7009], 'saigon': [10.7769, 106.7009],
      'da nang': [16.0544, 108.2022], 'danang': [16.0544, 108.2022],
      'hue': [16.4637, 107.5909], 'can tho': [10.0452, 105.7469],
      'hai phong': [20.8449, 106.6881], 'nha trang': [12.2388, 109.1967],
      'da lat': [11.9404, 108.4583], 'vung tau': [10.3460, 107.0843],
      'hoi an': [15.8801, 108.3380],
    }
    const locKey = loc.toLowerCase()
    const preset = Object.entries(cityCoords).find(([k]) => locKey.includes(k))
    let lat = preset ? preset[1][0] : 21.0285
    let lon = preset ? preset[1][1] : 105.8542
    if (!preset) {
      try {
        const geoResp = await Promise.race([
          fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(loc + ' Vietnam') + '&format=json&limit=1', {
            headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' }
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
        ])
        const geoData = await (geoResp as Response).json()
        if (geoData[0]) { lat = parseFloat(geoData[0].lat); lon = parseFloat(geoData[0].lon) }
      } catch { /* use default */ }
    }
    const ql = query.toLowerCase()
    let amenity = 'restaurant'
    if (ql.match(/cafe|ca phe|coffee/)) amenity = 'cafe'
    else if (ql.match(/spa|massage/)) amenity = 'spa'
    else if (ql.match(/hotel|khach san|resort/)) amenity = 'hotel'
    else if (ql.match(/bar|pub/)) amenity = 'bar'
    else if (ql.match(/gym|fitness/)) amenity = 'gym'
    else if (ql.match(/cinema|phim|rap/)) amenity = 'cinema'
    else if (ql.match(/benh vien|hospital|clinic/)) amenity = 'hospital'
    else if (ql.match(/pharmacy|thuoc/)) amenity = 'pharmacy'
    else if (ql.match(/atm|ngan hang|bank/)) amenity = 'bank'
    const oql = '[out:json][timeout:10];(node["amenity"="' + amenity + '"]["name"](around:5000,' + lat + ',' + lon + ');way["amenity"="' + amenity + '"]["name"](around:5000,' + lat + ',' + lon + '););out center 10;'
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
    let overpassData: { elements?: unknown[] } | null = null
    for (const endpoint of endpoints) {
      try {
        const resp = await Promise.race([
          fetch(endpoint + '?data=' + encodeURIComponent(oql), { headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ])
        if ((resp as Response).ok) { overpassData = await (resp as Response).json(); break }
      } catch { continue }
    }
    if (!overpassData) return { note: 'Tim kiem tren Google Maps: ' + googleMapsUrl, google_maps_search: googleMapsUrl, results: [] }
    type El = { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }
    const results = ((overpassData.elements || []) as El[]).slice(0, 10).map(el => {
      const tags = el.tags || {}
      const elat = el.lat ?? el.center?.lat
      const elon = el.lon ?? el.center?.lon
      return {
        name: tags['name:vi'] || tags.name || '',
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']].filter(Boolean).join(' ') || tags['addr:full'] || 'Xem ban do',
        phone: tags.phone || tags['contact:phone'] || null,
        maps_link: elat && elon ? 'https://www.google.com/maps?q=' + elat + ',' + elon : googleMapsUrl
      }
    }).filter(r => r.name)
    return {
      location: loc, amenity_type: amenity, source: 'OpenStreetMap', count: results.length, results,
      google_maps_search: googleMapsUrl,
      note: results.length === 0 ? 'OSM khong co du lieu. Tim them: ' + googleMapsUrl : 'Du lieu tu OpenStreetMap. Xem them: ' + googleMapsUrl
    }
  } catch (e) { return { error: String(e), results: [], google_maps_search: googleMapsUrl } }
}

const FOOD_DELIVERY_LINKS = [
  { name: 'ShopeeFood', url: 'https://shopeefood.vn/' },
  { name: 'GrabFood', url: 'https://food.grab.com/vn/vi/' },
  { name: 'BeFood', url: 'https://be.com.vn/' },
]

// Kiem tra 1 link co phai trang CU THE (khong phai trang chu) tren ShopeeFood/GrabFood/Baemin/BeFood
function isDirectFoodOrderLink(link: string): boolean {
  try {
    const u = new URL(link)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '')
    if (path.length <= 1) return false // bo qua trang chu, khong cu the
    return host.includes('shopeefood.vn') || host.includes('food.grab.com') || host.includes('baemin.vn') || host.includes('be.com.vn')
  } catch {
    return false
  }
}

// Kiem tra link co phai trang CU THE cua 1 khach san tren Booking.com/Agoda/Traveloka
// (khong phai trang tim kiem/danh sach chung theo khu vuc/thanh pho)
function isSpecificOtaHotelPage(link: string): boolean {
  try {
    const u = new URL(link)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.toLowerCase()
    if (!(host.includes('booking.com') || host.includes('agoda.com') || host.includes('traveloka.com'))) return false
    if (path.length <= 1) return false
    if (path.includes('search') || path.includes('/region/') || path.includes('/city/') || path.includes('/budget/') || path.includes('/country/') || path.includes('/maps/') || path.includes('/landmark/')) return false
    return true
  } catch {
    return false
  }
}

async function searchPlaces(query: string, location?: string, type?: string) {
  const cacheKey = 'places:' + query.toLowerCase().trim() + ':' + (location || '').toLowerCase().trim() + ':' + (type || '')
  const cached = getCache(cacheKey)
  if (cached) return cached

  const key = process.env.GOOGLE_PLACES_API_KEY
  let result: unknown = null
  if (key) {
    try {
      const sq = location ? query + ' ' + location : query
      const p = new URLSearchParams({ query: sq, key, language: 'vi', region: 'vn' })
      if (type) p.set('type', type)
      const resp = await Promise.race([
        fetch('https://maps.googleapis.com/maps/api/place/textsearch/json?' + p),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
      const d = await (resp as Response).json()
      if (d.status === 'OK' && d.results?.length) {
        result = {
          source: 'Google Maps', count: d.results.length,
          results: d.results.slice(0, 8).map((r: Record<string, unknown>) => ({
            name: r.name, address: r.formatted_address,
            rating: r.rating ? r.rating + '/5 (' + r.user_ratings_total + ' danh gia)' : 'Chua co danh gia',
            maps_link: 'https://www.google.com/maps/place/?q=place_id:' + r.place_id
          }))
        }
      } else {
        console.log(JSON.stringify({ type: 'tappyai_places_debug', status: d.status, error_message: d.error_message || null }))
      }
    } catch (e) {
      console.log(JSON.stringify({ type: 'tappyai_places_debug', error: String(e) }))
    }
  }
  if (!result) result = await searchPlacesOSM(query, location)

  // ===== Gia tham khao tu Serper (an uong / spa / giai tri) =====
  const qNorm = normalizeVN(query.toLowerCase())
  const isFood = type === 'restaurant' || type === 'cafe' || /nha hang|quan an|an gi|an ngon|mon an|thuc don|\bcafe\b|ca phe|coffee|quan nhau|bun|pho|com/.test(qNorm)
  const isSpa = type === 'spa' || /\bspa\b|massage|lam dep|tham my|nail|cham soc da|goi dau/.test(qNorm)
  const isEntertainment = type === 'cinema' || type === 'bar' || type === 'gym' || /rap chieu|cinema|xem phim|ve phim|karaoke|cong vien|khu vui choi|giai tri|bowling|billiard|\bgym\b|fitness|\bbar\b|\bpub\b|ve vao cong/.test(qNorm)
  if (isFood || isSpa || isEntertainment) {
    try {
      const suffix = isFood ? 'gia menu thuc don' : isSpa ? 'gia dich vu bang gia spa massage' : 'gia ve dich vu'
      const [priceResults, orderResults] = await Promise.all([
        serperSearch(query + ' ' + (location || '') + ' ' + suffix),
        isFood ? serperSearch(query + ' ' + (location || '') + ' (site:shopeefood.vn OR site:food.grab.com OR site:baemin.vn)') : Promise.resolve(null),
      ])
      if (result && typeof result === 'object') {
        const extra: Record<string, unknown> = {}
        if (priceResults && priceResults.length > 0) {
          extra.price_search_results = priceResults
          extra.price_note = 'Gia tham khao tu ket qua tim kiem hien tai (menu/dich vu/ve...), co the khac theo chi nhanh, thoi diem va da thay doi theo thoi gian.'
        }
        if (isFood) {
          const directOrder = (orderResults || []).filter(r => isDirectFoodOrderLink(r.link))
          if (directOrder.length > 0) extra.order_search_results = directOrder
          extra.order_links = FOOD_DELIVERY_LINKS
        }
        if (Object.keys(extra).length > 0) {
          result = { ...(result as Record<string, unknown>), ...extra }
        }
      }
    } catch { /* bo qua, van tra ve danh sach dia diem */ }
  }

  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut, dia diem it thay doi
  return result
}

async function searchProducts(query: string) {
  const cacheKey = 'products:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const links = [
    { name: 'Shopee', url: 'https://shopee.vn/search?keyword=' + encodeURIComponent(query) },
    { name: 'Tiki', url: 'https://tiki.vn/search?q=' + encodeURIComponent(query) },
    { name: 'Lazada', url: 'https://www.lazada.vn/catalog/?q=' + encodeURIComponent(query) },
  ]

  let result: unknown
  try {
    const [searchResultsRaw, directResults] = await Promise.all([
      serperSearch(query + ' gia Shopee Tiki Lazada'),
      serperSearch(query + ' (site:shopee.vn OR site:tiki.vn OR site:lazada.vn)'),
    ])

    // Uu tien cac link CU THE den 1 san pham (khong phai trang tim kiem) tren Shopee/Tiki/Lazada
    const directProductLinks = (directResults || []).filter(r => {
      try {
        const u = new URL(r.link)
        const host = u.hostname.replace(/^www\./, '')
        const path = u.pathname.toLowerCase()
        if (host.includes('shopee.vn')) return /-i\.\d+\.\d+/.test(path)
        if (host.includes('tiki.vn')) return /-p\d+\.html/.test(path)
        if (host.includes('lazada.vn')) return path.startsWith('/products/')
        return false
      } catch { return false }
    })

    let searchResults: Array<{ title: string; link: string; snippet: string }> | undefined = searchResultsRaw || undefined
    if (directProductLinks.length > 0) {
      const seen = new Set<string>()
      searchResults = [...directProductLinks, ...(searchResults || [])].filter(r => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
      }).slice(0, 8)
    }

    if (searchResults && searchResults.length > 0) {
      result = {
        query,
        source: 'Google Search (Serper)',
        search_results: searchResults,
        links,
        note: 'Gia tham khao tu ket qua tim kiem hien tai, co the da thay doi theo thoi gian va phien ban san pham - bam link de xem gia chinh xac va mua hang.'
      }
    } else {
      result = { note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam', links }
    }
  } catch {
    result = { note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam', links }
  }
  setCache(cacheKey, result, 15 * 60 * 1000) // cache 15 phut
  return result
}

// ===== WEB SEARCH: DuckDuckGo HTML (free, no API key) =====
async function webSearch(query: string) {
  const cacheKey = 'websearch:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
  let result: unknown

  const serperResults = await serperSearch(query)
  if (serperResults && serperResults.length > 0) {
    result = { query, source: 'Google (Serper)', results: serperResults, search_url: fallbackUrl }
    setCache(cacheKey, result, 5 * 60 * 1000)
    return result
  }

  try {
    const resp = await Promise.race([
      fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://duckduckgo.com/',
          'Origin': 'https://duckduckgo.com',
          'Sec-Fetch-Mode': 'navigate',
        }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const html = await (resp as Response).text()

    const results: Array<{ title: string; link: string; snippet: string }> = []
    const blockRegex = /<a[^>]*class="result__a"[^>]*href="(.*?)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const stripTags = (s: string) => s
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .trim()

    let match: RegExpExecArray | null
    while ((match = blockRegex.exec(html)) && results.length < 6) {
      let link = match[1]
      const uddg = link.match(/uddg=([^&]+)/)
      if (uddg) link = decodeURIComponent(uddg[1])
      else if (link.startsWith('//')) link = 'https:' + link
      const title = stripTags(match[2])
      const snippet = stripTags(match[3])
      if (title && link) results.push({ title, link, snippet })
    }

    result = results.length === 0
      ? { note: 'Khong tim thay ket qua tu dong cho "' + query + '". HAY hien thi link sau cho user de tu tim: ' + fallbackUrl, results: [], search_url: fallbackUrl }
      : { query, source: 'DuckDuckGo', results, search_url: fallbackUrl }
  } catch {
    result = { note: 'Khong the tim kiem tu dong luc nay. HAY hien thi link sau cho user de tu tim: ' + fallbackUrl, results: [], search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 5 * 60 * 1000) // cache 5 phut
  return result
}

// Encode ky tu '(' ')' trong URL de khong vo cu phap markdown link [text](url)
function sanitizeUrlForMarkdown(link: string): string {
  return link.replace(/\(/g, '%28').replace(/\)/g, '%29')
}

// ===== SERPER: Google Search API (can SERPER_API_KEY, 2500 query free) =====
async function serperSearch(query: string): Promise<Array<{ title: string; link: string; snippet: string }> | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 8 })
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const organic = (data?.organic || []) as Array<{ title?: string; link?: string; snippet?: string }>
    const results = organic
      .filter(r => r.title && r.link)
      .slice(0, 6)
      .map(r => ({ title: r.title as string, link: sanitizeUrlForMarkdown(r.link as string), snippet: r.snippet || '' }))
    return results
  } catch {
    return null
  }
}

// ===== WEATHER: wttr.in (free, no API key) =====
async function getWeather(location: string) {
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
async function getGoldPrice(query: string) {
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

// ===== FLIGHT PRICES: Travelpayouts Data API (free, can dang ky token) =====
const TRAVELPAYOUTS_TOKEN = '3a9fbe93835239c550d2afb73554011f'

const IATA_MAP: Record<string, string> = {
  'ha noi': 'HAN', 'hanoi': 'HAN', 'hn': 'HAN',
  'ho chi minh': 'SGN', 'tp ho chi minh': 'SGN', 'tp hcm': 'SGN', 'hcm': 'SGN', 'sai gon': 'SGN', 'saigon': 'SGN', 'tphcm': 'SGN',
  'da nang': 'DAD', 'danang': 'DAD',
  'phu quoc': 'PQC',
  'nha trang': 'CXR', 'cam ranh': 'CXR',
  'hue': 'HUI',
  'can tho': 'VCA',
  'hai phong': 'HPH',
  'da lat': 'DLI', 'dalat': 'DLI',
  'vinh': 'VII',
  'buon ma thuot': 'BMV',
  'quy nhon': 'UIH',
  'pleiku': 'PXU',
  'con dao': 'VCS',
  'rach gia': 'VKG',
  'ca mau': 'CAH',
  'thanh hoa': 'THD',
  'dong hoi': 'VDH',
  'tuy hoa': 'TBB',
  'bangkok': 'BKK', 'thai lan': 'BKK',
  'singapore': 'SIN',
  'seoul': 'ICN', 'han quoc': 'ICN',
  'tokyo': 'NRT', 'nhat ban': 'NRT', 'nhat': 'NRT',
  'osaka': 'KIX',
  'kuala lumpur': 'KUL', 'malaysia': 'KUL',
  'taipei': 'TPE', 'dai loan': 'TPE',
  'hong kong': 'HKG',
  'sydney': 'SYD',
}

const AIRLINE_NAMES: Record<string, string> = {
  VN: 'Vietnam Airlines', VJ: 'VietJet Air', QH: 'Bamboo Airways', BL: 'Pacific Airlines',
  '3K': 'Jetstar Asia', SQ: 'Singapore Airlines', TG: 'Thai Airways', TR: 'Scoot',
  KE: 'Korean Air', OZ: 'Asiana Airlines', JL: 'Japan Airlines', NH: 'ANA',
  CX: 'Cathay Pacific', MU: 'China Eastern', AK: 'AirAsia',
}

function cityToIATA(name: string): string | null {
  const n = normalizeVN((name || '').toLowerCase().trim())
  if (/^[a-z]{3}$/i.test(n)) return n.toUpperCase()
  for (const [key, code] of Object.entries(IATA_MAP)) {
    if (n.includes(key)) return code
  }
  return null
}

async function getFlightPrices(origin: string, destination: string) {
  const cacheKey = 'flights:' + origin.toLowerCase().trim() + ':' + destination.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const originCode = cityToIATA(origin)
  const destCode = cityToIATA(destination)
  const searchUrl = 'https://www.aviasales.com/search/' + (originCode || '') + (destCode || '')

  let result: unknown
  if (!originCode || !destCode) {
    result = { error: 'Khong nhan dien duoc san bay tu ten dia diem', note: 'Tim chuyen bay tai: ' + searchUrl, search_url: searchUrl }
  } else {
    try {
      const params = new URLSearchParams({ origin: originCode, destination: destCode, currency: 'vnd', token: TRAVELPAYOUTS_TOKEN })
      const resp = await Promise.race([
        fetch('https://api.travelpayouts.com/v1/prices/cheap?' + params.toString(), { headers: { 'Accept': 'application/json' } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      ])
      const data = await (resp as Response).json()
      const routeData = data?.data?.[destCode]
      if (data?.success && routeData) {
        type Fare = { price: number; airline: string; flight_number: number; departure_at?: string; return_at?: string }
        const options = Object.values(routeData as Record<string, Fare>)
        result = {
          source: 'Travelpayouts (du lieu Aviasales)',
          origin: originCode, destination: destCode, currency: 'VND',
          flights: options.map(o => ({
            price_vnd: o.price,
            airline: AIRLINE_NAMES[o.airline] || o.airline,
            flight_number: o.airline + o.flight_number,
            departure_at: o.departure_at || null,
            return_at: o.return_at || null,
          })),
          booking_link: 'https://www.aviasales.com/search/' + originCode + destCode,
          note: 'Day la gia ve re gan nhat ma he thong tim duoc cho tuyen nay (khong chac dung ngay user hoi), gia co the da thay doi - bam link de xem gia chinh xac va dat ve theo ngay cu the.'
        }
      } else {
        throw new Error('no data')
      }
    } catch {
      result = { error: 'Khong lay duoc gia ve may bay luc nay', note: 'Tim chuyen bay tai: ' + searchUrl, search_url: searchUrl }
    }
  }
  setCache(cacheKey, result, 60 * 60 * 1000) // cache 1 gio
  return result
}

// ===== HOTEL PRICES: web search (Booking.com/Agoda snippets) + OSM hotel list (free, no API key) =====
async function getHotelPrices(location: string, checkIn?: string, checkOut?: string, maxBudgetVnd?: number) {
  const cacheKey = 'hotels:' + location.toLowerCase().trim() + ':' + (checkIn || '') + ':' + (checkOut || '') + ':' + (maxBudgetVnd || '')
  const cached = getCache(cacheKey)
  if (cached) return cached

  const bookingUrl = 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(location)
    + (checkIn ? '&checkin=' + checkIn : '') + (checkOut ? '&checkout=' + checkOut : '')
  const budgetTag = maxBudgetVnd && maxBudgetVnd < 1_500_000
    ? ' gia re binh dan duoi ' + Math.round(maxBudgetVnd / 1000) + 'k -"5 sao" -pullman -marriott -hilton -sheraton -sofitel -intercontinental -novotel'
    : ''
  const searchQuery = 'khach san ' + location + ' gia phong dem nay booking.com agoda' + budgetTag

  let result: unknown
  try {
    // Buoc 1: lay gia chung + danh sach khach san OSM song song
    const [serperResults, places] = await Promise.all([
      serperSearch(searchQuery),
      searchPlacesOSM('khach san', location) as Promise<{ results?: Array<{ name: string; address: string; maps_link: string }> }>,
    ])
    let hotelList = places?.results?.slice(0, 5) || []
    // Filter luxury brands khoi OSM list neu co budget
    if (maxBudgetVnd && maxBudgetVnd < 1_500_000) {
      hotelList = hotelList.filter(h => {
        const hn = normalizeVN(h.name.toLowerCase())
        return !LUXURY_KEYWORDS.some(k => hn.includes(k))
      })
    }

    // Buoc 2: tim trang dat phong TRUC TIEP tung khach san tren OTA (song song)
    // Tim rieng tung ten → Google tra ve trang hotel cu the, khong phai trang search chung
    let directHotelLinks: Array<{ title: string; link: string; snippet: string }> = []
    {
      const hotelQueries = hotelList.slice(0, 3).map(h =>
        '"' + h.name + '" ' + location + ' site:booking.com OR site:agoda.com'
      )
      // Neu khong co OSM hotel, dung query co path /hotel/ de ep Google tra trang cu the
      const genericFallback = 'khach san ' + location + ' site:booking.com/hotel' + (budgetTag ? ' gia re binh dan' : '')
      const queriesToRun = hotelQueries.length > 0 ? hotelQueries : [genericFallback]

      const allResults = await Promise.all(queriesToRun.map(q => serperSearch(q)))
      directHotelLinks = allResults
        .flatMap(r => r || [])
        .filter(r => isSpecificOtaHotelPage(r.link))
        .filter((r, i, arr) => arr.findIndex(x => x.link === r.link) === i) // dedup

      // Neu van it hon 2 direct link, thu them OR query + site:agoda.com
      if (directHotelLinks.length < 2) {
        const supplementQ = hotelList.length > 0
          ? hotelList.slice(0, 3).map(h => '"' + h.name + '"').join(' OR ') + ' ' + location + ' (site:booking.com OR site:agoda.com)'
          : genericFallback
        const supplement = await serperSearch(supplementQ)
        const seen = new Set(directHotelLinks.map(r => r.link))
        directHotelLinks = [
          ...directHotelLinks,
          ...(supplement || []).filter(r => isSpecificOtaHotelPage(r.link) && !seen.has(r.link))
        ]
      }
      directHotelLinks = directHotelLinks.slice(0, 8)
    }
    let searchResults: Array<{ title: string; link: string; snippet: string }> | undefined = serperResults || undefined
    if (directHotelLinks.length > 0) {
      const seen = new Set<string>()
      searchResults = [...directHotelLinks, ...(searchResults || [])].filter(r => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
      }).slice(0, 8)
    }
    // Neu mot ket qua tro toi trang OTA nhung KHONG phai trang rieng 1 khach san (vd trang city/budget chung),
    // thay link bang bookingUrl de model khong gan nham cho ten khach san cu the
    if (searchResults) {
      searchResults = searchResults.map(r => {
        try {
          const u = new URL(r.link)
          const host = u.hostname.replace(/^www\./, '')
          if ((host.includes('booking.com') || host.includes('agoda.com') || host.includes('traveloka.com')) && !isSpecificOtaHotelPage(r.link)) {
            return { ...r, link: bookingUrl }
          }
          return r
        } catch { return r }
      })
    }
    let source = 'Google Search (Serper) + OpenStreetMap'
    if (!searchResults || searchResults.length === 0) {
      const ddg = await webSearch(searchQuery) as { results?: Array<{ title: string; link: string; snippet: string }> }
      searchResults = ddg?.results
      source = 'Tim kiem web (DuckDuckGo) + OpenStreetMap'
    }

    if (searchResults && searchResults.length > 0) {
      result = {
        location,
        source,
        search_results: searchResults,
        hotel_list: hotelList,
        booking_link: bookingUrl,
        _debug_budget: maxBudgetVnd ? 'detected:' + maxBudgetVnd : 'null',
        note: 'Gia trong search_results la tham khao tu ket qua tim kiem hien tai, co the khong dung loai phong/ngay user hoi va da thay doi - bam booking_link de xem gia chinh xac realtime theo ngay cu the.'
      }
    } else {
      result = {
        error: 'Khong tim duoc thong tin gia phong luc nay',
        hotel_list: hotelList,
        booking_link: bookingUrl,
        _debug_budget: maxBudgetVnd ? 'detected:' + maxBudgetVnd : 'null',
        note: 'Xem va dat phong tai: ' + bookingUrl,
        search_url: bookingUrl,
      }
    }
  } catch {
    result = { error: 'Khong lay duoc gia phong khach san luc nay', booking_link: bookingUrl, note: 'Xem va dat phong tai: ' + bookingUrl, search_url: bookingUrl }
  }
  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut
  return result
}

// ===== TRANSPORT: xe khach/tau lien tinh (Serper search) + uoc tinh taxi/xe cong nghe theo khoang cach =====
const TRANSPORT_CITY_COORDS: Record<string, [number, number]> = {
  'ha noi': [21.0285, 105.8542], 'hanoi': [21.0285, 105.8542], 'hn': [21.0285, 105.8542],
  'ho chi minh': [10.7769, 106.7009], 'hcm': [10.7769, 106.7009], 'saigon': [10.7769, 106.7009], 'sai gon': [10.7769, 106.7009], 'tp hcm': [10.7769, 106.7009], 'tphcm': [10.7769, 106.7009],
  'da nang': [16.0544, 108.2022], 'danang': [16.0544, 108.2022],
  'hue': [16.4637, 107.5909], 'can tho': [10.0452, 105.7469],
  'hai phong': [20.8449, 106.6881], 'nha trang': [12.2388, 109.1967],
  'da lat': [11.9404, 108.4583], 'dalat': [11.9404, 108.4583], 'vung tau': [10.3460, 107.0843],
  'hoi an': [15.8801, 108.3380], 'phu quoc': [10.2270, 103.9648], 'quy nhon': [13.7820, 109.2192],
  'sa pa': [22.3364, 103.8438], 'sapa': [22.3364, 103.8438], 'ninh binh': [20.2506, 105.9745],
}

// San bay lon - khoang cach toi trung tam thanh pho thuong qua xa de dung toa do trung tam
const AIRPORT_COORDS: Record<string, [number, number]> = {
  'tan son nhat': [10.8188, 106.6520], 'sgn': [10.8188, 106.6520],
  'noi bai': [21.2212, 105.8072],
  'cam ranh': [11.9982, 109.2192],
  'lien khuong': [11.7497, 108.3669],
  'cat bi': [20.8197, 106.7247],
  'phu bai': [16.4015, 107.7032],
  'phu cat': [13.9550, 109.0420],
  'tra noc': [10.0851, 105.7117],
}

async function geocodeForTransport(loc: string): Promise<[number, number] | null> {
  const locKey = normalizeVN(loc.toLowerCase())
  const airportPreset = Object.entries(AIRPORT_COORDS).find(([k]) => locKey.includes(normalizeVN(k)))
  if (airportPreset) return airportPreset[1]
  const preset = Object.entries(TRANSPORT_CITY_COORDS).find(([k]) => locKey.includes(normalizeVN(k)))
  if (preset) return preset[1]
  try {
    const geoResp = await Promise.race([
      fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(loc + ' Vietnam') + '&format=json&limit=1', {
        headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ])
    const geoData = await (geoResp as Response).json()
    if (geoData[0]) return [parseFloat(geoData[0].lat), parseFloat(geoData[0].lon)]
  } catch { /* fallback */ }
  return null
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = (b[0] - a[0]) * Math.PI / 180
  const dLon = (b[1] - a[1]) * Math.PI / 180
  const lat1 = a[0] * Math.PI / 180
  const lat2 = b[0] * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const RIDE_HAILING_APPS = [
  { name: 'Grab', link: 'https://www.grab.com/vn/transport/car/' },
  { name: 'Xanh SM', link: 'https://xanhsm.com/' },
  { name: 'Be', link: 'https://be.com.vn/' },
]

// mode: 'taxi' = uoc tinh gia trong thanh pho/quang duong ngan; khac (hoac khong co) = xe khach/tau lien tinh
async function getTransportOptions(origin: string, destination: string, mode?: string) {
  const cacheKey = 'transport:' + origin.toLowerCase().trim() + ':' + destination.toLowerCase().trim() + ':' + (mode || 'auto')
  const cached = getCache(cacheKey)
  if (cached) return cached

  const isTaxi = mode === 'taxi'
  let result: unknown

  if (!isTaxi) {
    const vexereUrl = 'https://vexere.com/vi-VN/ket-qua-tim-kiem-ve-xe-khach?fromLocationName=' + encodeURIComponent(origin) + '&toLocationName=' + encodeURIComponent(destination)
    const trainUrl = 'https://dsvn.vn/'
    try {
      const [busResults, trainResults] = await Promise.all([
        serperSearch('ve xe khach tu ' + origin + ' di ' + destination + ' gia bao nhieu vexere futa phuong trang'),
        serperSearch('ve tau ' + origin + ' ' + destination + ' duong sat viet nam gia'),
      ])
      if ((busResults && busResults.length > 0) || (trainResults && trainResults.length > 0)) {
        result = {
          type: 'intercity',
          origin, destination,
          bus_search_results: busResults || [],
          train_search_results: trainResults || [],
          vexere_link: vexereUrl,
          train_booking_link: trainUrl,
          note: 'Gia/chuyen xe-tau la tham khao tu ket qua tim kiem hien tai, co the khac theo gio chay, loai ghe va da thay doi.'
        }
      } else {
        result = { error: 'Khong tim duoc ve xe khach/tau luc nay', vexere_link: vexereUrl, train_booking_link: trainUrl }
      }
    } catch {
      result = { error: 'Khong tim duoc ve xe khach/tau luc nay', vexere_link: vexereUrl, train_booking_link: trainUrl }
    }
  } else {
    try {
      const [a, b] = await Promise.all([geocodeForTransport(origin), geocodeForTransport(destination)])
      const rawKm = a && b ? haversineKm(a, b) : null
      const sameLocation = normalizeVN(origin.toLowerCase()).trim() === normalizeVN(destination.toLowerCase()).trim()
      if (rawKm === null || (rawKm < 0.3 && !sameLocation)) {
        // Khong xac dinh duoc toa do cu the cho 1 hoac ca 2 dia diem - khong dua so lieu sai lech
        result = {
          error: 'Khong xac dinh duoc chinh xac khoang cach cho 2 dia diem nay luc nay',
          apps: RIDE_HAILING_APPS,
          note: 'Mo app Grab/Be/Xanh SM va nhap dia chi cu the de app tinh khoang cach + gia chinh xac tu vi tri thuc te.'
        }
      } else {
        const distanceKm = Math.max(0.5, Math.round(rawKm * 10) / 10)
        const lowRate = 11000, highRate = 16000
        const baseFare = 13000
        const estLow = Math.round((baseFare + distanceKm * lowRate) / 1000) * 1000
        const estHigh = Math.round((baseFare + distanceKm * highRate) / 1000) * 1000
        result = {
          type: 'taxi',
          origin, destination,
          distance_km: distanceKm,
          estimated_fare_vnd: { low: estLow, high: estHigh },
          apps: RIDE_HAILING_APPS,
          note: 'Day la gia UOC TINH theo khoang cach duong chim va don gia trung binh xe 4 cho, KHONG phai gia chinh xac tu app - mo app de xem gia thuc te (co the cong them phi gio cao diem, phi cau duong...) va dat xe.'
        }
      }
    } catch {
      result = { error: 'Khong uoc tinh duoc khoang cach/gia xe luc nay', apps: RIDE_HAILING_APPS }
    }
  }

  setCache(cacheKey, result, 20 * 60 * 1000)
  return result
}

function buildSystem(budget?: Budget | null, locationIntent?: 'offline' | 'online' | 'unknown'): string {
  const now = new Date()
  const vnDateTime = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'short' })
  const vnDateISO = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) // YYYY-MM-DD
  const budgetBlock = budget
    ? `\n\n===== BUDGET FILTER - LUAT BAT BUOC =====
User chi co budget ${budget.min > 0 ? budget.min.toLocaleString('vi-VN') + '-' : 'duoi '}${budget.max.toLocaleString('vi-VN')} VND.
LUAT 1: CHI DE CAP cac option co trong ket qua tool. CAM tuyet doi them tu kien thuc co san.
LUAT 2: CAM HOAN TOAN de cap bat ky khach san thuong hieu quoc te hoac 4-5 sao nao (Pullman, Marriott, Hilton, Sheraton, Intercontinental, Sofitel, Novotel, Melia, Hyatt, Imperial, Renaissance, Wyndham...) khi budget duoi 1.500.000 VND. Day la luat cung, khong co ngoai le, khong them ghi chu "co the cao hon tam".
LUAT 3: Neu khong con option nao trong tam gia, tra loi: "Trong tam ${budget.min > 0 ? budget.min.toLocaleString('vi-VN') + '-' : 'duoi '}${budget.max.toLocaleString('vi-VN')} VND minh chua tim duoc ket qua phu hop. Ban co muon noi budget len ${Math.round(budget.max * 1.2 / 1000) * 1000 >= 1000000 ? (Math.round(budget.max * 1.2 / 100000) / 10).toFixed(1) + ' trieu' : Math.round(budget.max * 1.2 / 1000) + 'k'} khong?"
==========================================`
    : ''
  const locationBlock = locationIntent === 'offline'
    ? `\n\n===== VI TRI: TIM DIA DIEM VAT LY =====\nUser muon tim dia diem vat ly co the ghe truc tiep. UU TIEN recommend cua hang/dia diem co dia chi cu the (so nha, ten duong, quan/phuong). CHI de xuat mua online neu user hoi cu the. Su dung search_places thay vi search_products.`
    : ''
  return `THOI GIAN HIEN TAI (rat quan trong): Bay gio la ${vnDateTime}, gio Viet Nam (GMT+7). Ngay hien tai dang YYYY-MM-DD: ${vnDateISO}. Day la thong tin THOI GIAN THUC, LUON dung gia tri nay khi tra loi cau hoi ve "hom nay/ngay mai/thang nay/nam nay/hien tai/bay gio" hoac khi can tinh toan ngay thang, tuoi, deadline, lich am, v.v. TUYET DOI KHONG dung nam trong du lieu huan luyen cu (vd 2023, 2024, 2025) de doan nam hien tai - hay dung dung ngay/nam da cho o tren.

${SYSTEM_BASE}${budgetBlock}${locationBlock}`
}

const SYSTEM_BASE = `Ban la TappyAI - tro ly AI thuan Viet chuyen tu van dich vu tai Viet Nam.
CHUYEN MON: An uong · Mua sam · Giai tri · Du lich · Van chuyen · Spa & Lam dep · Tin tuc · Thoi tiet · Gia vang
CONG CU: search_places (Google Maps/OSM), get_news (VnExpress/Tuoi Tre/Dan Tri), search_products (Shopee/Tiki/Lazada), get_weather (wttr.in - thoi tiet realtime), get_gold_price (vang.today - gia vang realtime), get_flight_prices (Travelpayouts/Aviasales - gia ve may bay), get_hotel_prices (tim kiem web Booking.com/Agoda + OSM - gia phong khach san), get_transport_options (tim kiem web - ve xe khach/tau lien tinh, hoac uoc tinh gia taxi/xe cong nghe theo khoang cach), web_search (tim kiem tong quat tren internet)

PHONG CACH TRA LOI: Noi chuyen nhu ban be than thiet - chill, nhiet tinh, co the xung "minh/ban" hoac "may/tao" tuy theo cach user xung ho (mirror tone cua user; neu user lich su/trang trong thi dung minh/ban). Cau tra loi can CO CAU TRUC RO RANG: dung **bold** cho ten dia diem/san pham/gia/diem nhan manh quan trong, dung bullet list khi liet ke nhieu lua chon, dung 1-2 emoji phu hop dau dong/tieu de (khong spam emoji giua cau). Khi phu hop, ket thuc bang 1 cau hoi ngan goi mo de tiep tuc ho tro (vd hoi ngay di, so nguoi, ngan sach, khu vuc cu the...) - khong bat buoc voi cau chao hoi/cam on don gian.

NGUYEN TAC BAT BUOC:
1) LUON goi tool khi user hoi ve dia diem, tin tuc, san pham, thoi tiet, gia vang - khong tra loi tu bo nho
2) Voi cac cau hoi can thong tin moi/cap nhat khac ma cac tool tren khong phu hop (ty gia, gia xang, su kien, kien thuc can xac thuc...), LUON goi web_search - khong tra loi bang kien thuc cu trong dau
3) Neu tool tra ve du lieu: hien thi ten, dia chi, link ban do cu the
4) Neu tool tra ve google_maps_search hoac search_url: LUON hien thi link do, dat duoi dang [Xem ket qua](URL) ngay trong cau tra loi - day la yeu cau BAT BUOC, khong duoc bo qua du da goi y nguon khac
5) Neu khong co du lieu OSM: van tra loi "Tim them tren Google Maps: [link]"
6) Tra loi tieng Viet than thien, co link cu the de user click
7) TUYET DOI KHONG noi "he thong gap su co" hay "toi khong co thong tin" khi da co link de tham khao
8) Voi cau chao hoi/cam on xa giao: tra loi ngan gon, than thien, khong can goi tool
9) Voi web_search: neu ket qua co 'results', tom tat 2-3 ket qua dau (title + snippet) roi cung cap link [Xem them ket qua tim kiem](search_url); neu khong co 'results' (chi co 'note'/'search_url'), PHAI tra loi bang link [Tim kiem truc tiep](search_url) ngay, khong duoc tu liet ke cac website khac thay cho link nay
10) Voi get_weather: neu tool tra ve temp_C/condition (KHONG co 'error'), PHAI tra loi NGAY trong chat voi nhiet do hien tai, tinh trang troi (mua/nang/may...), do am, gio - tuyet doi KHONG chi dua link roi bao user tu xem; chi dua link [Xem them](search_url) khi tool tra ve 'error'
11) Voi get_gold_price: neu tool tra ve 'prices' (KHONG co 'error'), PHAI tra loi NGAY trong chat gia mua/ban (don vi VND/luong, ghi ro la gia 1 luong = 10 chi = 37.5g) cua loai vang user hoi, kem gio cap nhat - tuyet doi KHONG chi dua link roi bao user tu xem; chi dua link [Xem them](search_url) khi tool tra ve 'error'
12) Voi get_flight_prices: neu tool tra ve 'flights' (KHONG co 'error'), PHAI liet ke NGAY trong chat vai chuyen bay tieu bieu (hang bay, gia VND, ngay bay) va noi ro day la gia re gan nhat he thong tim duoc (co the khong dung ngay user hoi va gia co the da thay doi), kem link [Xem va dat ve](booking_link) de user kiem tra gia chinh xac theo ngay; chi dua link [Tim chuyen bay](search_url) khi tool tra ve 'error'
13) Voi get_hotel_prices: neu tool tra ve 'search_results' (KHONG co 'error'):
   - PHAI tom tat NGAY trong chat ten khach san/homestay cu the va gia phong tim thay duoc tu cac ket qua tim kiem (Booking.com/Agoda/Traveloka...)
   - QUAN TRONG - LINK TRUC TIEP: voi MOI khach san duoc nhac ten, neu ket qua tim kiem tuong ung co 'link' la trang RIENG cua khach san do (URL chua "/hotel/" hoac duong dan toi 1 cho cu the, vi du booking.com/hotel/vn/xxx.html, agoda.com/.../hotel/..., traveloka.com/.../hotel/...), PHAI gan ten khach san do thanh link markdown toi dung 'link' nay, vi du: **[TTR Skypool Boutique Hotel](https://www.booking.com/hotel/vn/...)**. Day la link dat phong TRUC TIEP, uu tien cao nhat.
   - Neu mot ket qua chi la trang tim kiem/danh sach chung (vd .../searchresults.html?ss=...), KHONG dung lam link cho ten khach san cu the - chi dung 'booking_link' cho phan "xem them lua chon" o cuoi
   - Neu co 'hotel_list' (OSM) thi co the nhac them 1-2 ten/dia chi khach san khac tai khu vuc, kem 'maps_link' cua chung
   - Cuoi cau tra loi: nhac ngan gon rang gia chi la tham khao tai thoi diem tim kiem, co the khac theo loai phong/ngay cu the va da thay doi, kem 1 link tong hop [Xem them lua chon & dat phong theo ngay](booking_link) de user tu loc
   - Chi dua link [Tim khach san](booking_link hoac search_url) lam link DUY NHAT khi tool tra ve 'error' hoac khong co search_results
14) Voi search_places: neu tool tra ve 'price_search_results' (gia mon/menu/dich vu/ve tham khao - ap dung cho an uong, spa, giai tri), PHAI tom tat NGAY trong chat gia tim thay duoc tu cac ket qua tim kiem do (menu, dich vu spa/massage, ve vao cong/xem phim...), ben canh thong tin ten/dia chi/danh gia dia diem, va nhac 'price_note' rang gia co the khac theo chi nhanh, thoi diem va da thay doi. Neu mot 'price_search_results' item co 'link' rieng (website/fanpage/trang dat ve cua chinh dia diem do, khong phai trang tong hop), co the gan link do vao ten dia diem tuong ung de user xem chi tiet
   - Voi an uong (isFood): neu tool tra ve 'order_search_results' (khong rong) - day la cac trang CU THE (khong phai trang chu) tren ShopeeFood/GrabFood/Baemin cho dung loai mon/khu vuc user hoi - PHAI gioi thieu 1-2 ket qua dau dang link markdown ngay sau danh sach quan, vi du [Dat online: {title}](link), va noi ro day la link dat hang online TRUC TIEP, uu tien cao. Neu 'order_search_results' rong/khong co, dua 'order_links' (ShopeeFood/GrabFood/BeFood) de user tu mo app tim quan va dat hang
15) Voi search_products: neu tool tra ve 'search_results' (gia san pham tu Google Search, KHONG co 'error'), PHAI tom tat NGAY trong chat ten san pham va gia tim thay duoc tu ket qua tim kiem. Neu mot ket qua co 'link' tro toi dung trang san pham cu the (vd shopee.vn/...-i.xxx.yyy, tiki.vn/...-p123456.html, lazada.vn/products/...), PHAI gan ten san pham do thanh link markdown toi dung 'link' nay - day la link mua TRUC TIEP, uu tien hon link tim kiem chung; cac link Shopee/Tiki/Lazada con lai (tu mang 'links') dung lam "xem them lua chon" o cuoi. Neu khong co 'search_results' (chi co 'note'/'links'), gioi thieu cac link san thuong mai dien tu do
16) Voi get_transport_options:
   - Neu type='intercity': neu co 'bus_search_results' hoac 'train_search_results' khong rong, PHAI tom tat NGAY cac lua chon xe khach/tau (nha xe/tuyen, gia, gio chay neu co trong tieu de/snippet) tu cac ket qua do. Neu mot ket qua co 'link' rieng den trang tuyen/nha xe cu the (vd vexere.com/..., futabus.vn/..., dsvn.vn/...), PHAI gan ten nha xe/chuyen do thanh link markdown toi 'link' nay - day la link xem/dat ve TRUC TIEP, uu tien cao nhat. Cuoi cau tra loi dua them link tong hop [Xem them ve xe tren Vexere](vexere_link) va [Dat ve tau](train_booking_link)
   - Neu type='taxi': PHAI tra loi NGAY khoang cach uoc tinh ('distance_km' km) va khoang gia tham khao ('estimated_fare_vnd', VND), noi ro day la GIA UOC TINH khong phai gia chinh xac tu app, kem link cac app dat xe (Grab/Xanh SM/Be tu 'apps') de user tu mo app xem gia thuc te va dat xe
   - Neu tool tra ve 'error', dua cac link con lai ('vexere_link'/'train_booking_link'/'apps') va goi y user thu lai voi dia diem ro hon`

export const maxDuration = 60

export async function POST(req: Request) {
  const startTime = Date.now()
  const { messages } = await req.json()

  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const rawContent = lastUserMsg?.content
  const lastText = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((c: { text?: string }) => c.text || '').join(' ')
      : ''
  const intent = classifyIntent(lastText)
  const budget = extractBudget(lastText)
  const locationIntent = detectLocationIntent(lastText)

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: buildSystem(budget, locationIntent),
    messages,
    maxTokens: intent === 'chitchat' ? 300 : 2048,
    maxSteps: intent === 'chitchat' ? 1 : 5,
    experimental_prepareStep: async ({ stepNumber }: { stepNumber: number }) => {
      if (intent === 'chitchat') return { toolChoice: 'none' as const }
      if (stepNumber === 0) {
        const forced = detectForcedTool(lastText)
        // Offline location + product search → switch to search_places
        if (forced === 'search_products' && locationIntent === 'offline') {
          return { toolChoice: { type: 'tool' as const, toolName: 'search_places' } }
        }
        // No forced tool + offline location → search_places (user wants physical location)
        if (!forced && locationIntent === 'offline') {
          return { toolChoice: { type: 'tool' as const, toolName: 'search_places' } }
        }
        // Unknown intent + shopping keywords → no tool, ask clarification
        if (!forced && locationIntent === 'unknown' && isShoppingQuery(lastText)) {
          return { toolChoice: 'none' as const }
        }
        if (forced) return { toolChoice: { type: 'tool' as const, toolName: forced } }
        return { toolChoice: 'required' as const }
      }
      return { toolChoice: 'none' as const }
    },
    tools: {
      search_places: tool({
        description: 'Tim dia diem, nha hang, cafe, spa, khach san, benh vien, giai tri (rap phim, karaoke, gym, bar...) tai Viet Nam. Voi quan an/nha hang/cafe/spa/giai tri se kem gia mon/dich vu/ve tham khao tu Google Search (Serper)',
        parameters: z.object({
          query: z.string().describe('Tu khoa tim kiem (vd: pho ngon, cafe dep, spa tot)'),
          location: z.string().optional().describe('Khu vuc (vd: Ha Noi, Quan 1 Ho Chi Minh, Da Nang)'),
          type: z.enum(['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema']).optional()
        }),
        execute: async ({ query, location, type }) => {
          const r = await searchPlaces(query, location, type)
          return budget ? applyBudgetFilter(r, budget, query) : r
        }
      }),
      get_news: tool({
        description: 'Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri',
        parameters: z.object({ query: z.string().describe('Tu khoa tin tuc can tim') }),
        execute: async ({ query }) => getNews(query)
      }),
      search_products: tool({
        description: 'Tim san pham mua sam online tren Shopee, Tiki, Lazada, kem gia tham khao tu Google Search (Serper)',
        parameters: z.object({ query: z.string().describe('Ten san pham can tim mua') }),
        execute: async ({ query }) => {
          const r = await searchProducts(query)
          return budget ? applyBudgetFilter(r, budget, query) : r
        }
      }),
      web_search: tool({
        description: 'Tim kiem tong quat tren internet de lay thong tin moi nhat (ty gia, gia xang, su kien, kien thuc can xac thuc...) khi cac tool khac khong phu hop',
        parameters: z.object({ query: z.string().describe('Tu khoa can tim kiem (vd: ty gia USD hom nay)') }),
        execute: async ({ query }) => webSearch(query)
      }),
      get_weather: tool({
        description: 'Lay thong tin thoi tiet hien tai va du bao hom nay (nhiet do, tinh trang troi, do am, gio) cho mot dia diem tai Viet Nam, du lieu realtime tu wttr.in',
        parameters: z.object({ location: z.string().describe('Ten thanh pho/tinh can xem thoi tiet (vd: Ha Noi, Da Nang, TP HCM)') }),
        execute: async ({ location }) => getWeather(location)
      }),
      get_gold_price: tool({
        description: 'Lay gia vang SJC, PNJ, DOJI, vang the gioi (XAU/USD) realtime, cap nhat moi 5 phut tu vang.today',
        parameters: z.object({ query: z.string().optional().describe('Loai vang user hoi, vd: SJC, PNJ, vang the gioi (khong bat buoc)') }),
        execute: async ({ query }) => getGoldPrice(query || '')
      }),
      get_flight_prices: tool({
        description: 'Tim gia ve may bay re gan nhat giua 2 thanh pho/san bay, du lieu tu Travelpayouts (Aviasales)',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten thanh pho hoac ma san bay IATA, vd: Ha Noi, HAN)'),
          destination: z.string().describe('Diem den (ten thanh pho hoac ma san bay IATA, vd: TP HCM, SGN)'),
        }),
        execute: async ({ origin, destination }) => {
          const r = await getFlightPrices(origin, destination)
          return budget ? applyBudgetFilter(r, budget, 've may bay') : r
        }
      }),
      get_hotel_prices: tool({
        description: 'Tim gia phong khach san/resort tai mot dia diem, ket hop tim kiem web (Booking.com/Agoda) va danh sach khach san tu OpenStreetMap'
          + (budget ? `. BUDGET FILTER: Chi duoc de cap khach san co gia duoi ${budget.max.toLocaleString('vi-VN')} VND. KHONG duoc de cap: Pullman, Marriott, Hilton, Sheraton, Intercontinental, Sofitel, Novotel, Melia, Hyatt, Imperial, hay bat ky khach san 4-5 sao nao (gia > 1.500.000 VND/dem). Chi lay tu search results, khong them tu kien thuc co san.` : ''),
        parameters: z.object({
          location: z.string().describe('Dia diem/thanh pho can tim khach san (vd: Da Nang, Phu Quoc, Ha Noi)'),
          checkIn: z.string().optional().describe('Ngay check-in dang YYYY-MM-DD (khong bat buoc)'),
          checkOut: z.string().optional().describe('Ngay check-out dang YYYY-MM-DD (khong bat buoc)'),
        }),
        execute: async ({ location, checkIn, checkOut }) => {
          const r = await getHotelPrices(location, checkIn, checkOut, budget?.max)
          return budget ? applyBudgetFilter(r, budget, 'khach san') : r
        }
      }),
      get_transport_options: tool({
        description: 'Tim phuong an di chuyen: ve xe khach/tau hoa giua 2 tinh/thanh pho (tim kiem web, kem link dat ve cu the), hoac uoc tinh khoang cach + gia taxi/xe cong nghe (Grab/Be/Xanh SM) cho di chuyen trong thanh pho/quang duong ngan',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten tinh/thanh pho hoac dia diem cu the)'),
          destination: z.string().describe('Diem den (ten tinh/thanh pho hoac dia diem cu the)'),
          mode: z.enum(['intercity', 'taxi']).optional().describe('"intercity" cho xe khach/tau giua 2 tinh thanh, "taxi" cho di chuyen trong thanh pho/quang duong ngan bang taxi/xe cong nghe. Bo trong neu khong ro.'),
        }),
        execute: async ({ origin, destination, mode }) => getTransportOptions(origin, destination, mode === 'taxi' ? 'taxi' : undefined)
      }),
    },
    onFinish: ({ usage, finishReason }) => {
      console.log(JSON.stringify({
        type: 'tappyai_usage',
        intent,
        finishReason,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        elapsedMs: Date.now() - startTime,
        cacheSize: cache.size,
      }))
    },
  })
  const baseResponse = result.toDataStreamResponse()
  return (budget && budget.max < LUXURY_PRICE_FLOOR)
    ? applyLuxuryStreamFilter(baseResponse)
    : baseResponse
}

// ===== LUXURY STREAM FILTER =====
const LUXURY_BRANDS_FILTER = [
  'Pullman', 'pullman',
  'Marriott', 'marriott',
  'Hilton', 'hilton',
  'Sheraton', 'sheraton',
  'Intercontinental', 'intercontinental',
  'Sofitel', 'sofitel',
  'Novotel', 'novotel',
  'Melia', 'melia',
  'Hyatt', 'hyatt',
  'Wyndham', 'wyndham',
  'Movenpick', 'movenpick',
  'Radisson', 'radisson',
  'Renaissance', 'renaissance',
  'Imperial Hotel', 'imperial hotel',
]

function filterLuxuryBrands(text: string): string {
  let out = text
  for (const brand of LUXURY_BRANDS_FILTER) {
    if (out.includes(brand)) {
      out = out.split(brand).join('khách sạn')
    }
  }
  return out
}

function applyLuxuryStreamFilter(response: Response): Response {
  const body = response.body
  if (!body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let lineRemainder = ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transform = new TransformStream<any, any>({
    transform(chunk, controller) {
      lineRemainder += decoder.decode(chunk, { stream: true })
      const parts = lineRemainder.split('\n')
      lineRemainder = parts.pop() ?? ''

      for (const line of parts) {
        if (line.startsWith('0:')) {
          try {
            const text = JSON.parse(line.slice(2)) as string
            const filtered = filterLuxuryBrands(text)
            controller.enqueue(encoder.encode('0:' + JSON.stringify(filtered) + '\n'))
          } catch {
            controller.enqueue(encoder.encode(line + '\n'))
          }
        } else {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    },
    flush(controller) {
      if (lineRemainder) {
        if (lineRemainder.startsWith('0:')) {
          try {
            const text = JSON.parse(lineRemainder.slice(2)) as string
            const filtered = filterLuxuryBrands(text)
            controller.enqueue(encoder.encode('0:' + JSON.stringify(filtered) + '\n'))
          } catch {
            controller.enqueue(encoder.encode(lineRemainder + '\n'))
          }
        } else {
          controller.enqueue(encoder.encode(lineRemainder + '\n'))
        }
      }
    }
  })

  return new Response(body.pipeThrough(transform), {
    status: response.status,
    headers: response.headers,
  })
}
