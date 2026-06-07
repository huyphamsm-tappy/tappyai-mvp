import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ===== NEWS: Vietnamese RSS feeds (free, no API key) =====
async function getNews(query: string) {
  const feeds = [
    { url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', name: 'VnExpress' },
    { url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', name: 'Tuoi Tre' },
    { url: 'https://dantri.com.vn/rss/home.rss', name: 'Dan Tri' },
  ]

  try {
    const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 2)
    const articles: Array<{
      title: string
      description: string
      link: string
      source: string
      published: string
    }> = []

    await Promise.all(
      feeds.map(async feed => {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 5000)
          const resp = await fetch(feed.url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'TappyAI/1.0' },
          })
          clearTimeout(timer)
          const xml = await resp.text()
          const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []

          for (const item of items.slice(0, 30)) {
            if (articles.length >= 8) break
            const title = (
              item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] ||
              item.match(/<title>(.*?)<\/title>/)?.[1] ||
              ''
            ).trim()
            const description = (
              item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] ||
              item.match(/<description>(.*?)<\/description>/)?.[1] ||
              ''
            ).replace(/<[^>]*>/g, '').trim()
            const link = (
              item.match(/<link>(.*?)<\/link>/)?.[1] ||
              item.match(/<guid>(.*?)<\/guid>/)?.[1] ||
              ''
            ).trim()
            const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
            if (!title) continue
            const titleLower = title.toLowerCase()
            const descLower = description.toLowerCase()
            const matches =
              queryTerms.length === 0 ||
              queryTerms.some(t => titleLower.includes(t) || descLower.includes(t))
            if (matches) {
              articles.push({
                title,
                description: description.slice(0, 200) + (description.length > 200 ? '...' : ''),
                link,
                source: feed.name,
                published: pubDate ? new Date(pubDate).toLocaleDateString('vi-VN') : 'Moi nhat',
              })
            }
          }
        } catch { /* skip failed feed */ }
      })
    )

    if (articles.length === 0) {
      return {
        note: 'Khong tim thay tin tuc lien quan. Thu tim truc tiep tren vnexpress.net hoac tuoitre.vn',
        articles: [],
      }
    }
    return { query, total: articles.length, articles: articles.slice(0, 5) }
  } catch {
    return { error: 'Khong the tai tin tuc luc nay', articles: [] }
  }
}

// ===== PLACES: OpenStreetMap (free) + Google Places fallback =====
async function searchPlaces(query: string, location?: string, type?: string) {
  const googleKey = process.env.GOOGLE_PLACES_API_KEY
  if (googleKey) {
    try {
      const result = await searchPlacesGoogle(query, location, type, googleKey)
      if (result.results && result.results.length > 0) return result
    } catch { /* fall through to OSM */ }
  }
  return searchPlacesOSM(query, location)
}

async function searchPlacesGoogle(
  query: string,
  location: string | undefined,
  type: string | undefined,
  apiKey: string
) {
  const searchQuery = location ? query + ' ' + location : query
  const params = new URLSearchParams({ query: searchQuery, key: apiKey, language: 'vi', region: 'vn' })
  if (type) params.set('type', type)
  const resp = await fetch('https://maps.googleapis.com/maps/api/place/textsearch/json?' + params)
  const data = await resp.json()
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return { error: 'Google Places: ' + data.status, results: [] }
  }
  return {
    source: 'Google Maps',
    results: (data.results || []).slice(0, 5).map((p: Record<string, unknown>) => ({
      name: p.name,
      address: p.formatted_address,
      rating: p.rating ? p.rating + '/5 (' + (p.user_ratings_total) + ' danh gia)' : 'Chua co danh gia',
      price_level: p.price_level ? 'D'.repeat(p.price_level as number) : null,
      open_now: (p.opening_hours as Record<string, unknown>)?.open_now != null
        ? ((p.opening_hours as Record<string, unknown>).open_now ? 'Dang mo cua' : 'Da dong cua')
        : null,
      google_maps: 'https://www.google.com/maps/place/?q=place_id:' + p.place_id,
    })),
  }
}

async function searchPlacesOSM(query: string, location?: string) {
  try {
    const geoLocation = location || 'Ha Noi'
    const geocodeCtrl = new AbortController()
    const geocodeTimer = setTimeout(() => geocodeCtrl.abort(), 4000)
    const geoResp = await fetch(
      'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(geoLocation + ' Viet Nam') + '&format=json&limit=1',
      { signal: geocodeCtrl.signal, headers: { 'User-Agent': 'TappyAI/1.0' } }
    )
    clearTimeout(geocodeTimer)
    const geoData = await geoResp.json()
    const lat = parseFloat(geoData[0]?.lat ?? '21.0285')
    const lon = parseFloat(geoData[0]?.lon ?? '105.8542')

    const queryLower = query.toLowerCase()
    let amenity = 'restaurant'
    if (queryLower.match(/cafe|ca phe|coffee/)) amenity = 'cafe'
    else if (queryLower.match(/spa|massage/)) amenity = 'spa'
    else if (queryLower.match(/khach san|hotel|resort/)) amenity = 'hotel'
    else if (queryLower.match(/bar|pub|bia/)) amenity = 'bar'
    else if (queryLower.match(/gym|fitness/)) amenity = 'gym'
    else if (queryLower.match(/rap|cinema|phim/)) amenity = 'cinema'

    const oql = '[out:json][timeout:8];(node["amenity"="' + amenity + '"]["name"](around:3000,' + lat + ',' + lon + ');way["amenity"="' + amenity + '"]["name"](around:3000,' + lat + ',' + lon + '););out center 10;'
    const overpassCtrl = new AbortController()
    const overpassTimer = setTimeout(() => overpassCtrl.abort(), 8000)
    const overpassResp = await fetch(
      'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(oql),
      { signal: overpassCtrl.signal, headers: { 'User-Agent': 'TappyAI/1.0' } }
    )
    clearTimeout(overpassTimer)
    const overpassData = await overpassResp.json()

    type OsmElement = { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }
    const elements = (overpassData.elements || []) as OsmElement[]

    const results = elements.slice(0, 8).map(el => {
      const tags = el.tags || {}
      const elLat = el.lat ?? el.center?.lat
      const elLon = el.lon ?? el.center?.lon
      return {
        name: tags['name:vi'] || tags.name || '',
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']].filter(Boolean).join(' ') || 'Xem tren ban do',
        phone: tags.phone || tags['contact:phone'] || null,
        website: tags.website || null,
        opening_hours: tags.opening_hours || null,
        cuisine: tags.cuisine?.replace(/;/g, ', ') || null,
        maps_link: elLat && elLon ? 'https://www.google.com/maps?q=' + elLat + ',' + elLon : null,
      }
    }).filter(r => r.name)

    return {
      location: geoLocation,
      amenity_type: amenity,
      source: 'OpenStreetMap',
      results,
      note: results.length === 0
        ? 'Khong tim thay "' + query + '" gan ' + geoLocation + '. Thu tim tren Google Maps.'
        : 'Du lieu tu OpenStreetMap. Nhan link ban do de xem chi tiet va danh gia.',
    }
  } catch {
    return { error: 'Khong the tai dia diem. Thu tim tren Google Maps hoac Foody.vn.', results: [] }
  }
}

// ===== PRODUCTS: Google Custom Search + DuckDuckGo fallback =====
async function searchProducts(query: string) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX
  if (apiKey && cx) {
    try {
      const params = new URLSearchParams({ q: query, key: apiKey, cx, num: '5' })
      const resp = await fetch('https://www.googleapis.com/customsearch/v1?' + params)
      const data = await resp.json()
      if (!data.error && data.items?.length) {
        return {
          source: 'Google',
          results: data.items.map((item: Record<string, unknown>) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            site: new URL(item.link as string).hostname.replace('www.', ''),
          })),
        }
      }
    } catch { /* fall through */ }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const params = new URLSearchParams({ q: query + ' mua online Viet Nam', format: 'json', no_html: '1', skip_disambig: '1' })
    const resp = await fetch('https://api.duckduckgo.com/?' + params, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TappyAI/1.0' },
    })
    clearTimeout(timer)
    const data = await resp.json()
    type DdgTopic = { Text?: string; FirstURL?: string }
    const results: Array<{ title: string; snippet: string; link: string; site: string }> = []
    if (data.AbstractText) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText, link: data.AbstractURL || '', site: data.AbstractSource || 'DuckDuckGo' })
    }
    for (const topic of ((data.RelatedTopics || []) as DdgTopic[]).slice(0, 4)) {
      if (topic.Text && topic.FirstURL) {
        results.push({ title: topic.Text.split(' - ')[0], snippet: topic.Text, link: topic.FirstURL, site: 'DuckDuckGo' })
      }
    }
    if (results.length === 0) {
      return { note: 'Tim "' + query + '" tren: Shopee.vn · Tiki.vn · Lazada.vn', results: [] }
    }
    return { source: 'DuckDuckGo', query, results }
  } catch {
    return { note: 'Tim "' + query + '" tren: Shopee.vn · Tiki.vn · Lazada.vn', results: [] }
  }
}

const SYSTEM_PROMPT = `Ban la TappyAI - tro ly AI thuan Viet chuyen tu van dich vu tai Viet Nam.

CHUYEN MON: An uong · Mua sam · Giai tri · Du lich · Spa & Lam dep · Tin tuc

CONG CU REAL-TIME (luon dung khi user hoi):
- search_places: Tim nha hang, quan cafe, spa, khach san, bar, gym, rap phim
- get_news: Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri
- search_products: Tim san pham tren Shopee, Tiki, Lazada

NGUYEN TAC:
1. BAT BUOC dung tools khi user hoi ve dia diem, tin tuc, san pham - KHONG tu bia thong tin
2. Tra loi bang tieng Viet, than thien nhu ban be
3. Cung cap thong tin CU THE tu ket qua tool: ten dia diem, dia chi, link Maps
4. Neu tool khong co du lieu, goi y nguon khac (Foody.vn, Google Maps, Shopee...)
5. Voi tin tuc: tom tat noi dung va chu thich nguon (VnExpress, Tuoi Tre...)
6. Voi dia diem tu OpenStreetMap: thong bao la du lieu cong dong, nhan link de xem rating day du`

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: SYSTEM_PROMPT,
    messages,
    maxTokens: 2048,
    maxSteps: 5,
    tools: {
      search_places: tool({
        description: 'Tim kiem dia diem, nha hang, quan cafe, spa, khach san tai Viet Nam. Du lieu tu OpenStreetMap hoac Google Maps.',
        parameters: z.object({
          query: z.string().describe('Loai dia diem can tim, vi du: "nha hang hai san", "quan cafe", "spa massage"'),
          location: z.string().optional().describe('Khu vuc tim kiem, vi du: "Quan 1 TP.HCM", "Ha Noi", "Da Nang"'),
          type: z.enum(['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema']).optional(),
        }),
        execute: async ({ query, location, type }) => searchPlaces(query, location, type),
      }),
      get_news: tool({
        description: 'Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri ve bat ky chu de nao',
        parameters: z.object({
          query: z.string().describe('Tu khoa tim kiem tin tuc, vi du: "kinh te", "bong da", "cong nghe"'),
        }),
        execute: async ({ query }) => getNews(query),
      }),
      search_products: tool({
        description: 'Tim kiem san pham de mua sam online tai Viet Nam (Shopee, Tiki, Lazada)',
        parameters: z.object({
          query: z.string().describe('Ten san pham can tim, vi du: "ao thun nam", "tai nghe bluetooth"'),
        }),
        execute: async ({ query }) => searchProducts(query),
      }),
    },
  })
  return result.toDataStreamResponse()
}