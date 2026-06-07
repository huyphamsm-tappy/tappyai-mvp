import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ── Tool: Google Places ───────────────────────────────────────────────────────
async function searchPlaces(query: string, location?: string, type?: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return { error: 'Google Places API chưa cấu hình', results: [] }

  const searchQuery = location ? `${query} ${location}` : query
  const params = new URLSearchParams({ query: searchQuery, key: apiKey, language: 'vi', region: 'vn' })
  if (type) params.set('type', type)

  try {
    const resp = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`)
    const data = await resp.json()
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return { error: `Google Places lỗi: ${data.status}`, results: [] }
    }
    return {
      query: searchQuery,
      results: (data.results || []).slice(0, 5).map((p: Record<string, unknown>) => ({
        name: p.name,
        address: p.formatted_address,
        rating: p.rating ? `${p.rating}/5 (${(p as Record<string, unknown>).user_ratings_total} đánh giá)` : 'Chưa có đánh giá',
        price_level: p.price_level ? '💰'.repeat(p.price_level as number) : null,
        open_now: (p.opening_hours as Record<string, unknown>)?.open_now != null
          ? ((p.opening_hours as Record<string, unknown>).open_now ? '🟢 Đang mở cửa' : '🔴 Đã đóng cửa')
          : null,
        google_maps: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
      }))
    }
  } catch {
    return { error: 'Không thể kết nối Google Places', results: [] }
  }
}

// ── Tool: NewsAPI ─────────────────────────────────────────────────────────────
async function getNews(query: string) {
  const apiKey = process.env.NEWSAPI_KEY
  if (!apiKey) return { error: 'NewsAPI chưa cấu hình', articles: [] }

  try {
    const tryFetch = async (lang?: string) => {
      const params = new URLSearchParams({ q: query, sortBy: 'publishedAt', pageSize: '5', apiKey })
      if (lang) params.set('language', lang)
      const r = await fetch(`https://newsapi.org/v2/everything?${params}`)
      return r.json()
    }

    let data = await tryFetch('vi')
    if (data.status !== 'ok' || !data.articles?.length) data = await tryFetch()
    if (data.status !== 'ok') return { error: data.message, articles: [] }

    return {
      articles: (data.articles || []).slice(0, 5).map((a: Record<string, unknown>) => ({
        title: a.title,
        description: a.description,
        source: (a.source as Record<string, unknown>)?.name,
        url: a.url,
        published: new Date(a.publishedAt as string).toLocaleDateString('vi-VN')
      }))
    }
  } catch {
    return { error: 'Không thể kết nối NewsAPI', articles: [] }
  }
}

// ── Tool: Google Custom Search (Shopee/Tiki/Lazada) ───────────────────────────
async function searchProducts(query: string) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX
  if (!apiKey || !cx) return { error: 'Google Search API chưa cấu hình', results: [] }

  try {
    const params = new URLSearchParams({ q: query, key: apiKey, cx, num: '5' })
    const resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
    const data = await resp.json()
    if (data.error) return { error: data.error.message, results: [] }

    return {
      results: (data.items || []).map((item: Record<string, unknown>) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        site: new URL(item.link as string).hostname.replace('www.', '')
      }))
    }
  } catch {
    return { error: 'Không thể tìm kiếm sản phẩm', results: [] }
  }
}

// ── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là TappyAI - trợ lý AI thuần Việt chuyên tư vấn dịch vụ tại Việt Nam.

🎯 CHUYÊN MÔN: Ăn uống · Mua sắm · Giải trí · Du lịch · Spa & Làm đẹp · Tin tức

🔧 CÔNG CỤ REAL-TIME:
- search_places: tìm địa điểm từ Google Maps (rating, địa chỉ, giờ mở cửa chính xác)
- get_news: tin tức mới nhất
- search_products: tìm sản phẩm trên Shopee, Tiki, Lazada

📌 NGUYÊN TẮC:
1. Hỏi về địa điểm/quán ăn/spa/khách sạn → LUÔN dùng search_places (không đoán mò)
2. Hỏi tin tức → dùng get_news
3. Hỏi mua sắm/sản phẩm → dùng search_products
4. Trả lời tiếng Việt, thân thiện như bạn bè
5. Hiển thị rating ⭐, giờ mở cửa, link Google Maps khi có data
6. Nếu tool trả về lỗi, thông báo rõ cho user và đưa ra gợi ý thay thế`

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
        description: 'Tìm địa điểm, quán ăn, spa, khách sạn, điểm du lịch tại Việt Nam real-time từ Google Maps',
        parameters: z.object({
          query: z.string().describe('Từ khóa tìm kiếm'),
          location: z.string().optional().describe('Thành phố hoặc khu vực (TP.HCM, Hà Nội, Quận 1...)'),
          type: z.enum(['restaurant', 'spa', 'hotel', 'tourist_attraction', 'shopping_mall', 'cafe', 'bar', 'gym']).optional()
        }),
        execute: async ({ query, location, type }) => searchPlaces(query, location, type)
      }),
      get_news: tool({
        description: 'Lấy tin tức mới nhất về bất kỳ chủ đề nào',
        parameters: z.object({
          query: z.string().describe('Từ khóa tìm kiếm tin tức')
        }),
        execute: async ({ query }) => getNews(query)
      }),
      search_products: tool({
        description: 'Tìm sản phẩm và giá trên Shopee, Tiki, Lazada',
        parameters: z.object({
          query: z.string().describe('Tên sản phẩm cần tìm')
        }),
        execute: async ({ query }) => searchProducts(query)
      })
    }
  })

  return result.toDataStreamResponse()
}
