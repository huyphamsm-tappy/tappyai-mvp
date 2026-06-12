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
function classifyIntent(text: string): 'chitchat' | 'tool' {
  const t = text.toLowerCase().trim()
  if (t.length === 0 || t.length > 40) return 'tool'
  const chitchat = /^(chao|hi|hello|alo|xin chao|cam on|cảm ơn|thank|thanks|ok|oke|okie|uh|ừ|um|tam biet|tạm biệt|bye|haha|hehe|hihi|ban la ai|bạn là ai|ban ten gi|tappyai la gi|test)/i
  return chitchat.test(t) ? 'chitchat' : 'tool'
}

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
      const name = tags['name:vi'] || tags.name || ''
      return {
        name,
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']].filter(Boolean).join(' ') || tags['addr:full'] || 'Xem ban do',
        phone: tags.phone || tags['contact:phone'] || null,
        maps_link: elat && elon ? 'https://www.google.com/maps?q=' + elat + ',' + elon : googleMapsUrl,
        ...(amenity === 'hotel' ? { booking_links: hotelBookingLinks(name, loc) } : {})
      }
    }).filter(r => r.name)
    return {
      location: loc, amenity_type: amenity, source: 'OpenStreetMap', count: results.length, results,
      google_maps_search: googleMapsUrl,
      note: results.length === 0 ? 'OSM khong co du lieu. Tim them: ' + googleMapsUrl : 'Du lieu tu OpenStreetMap. Xem them: ' + googleMapsUrl
    }
  } catch (e) { return { error: String(e), results: [], google_maps_search: googleMapsUrl } }
}

function hotelBookingLinks(name: string, location?: string) {
  const q = encodeURIComponent(name + (location ? ' ' + location : ''))
  return {
    booking_com: 'https://www.booking.com/searchresults.html?ss=' + q,
    agoda: 'https://www.agoda.com/search?q=' + q,
    traveloka: 'https://www.traveloka.com/vi-vn/hotel/search?spec=' + q,
  }
}

async function searchPlaces(query: string, location?: string, type?: string) {
  const cacheKey = 'places:' + query.toLowerCase().trim() + ':' + (location || '').toLowerCase().trim() + ':' + (type || '')
  const cached = getCache(cacheKey)
  if (cached) return cached

  const isHotel = type === 'hotel' || /khach san|hotel|resort|homestay|villa|nha nghi|nghi duong/i.test(query + ' ' + (location || ''))
  const key = process.env.GOOGLE_PLACES_API_KEY
  let result: unknown = null
  if (key) {
    try {
      const sq = location ? query + ' ' + location : query
      const resp = await Promise.race([
        fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.priceLevel,places.priceRange',
          },
          body: JSON.stringify({ textQuery: sq, languageCode: 'vi', regionCode: 'VN' })
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
      const d = await (resp as Response).json()
      if (d.places?.length) {
        const priceLevelMap: Record<string, string> = {
          PRICE_LEVEL_FREE: 'Mien phi',
          PRICE_LEVEL_INEXPENSIVE: 'Gia re',
          PRICE_LEVEL_MODERATE: 'Gia trung binh',
          PRICE_LEVEL_EXPENSIVE: 'Gia cao',
          PRICE_LEVEL_VERY_EXPENSIVE: 'Rat cao',
        }
        result = {
          source: 'Google Maps', count: d.places.length,
          results: d.places.slice(0, 8).map((r: { displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number; googleMapsUri?: string; priceLevel?: string; priceRange?: { startPrice?: { units?: string; currencyCode?: string }; endPrice?: { units?: string; currencyCode?: string } } }) => {
            let price: string | null = null
            if (r.priceRange?.startPrice || r.priceRange?.endPrice) {
              const cur = r.priceRange.startPrice?.currencyCode || r.priceRange.endPrice?.currencyCode || ''
              const lo = r.priceRange.startPrice?.units
              const hi = r.priceRange.endPrice?.units
              price = lo && hi ? lo + ' - ' + hi + ' ' + cur : (lo || hi || '') + ' ' + cur
            } else if (r.priceLevel && priceLevelMap[r.priceLevel]) {
              price = priceLevelMap[r.priceLevel]
            }
            const placeName = r.displayName?.text || ''
            return {
              name: placeName, address: r.formattedAddress,
              rating: r.rating ? r.rating + '/5 (' + (r.userRatingCount ?? 0) + ' danh gia)' : 'Chua co danh gia',
              price_range: price || 'Khong co thong tin gia tu Google Maps',
              maps_link: r.googleMapsUri || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(sq)),
              ...(isHotel ? { booking_links: hotelBookingLinks(placeName, location) } : {})
            }
          })
        }
      } else {
        console.log(JSON.stringify({ type: 'tappyai_places_debug', error: d.error || null }))
      }
    } catch (e) { console.log(JSON.stringify({ type: 'tappyai_places_debug', error: String(e) })) }
  }
  if (!result) result = await searchPlacesOSM(query, location)
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

  type TikiProduct = {
    name?: string; price?: number; original_price?: number; discount_rate?: number
    rating_average?: number; review_count?: number; url_path?: string
  }
  let products: Array<{ name?: string; price: string | null; original_price: string | null; discount: string | null; rating: string | null; link: string | null }> = []
  try {
    const resp = await Promise.race([
      fetch('https://tiki.vn/api/v2/products?limit=8&q=' + encodeURIComponent(query), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
    if ((resp as Response).ok) {
      const d = await (resp as Response).json()
      products = ((d.data || []) as TikiProduct[]).slice(0, 6).map(p => ({
        name: p.name,
        price: p.price != null ? p.price.toLocaleString('vi-VN') + ' VND' : null,
        original_price: (p.original_price != null && p.original_price !== p.price) ? p.original_price.toLocaleString('vi-VN') + ' VND' : null,
        discount: p.discount_rate ? '-' + p.discount_rate + '%' : null,
        rating: p.rating_average ? p.rating_average + '/5 (' + (p.review_count ?? 0) + ' danh gia)' : null,
        link: p.url_path ? 'https://tiki.vn/' + p.url_path : null,
      }))
    }
  } catch { /* fallback to links only */ }

  const result = {
    note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam',
    source: products.length ? 'Tiki' : undefined,
    products,
    links
  }
  setCache(cacheKey, result, 15 * 60 * 1000)
  return result
}

const SYSTEM = `Ban la TappyAI - tro ly AI thuan Viet chuyen tu van dich vu tai Viet Nam.
CHUYEN MON: An uong · Mua sam · Giai tri · Du lich · Spa & Lam dep · Tin tuc
CONG CU: search_places (Google Maps/OSM), get_news (VnExpress/Tuoi Tre/Dan Tri), search_products (Shopee/Tiki/Lazada)

NGUYEN TAC BAT BUOC:
1) LUON goi tool khi user hoi ve dia diem, tin tuc, san pham - khong tra loi tu bo nho
2) Neu tool tra ve du lieu: hien thi ten, dia chi, link ban do cu the
3) Neu tool tra ve google_maps_search URL: LUON hien thi link do cho user
4) Neu khong co du lieu OSM: van tra loi "Tim them tren Google Maps: [link]"
5) Tra loi tieng Viet than thien, co link cu the de user click
6) TUYET DOI KHONG noi "he thong gap su co" hay "toi khong co thong tin" khi da co google_maps link
7) Voi cau chao hoi/cam on xa giao: tra loi ngan gon, than thien, khong can goi tool
8) Ve gia ca (gia phong, gia ve, gia mon...): hien thi field price_range neu co. Neu price_range la "Khong co thong tin gia tu Google Maps", KHONG noi "khong the truy cap" - thay vao do tra loi: "Google Maps khong cung cap gia chi tiet cho dia diem nay, ban xem gia thuc te tai link Google Maps hoac cac trang dat phong nhu Booking.com, Agoda, Traveloka" va van hien thi day du ten/dia chi/link
9) Neu ket qua co field booking_links (danh sach khach san/resort/homestay): LUON hien thi 3 link "Xem gia & dat phong tren Booking.com / Agoda / Traveloka" (booking_com, agoda, traveloka) ngay sau thong tin cua tung khach san, de user bam vao xem gia thuc te va dat phong
10) Voi search_products: neu ket qua co field products (du lieu gia thuc te tu Tiki) va khong rong, hien thi cho moi san pham: ten, gia (price), gia goc va % giam (original_price, discount) neu co, danh gia (rating), va link san pham (link) de user bam vao xem & dat hang ngay. Sau danh sach san pham, van hien thi them 3 link tim kiem Shopee/Tiki/Lazada (field links) de user so sanh gia tren cac san khac. Neu products rong, chi hien thi 3 link tim kiem do`

export const maxDuration = 60

export async function POST(req: Request) {
  const startTime = Date.now()
  const { messages } = await req.json()

  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const lastText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : ''
  const intent = classifyIntent(lastText)

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: SYSTEM,
    messages,
    maxTokens: intent === 'chitchat' ? 300 : 2048,
    maxSteps: intent === 'chitchat' ? 1 : 5,
    experimental_prepareStep: async ({ stepNumber }: { stepNumber: number }) => {
      if (intent === 'chitchat') return { toolChoice: 'none' as const }
      if (stepNumber === 0) return { toolChoice: 'required' as const }
      return { toolChoice: 'none' as const }
    },
    tools: {
      search_places: tool({
        description: 'Tim dia diem, nha hang, cafe, spa, khach san, benh vien tai Viet Nam',
        parameters: z.object({
          query: z.string().describe('Tu khoa tim kiem (vd: pho ngon, cafe dep, spa tot)'),
          location: z.string().optional().describe('Khu vuc (vd: Ha Noi, Quan 1 Ho Chi Minh, Da Nang)'),
          type: z.enum(['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema']).optional()
        }),
        execute: async ({ query, location, type }) => searchPlaces(query, location, type)
      }),
      get_news: tool({
        description: 'Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri',
        parameters: z.object({ query: z.string().describe('Tu khoa tin tuc can tim') }),
        execute: async ({ query }) => getNews(query)
      }),
      search_products: tool({
        description: 'Tim san pham mua sam online tren Shopee, Tiki, Lazada',
        parameters: z.object({ query: z.string().describe('Ten san pham can tim mua') }),
        execute: async ({ query }) => searchProducts(query)
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
  return result.toDataStreamResponse()
}
