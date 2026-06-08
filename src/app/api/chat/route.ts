import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function getNews(query: string) {
  const feeds = [
    { url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', name: 'VnExpress' },
    { url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', name: 'Tuoi Tre' },
    { url: 'https://dantri.com.vn/rss/home.rss', name: 'Dan Tri' },
  ]
  try {
    const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 2)
    const articles: Array<{ title: string; description: string; link: string; source: string; published: string }> = []
    await Promise.all(feeds.map(async feed => {
      try {
        const resp = await Promise.race([
          fetch(feed.url, { headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
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
    if (articles.length === 0) return { note: 'Khong tim thay tin tuc lien quan', articles: [] }
    return { query, total: articles.length, articles: articles.slice(0, 5) }
  } catch { return { error: 'Khong the tai tin tuc', articles: [] } }
}

async function searchPlacesOSM(query: string, location?: string) {
  const loc = location || 'Ha Noi'
  const googleMapsUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(query + ' ' + loc)

  try {
    // Geocode location
    let lat = 21.0285, lon = 105.8542
    try {
      const geoResp = await Promise.race([
        fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(loc + ' Vietnam') + '&format=json&limit=1', {
          headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' }
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      ])
      const geoData = await (geoResp as Response).json()
      if (geoData[0]) { lat = parseFloat(geoData[0].lat); lon = parseFloat(geoData[0].lon) }
    } catch { /* use default Hanoi coords */ }

    // Determine amenity type
    const ql = query.toLowerCase()
    let amenity = 'restaurant'
    if (ql.match(/cafe|ca phe|coffee|cà phê/)) amenity = 'cafe'
    else if (ql.match(/spa|massage/)) amenity = 'spa'
    else if (ql.match(/hotel|khách sạn|khach san|resort/)) amenity = 'hotel'
    else if (ql.match(/bar|pub/)) amenity = 'bar'
    else if (ql.match(/gym|fitness/)) amenity = 'gym'
    else if (ql.match(/cinema|phim|rạp/)) amenity = 'cinema'
    else if (ql.match(/bệnh viện|benh vien|hospital|clinic|phòng khám/)) amenity = 'hospital'
    else if (ql.match(/pharmacy|thuốc|nha thuoc/)) amenity = 'pharmacy'
    else if (ql.match(/atm|ngân hàng|bank/)) amenity = 'bank'

    const oql = '[out:json][timeout:15];(node["amenity"="' + amenity + '"]["name"](around:5000,' + lat + ',' + lon + ');way["amenity"="' + amenity + '"]["name"](around:5000,' + lat + ',' + lon + '););out center 15;'

    // Try multiple Overpass endpoints
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ]

    let overpassData: { elements?: unknown[] } | null = null
    for (const endpoint of endpoints) {
      try {
        const resp = await Promise.race([
          fetch(endpoint + '?data=' + encodeURIComponent(oql), {
            headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' }
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000))
        ])
        if ((resp as Response).ok) {
          overpassData = await (resp as Response).json()
          break
        }
      } catch { continue }
    }

    if (!overpassData) {
      return {
        note: 'Tim kiem tren Google Maps: ' + googleMapsUrl,
        google_maps_search: googleMapsUrl,
        results: []
      }
    }

    type El = { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }
    const results = ((overpassData.elements || []) as El[]).slice(0, 10).map(el => {
      const tags = el.tags || {}
      const elat = el.lat ?? el.center?.lat
      const elon = el.lon ?? el.center?.lon
      return {
        name: tags['name:vi'] || tags.name || '',
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']].filter(Boolean).join(' ') || tags['addr:full'] || 'Xem ban do',
        phone: tags.phone || tags['contact:phone'] || null,
        website: tags.website || tags['contact:website'] || null,
        opening_hours: tags.opening_hours || null,
        rating: null,
        maps_link: elat && elon ? 'https://www.google.com/maps?q=' + elat + ',' + elon : googleMapsUrl
      }
    }).filter(r => r.name)

    return {
      location: loc,
      amenity_type: amenity,
      source: 'OpenStreetMap',
      count: results.length,
      results,
      google_maps_search: googleMapsUrl,
      note: results.length === 0
        ? 'OSM khong co du lieu. Tim them: ' + googleMapsUrl
        : 'Du lieu tu OpenStreetMap. Xem them: ' + googleMapsUrl
    }
  } catch (e) {
    return { error: String(e), results: [], google_maps_search: googleMapsUrl }
  }
}

async function searchPlaces(query: string, location?: string, type?: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (key) {
    try {
      const sq = location ? query + ' ' + location : query
      const p = new URLSearchParams({ query: sq, key, language: 'vi', region: 'vn' })
      if (type) p.set('type', type)
      const resp = await Promise.race([
        fetch('https://maps.googleapis.com/maps/api/place/textsearch/json?' + p),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ])
      const d = await (resp as Response).json()
      if (d.status === 'OK' && d.results?.length) {
        return {
          source: 'Google Maps',
          count: d.results.length,
          results: d.results.slice(0, 5).map((r: Record<string, unknown>) => ({
            name: r.name,
            address: r.formatted_address,
            rating: r.rating ? r.rating + '/5 (' + r.user_ratings_total + ' danh gia)' : 'Chua co danh gia',
            open_now: (r.opening_hours as Record<string, unknown>)?.open_now != null
              ? ((r.opening_hours as Record<string, unknown>).open_now ? 'Dang mo cua' : 'Da dong cua')
              : null,
            maps_link: 'https://www.google.com/maps/place/?q=place_id:' + r.place_id
          }))
        }
      }
    } catch { /* fallback to OSM */ }
  }
  return searchPlacesOSM(query, location)
}

async function searchProducts(query: string) {
  try {
    const shopeeUrl = 'https://shopee.vn/search?keyword=' + encodeURIComponent(query)
    const tikiUrl = 'https://tiki.vn/search?q=' + encodeURIComponent(query)
    return {
      note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam',
      links: [
        { name: 'Shopee', url: shopeeUrl },
        { name: 'Tiki', url: tikiUrl },
        { name: 'Lazada', url: 'https://www.lazada.vn/catalog/?q=' + encodeURIComponent(query) },
      ]
    }
  } catch { return { note: 'Tim "' + query + '" tren Shopee.vn · Tiki.vn · Lazada.vn', results: [] } }
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
6) TUYET DOI KHONG noi "he thong gap su co" hay "toi khong co thong tin" khi da co google_maps link`

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: SYSTEM,
    messages,
    maxTokens: 2048,
    maxSteps: 5,
    experimental_prepareStep: async ({ stepNumber }: { stepNumber: number }) => {
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
        parameters: z.object({
          query: z.string().describe('Tu khoa tin tuc can tim')
        }),
        execute: async ({ query }) => getNews(query)
      }),
      search_products: tool({
        description: 'Tim san pham mua sam online tren Shopee, Tiki, Lazada',
        parameters: z.object({
          query: z.string().describe('Ten san pham can tim mua')
        }),
        execute: async ({ query }) => searchProducts(query)
      }),
    },
  })

  const encoder = new TextEncoder()
  const NL = '\n'
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode('data: ' + JSON.stringify({ text: chunk }) + NL + NL))
        }
        controller.enqueue(encoder.encode('data: [DONE]' + NL + NL))
      } catch {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({ text: 'Xin loi, co loi xay ra. Ban thu lai nhe!' }) + NL + NL))
        controller.enqueue(encoder.encode('data: [DONE]' + NL + NL))
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
