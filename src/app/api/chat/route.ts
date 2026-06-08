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
    { url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', name: 'Tuổi Trẻ' },
    { url: 'https://dantri.com.vn/rss/home.rss', name: 'Dân Trí' },
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
            )
              .replace(/<[^>]*>/g, '')
              .trim()

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
                published: pubDate
                  ? new Date(pubDate).toLocaleDateString('vi-VN')
                  : 'Mới nhất',
              })
            }
          }
        } catch {
          // skip failed feed
        }
      })
    )

    if (articles.length === 0) {
      return {
        note: `Không tìm thấy tin tức liên quan đến "${query}" lúc này. Thử tìm trực tiếp trên vnexpress.net hoặc tuoitre.vn`,
        articles: [],
      }
    }

    return { query, total: articles.length, articles: articles.slice(0, 5) }
  } catch {
    return { error: 'Không thể tải tin tức lúc này', articles: [] }
  }
}

// ===== PLACES: OpenStreetMap (free) + Google Places fallback =====
async function searchPlaces(query: string, location?: string, type?: string) {
  // Prefer Google Places if API key is available
  const googleKey = process.env.GOOGLE_PLACES_API_KEY
  if (googleKey) {
    try {
      const result = await searchPlacesGoogle(query, location, type, googleKey)
      if (result.results && result.results.length > 0) return result
    } catch {
      // fall through to OSM
    }
  }

  // Free fallback: OpenStreetMap (Nominatim + Overpass)
  return searchPlacesOSM(query, location)
}

async function searchPlacesGoogle(
  query: string,
  location: string | undefined,
  type: string | undefined,
  apiKey: string
) {
  const searchQuery = location ? `${query} ${location}` : query
  const params = new URLSearchParams({
    query: searchQuery,
    key: apiKey,
    language: 'vi',
    region: 'vn',
  })
  if (type) params.set('type', type)

  const resp = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
  )
  const data = await resp.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return { error: `Google Places: ${data.status}`, results: [] }
  }

  return {
    source: 'Google Maps',
    results: (data.results || [])
      .slice(0, 5)
      .map((p: Record<string, unknown>) => ({
        name: p.name,
        address: p.formatted_address,
        rating: p.rating
          ? `${p.rating}/5 (${p.user_ratings_total} đánh giá)`
          : 'Chưa có đánh giá',
        price_level: p.price_level ? '💰'.repeat(p.price_level as number) : null,
        open_now:
          (p.opening_hours as Record<string, unknown>)?.open_now != null
            ? (p.opening_hours as Record<string, unknown>).open_now
              ? '🟢 Đang mở cửa'
              : '🔴 Đã đóng cửa'
            : null,
        google_maps: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
      })),
  }
}

async function searchPlacesOSM(query: string, location?: string) {
  try {
    // Step 1: Geocode location with Nominatim
    const geoLocation = location || 'Hà Nội'
    const geocodeCtrl = new AbortController()
    const geocodeTimer = setTimeout(() => geocodeCtrl.abort(), 4000)

    const geoResp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        geoLocation + ' Việt Nam'
      )}&format=json&limit=1`,
      {
        signal: geocodeCtrl.signal,
        headers: { 'User-Agent': 'TappyAI/1.0 (contact@tappyai.vn)' },
      }
    )
    clearTimeout(geocodeTimer)
    const geoData = await geoResp.json()

    const lat = parseFloat(geoData[0]?.lat ?? '21.0285')
    const lon = parseFloat(geoData[0]?.lon ?? '105.8542')

    // Step 2: Determine OSM amenity type from query
    const queryLower = query.toLowerCase()
    let amenity = 'restaurant'
    if (queryLower.match(/cafe|cà phê|coffee|quán nước/)) amenity = 'cafe'
    else if (queryLower.match(/spa|massage|thư giãn/)) amenity = 'spa'
    else if (queryLower.match(/khách sạn|hotel|resort/)) amenity = 'hotel'
    else if (queryLower.match(/bar|pub|bia/)) amenity = 'bar'
    else if (queryLower.match(/gym|fitness|thể dục/)) amenity = 'gym'
    else if (queryLower.match(/rạp|cinema|phim|cgv|lotte/)) amenity = 'cinema'
    else if (queryLower.match(/bệnh viện|hospital|phòng khám/)) amenity = 'hospital'
    else if (queryLower.match(/trường|school|đại học/)) amenity = 'school'

    // Step 3: Overpass API query
    const oql = `[out:json][timeout:8];(node["amenity"="${amenity}"]["name"](around:3000,${lat},${lon});way["amenity"="${amenity}"]["name"](around:3000,${lat},${lon}););out center 10;`
    const overpassCtrl = new AbortController()
    const overpassTimer = setTimeout(() => overpassCtrl.abort(), 8000)

    const overpassResp = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(oql)}`,
      {
        signal: overpassCtrl.signal,
        headers: { 'User-Agent': 'TappyAI/1.0' },
      }
    )
    clearTimeout(overpassTimer)
    const overpassData = await overpassResp.json()

    type OsmElement = {
      tags?: Record<string, string>
      lat?: number
      lon?: number
      center?: { lat: number; lon: number }
    }

    const elements = (overpassData.elements || []) as OsmElement[]

    const results = elements
      .slice(0, 8)
      .map(el => {
        const tags = el.tags || {}
        const elLat = el.lat ?? el.center?.lat
        const elLon = el.lon ?? el.center?.lon
        return {
          name: tags['name:vi'] || tags.name || '',
          address:
            [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']]
              .filter(Boolean)
              .join(' ') || 'Xem trên bản đồ',
          phone: tags.phone || tags['contact:phone'] || null,
          website: tags.website || tags['contact:website'] || null,
          opening_hours: tags.opening_hours || null,
          cuisine: tags.cuisine?.replace(/;/g, ', ') || null,
          maps_link:
            elLat && elLon
              ? `https://www.google.com/maps?q=${elLat},${elLon}`
              : null,
        }
      })
      .filter(r => r.name)

    return {
      location: geoLocation,
      amenity_type: amenity,
      source: 'OpenStreetMap',
      results,
      note:
        results.length === 0
          ? `Không tìm thấy "${query}" gần ${geoLocation}. Thử mở rộng khu vực hoặc tìm trên Google Maps.`
          : 'Dữ liệu từ OpenStreetMap. Nhấn link bản đồ để xem chi tiết và đánh giá.',
    }
  } catch {
    return {
      error: 'Không thể tải dữ liệu địa điểm. Thử tìm trên Google Maps hoặc Foody.vn.',
      results: [],
    }
  }
}

// ===== PRODUCTS: Google Custom Search + DuckDuckGo fallback =====
async function searchProducts(query: string) {
  // Try Google Custom Search if configured
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX
  if (apiKey && cx) {
    try {
      const params = new URLSearchParams({ q: query, key: apiKey, cx, num: '5' })
      const resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
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
    } catch {
      // fall through
    }
  }

  // Fallback: DuckDuckGo Instant Answers (free, no key)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const params = new URLSearchParams({
      q: `${query} mua online Việt Nam`,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    })
    const resp = await fetch(`https://api.duckduckgo.com/?${params}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TappyAI/1.0' },
    })
    clearTimeout(timer)
    const data = await resp.json()

    type DdgTopic = { Text?: string; FirstURL?: string }

    const results: Array<{ title: string; snippet: string; link: string; site: string }> = []

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        link: data.AbstractURL || '',
        site: data.AbstractSource || 'DuckDuckGo',
      })
    }

    for (const topic of ((data.RelatedTopics || []) as DdgTopic[]).slice(0, 4)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(' - ')[0] || topic.Text,
          snippet: topic.Text,
          link: topic.FirstURL,
          site: 'DuckDuckGo',
        })
      }
    }

    if (results.length === 0) {
      return {
        note: `Gợi ý tìm "${query}" trực tiếp trên: Shopee.vn · Tiki.vn · Lazada.vn`,
        results: [],
      }
    }

    return { source: 'DuckDuckGo', query, results }
  } catch {
    return {
      note: `Tìm "${query}" trực tiếp trên: Shopee.vn · Tiki.vn · Lazada.vn`,
      results: [],
    }
  }
}

// ===== SYSTEM PROMPT =====
const SYSTEM_PROMPT = `Bạn là TappyAI - trợ lý AI thuần Việt chuyên tư vấn dịch vụ tại Việt Nam.

🎯 CHUYÊN MÔN: Ăn uống · Mua sắm · Giải trí · Du lệch· Spa & Là m đẹp · Tin tức

🔧 CÔNG CỤ REAL-TIME (luôn dùng khi user hỏi):
- search_places: Tìm nhà hàng, quán cafe, spa, khách sạn, bar, gym, rạp phim qua OpenStreetMap + Google Maps
- get_news: Lấy tin tức mới nhất từ VnExpress, Tuổi Trẻ, Dân Trí
- search_products: Tìm sản phẩm trên Shopee, Tiki, Lazada

📌 NGUYÊN TẮC:
1. BẮT BUỘC dùng tools khi user hỏi về địa điểm, tin tức, sản phẩm - KHÔNG tự bịa thông tin
2. Trả lời bằng tiếng Việt, thân thiện như bạn bè
3. Cung cấp thông tin CỤ THÂ từ kết quả tool: tên DMịA điểm, điịa chỉ, link Maps
4. Nếu tool không có đủ dữ liệu, gợi ý nguồn khác (Foody.vn, Google Maps, Shopee...)
5. Với tin tức: tóm tắt nội dung và chú thích nguồn (VnExpress, Tuổi Trẻ...)
6. Với địa điểm từ OpenStreetMap: thông báo là dữ liệu cộng đồng, nhấn link để xem rating đầy đở`

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: SYSTEM_PROMPT,
    messages,
    maxTokens: 2048,
    maxSteps: 5,
    // Step 0: force tool call. Step 1+: force text generation (prevents loop)
    experimental_prepareStep: async ({ stepNumber }) => {
      if (stepNumber === 0) return { toolChoice: 'required' as const }
      return { toolChoice: 'none' as const }
    },
    tools: {
      general_chat: tool({
        description: 'Dùng khi user chào hỏi, hỏi về TappyAI, hoặc câu hỏi tổng quát không liên quan đến địa điểm/tin tức/sản phẩm',
        parameters: z.object({
          intent: z.string().describe('Tóm tắt ý định của user'),
        }),
        execute: async ({ intent }) => ({ intent, ready: true }),
      }),
      search_places: tool({
        description:
          'Tìm kiếm địa điểm, nhà hàng, quán cafe, spa, khách sạn, địhđiểm giải trí tại Việt Nam. Dữ liệu từ OpenStreetMap (free) hoặc Google Maps nếu có API key.',
        parameters: z.object({
          query: z
            .string()
            .describe(
              'Loại địa điểm cần tìm, ví dụ: "nhà àng iải sản", "quán cafe", "spa massage"'
            ),
          location: z
            .string()
            .optional()
            .describe('Khu vực tìm kiếm, ví dụ: "Quận 1 TP.HCM", "Hà Nội", "Đà Đång"'),
          type: z
            .enum([
              'restaurant',
              'cafe',
              'spa',
              'hotel',
              'bar',
              'gym',
              'cinema',
            ])
            .optional()
            .describe('Loại địa điểm OSM'),
        }),
        execute: async ({ query, location, type }) => searchPlaces(query, location, type),
      }),

      get_news: tool({
        description:
          'Lấy tin tức mới nhất từ VnExpress, Tuổi Trẻ, Dân Trí về bất kỳ chử để nào',
        parameters: z.object({
          query: z
            .string()
            .describe(
              'Từ khóa tìm kiếm tin tức, ví dụ: "kinh tế", "bóng āá", "thời t�ết", "công nghệ"'
            ),
        }),
        execute: async ({ query }) => getNews(query),
      }),

      search_products: tool({
        description: 'Tìm kiếm sản phẩm để mua sắm online tại Việt Nam (Shopee, Tiki, Lazada)',
        parameters: z.object({
          query: z
            .string()
            .describe(
              'Tên sản phẩm cần tìm, ví dụ: "áo thun nam", "tai nghe bluetooth", "son môi"'
            ),
        }),
        execute: async ({ query }) => searchProducts(query),
      }),
    },
  })

  return result.toDataStreamResponse()
}
