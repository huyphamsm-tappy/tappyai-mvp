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

// ===== Chon san tool phu hop nhat de force goi (tranh model chon nham khi toolChoice=required) =====
function detectForcedTool(text: string): 'search_places' | 'get_news' | 'search_products' | 'web_search' | null {
  const t = normalizeVN(text.toLowerCase().trim())
  if (/nha hang|quan an|an gi|an ngon|cafe|ca phe|coffee|\bspa\b|massage|khach san|\bhotel\b|resort|\bbar\b|\bpub\b|\bgym\b|fitness|rap chieu|cinema|xem phim|benh vien|hospital|clinic|pharmacy|nha thuoc|\batm\b|ngan hang|\bbank\b|dia diem|o dau|gan day|gan toi|\btiem\b/.test(t)) return 'search_places'
  if (/tin tuc|tin moi|bao chi|thoi su|tin nong|tin the gioi/.test(t)) return 'get_news'
  if (/\bmua\b|san pham|shopee|tiki|lazada|dat hang|order hang/.test(t)) return 'search_products'
  if (/gia vang|ty gia|hoi suat|gia xang|gia dau|thoi tiet|du bao|ket qua|\bti so\b|diem so|ai la|tong thong|thu tuong|chu tich|vn-index|chung khoan|xo so|lich am|ngay bao nhieu|\?|nghia la|nhu the nao|khi nao|vi sao|tai sao|moi nhat|cap nhat|hien nay|hien tai/.test(t)) return 'web_search'
  return null
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
  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut, dia diem it thay doi
  return result
}

async function searchProducts(query: string) {
  return {
    note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam',
    links: [
      { name: 'Shopee', url: 'https://shopee.vn/search?keyword=' + encodeURIComponent(query) },
      { name: 'Tiki', url: 'https://tiki.vn/search?q=' + encodeURIComponent(query) },
      { name: 'Lazada', url: 'https://www.lazada.vn/catalog/?q=' + encodeURIComponent(query) },
    ]
  }
}

// ===== WEB SEARCH: DuckDuckGo HTML (free, no API key) =====
async function webSearch(query: string) {
  const cacheKey = 'websearch:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
  let result: unknown
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

const SYSTEM = `Ban la TappyAI - tro ly AI thuan Viet chuyen tu van dich vu tai Viet Nam.
CHUYEN MON: An uong · Mua sam · Giai tri · Du lich · Spa & Lam dep · Tin tuc
CONG CU: search_places (Google Maps/OSM), get_news (VnExpress/Tuoi Tre/Dan Tri), search_products (Shopee/Tiki/Lazada), web_search (tim kiem tong quat tren internet)

NGUYEN TAC BAT BUOC:
1) LUON goi tool khi user hoi ve dia diem, tin tuc, san pham - khong tra loi tu bo nho
2) Voi cac cau hoi can thong tin moi/cap nhat khac ma 3 tool tren khong phu hop (gia ca, ty gia, thoi tiet, su kien, kien thuc can xac thuc...), LUON goi web_search - khong tra loi bang kien thuc cu trong dau
3) Neu tool tra ve du lieu: hien thi ten, dia chi, link ban do cu the
4) Neu tool tra ve google_maps_search hoac search_url: LUON hien thi link do, dat duoi dang [Xem ket qua](URL) ngay trong cau tra loi - day la yeu cau BAT BUOC, khong duoc bo qua du da goi y nguon khac
5) Neu khong co du lieu OSM: van tra loi "Tim them tren Google Maps: [link]"
6) Tra loi tieng Viet than thien, co link cu the de user click
7) TUYET DOI KHONG noi "he thong gap su co" hay "toi khong co thong tin" khi da co link de tham khao
8) Voi cau chao hoi/cam on xa giao: tra loi ngan gon, than thien, khong can goi tool
9) Voi web_search: neu ket qua co 'results', tom tat 2-3 ket qua dau (title + snippet) roi cung cap link [Xem them ket qua tim kiem](search_url); neu khong co 'results' (chi co 'note'/'search_url'), PHAI tra loi bang link [Tim kiem truc tiep](search_url) ngay, khong duoc tu liet ke cac website khac thay cho link nay`

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
      if (stepNumber === 0) {
        const forced = detectForcedTool(lastText)
        if (forced) return { toolChoice: { type: 'tool' as const, toolName: forced } }
        return { toolChoice: 'required' as const }
      }
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
      web_search: tool({
        description: 'Tim kiem tong quat tren internet de lay thong tin moi nhat (gia ca, ty gia, thoi tiet, su kien, kien thuc can xac thuc...) khi cac tool khac khong phu hop',
        parameters: z.object({ query: z.string().describe('Tu khoa can tim kiem (vd: gia vang hom nay, thoi tiet Ha Noi)') }),
        execute: async ({ query }) => webSearch(query)
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
