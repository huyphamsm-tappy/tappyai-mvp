import { NextResponse } from 'next/server'
import { AI } from '@/lib/ai/llm'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNotificationToUser } from '@/lib/notifications/send'

export const runtime = 'nodejs'
export const maxDuration = 60

// Runs every 6 hours — configured in vercel.json
// 0 */6 * * *  →  00:00, 06:00, 12:00, 18:00 UTC

type Watch = {
  id: string
  user_id: string
  product_name: string
  target_price: number
  current_price: number | null
  search_query: string
}

const SERPER_KEY = process.env.SERPER_API_KEY

async function searchCurrentPrice(query: string): Promise<Array<{ title: string; snippet: string; link: string }>> {
  if (!SERPER_KEY) return []
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query + ' giá hiện tại site:shopee.vn OR site:tiki.vn OR site:lazada.vn', gl: 'vn', hl: 'vi', num: 5 }),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ])
    if (!(resp as Response).ok) return []
    const data = await (resp as Response).json()
    return (data?.organic ?? [])
      .filter((r: { title?: string; snippet?: string; link?: string }) => r.title && r.snippet)
      .slice(0, 4)
      .map((r: { title: string; snippet: string; link: string }) => ({ title: r.title, snippet: r.snippet, link: r.link }))
  } catch {
    return []
  }
}

function fmtPrice(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + ' triệu'
  return (n / 1000).toFixed(0) + 'k'
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch all active watches (max 100 per run to stay within time limit)
  const { data: watches, error } = await supabase
    .from('price_watches')
    .select('id, user_id, product_name, target_price, current_price, search_query')
    .eq('status', 'active')
    .order('last_checked', { ascending: true, nullsFirst: true })
    .limit(100)

  if (error || !watches?.length) {
    return NextResponse.json({ ok: true, checked: 0 })
  }

  let triggered = 0
  let checked = 0

  const results = await Promise.allSettled(
    (watches as Watch[]).map(async (watch) => {
      // Search for current price
      const searchResults = await searchCurrentPrice(watch.search_query)
      if (!searchResults.length) return

      // Use Haiku to extract price from search snippets
      const snippetText = searchResults
        .map(r => `${r.title}\n${r.snippet}`)
        .join('\n---\n')

      const { text } = await AI.generate({
        role: 'fast',
        maxTokens: 80,
        prompt: `Tìm giá thấp nhất của "${watch.product_name}" từ kết quả tìm kiếm này (giá bán hiện tại, không phải giá gốc):

${snippetText}

Trả lời ĐÚNG format (chỉ 1 dòng):
PRICE_VND: [số nguyên bằng VND, ví dụ: 1950000] hoặc PRICE_VND: không rõ`,
      })
      const priceMatch = text.match(/PRICE_VND:\s*(\d+)/)
      const extractedPrice = priceMatch ? parseInt(priceMatch[1]) : null

      // Update last_checked and current_price
      await supabase
        .from('price_watches')
        .update({
          last_checked: new Date().toISOString(),
          ...(extractedPrice ? { current_price: extractedPrice } : {}),
        })
        .eq('id', watch.id)

      checked++

      // Check if price hit target
      if (extractedPrice && extractedPrice <= watch.target_price) {
        // Mark as triggered + send notification
        await supabase
          .from('price_watches')
          .update({ status: 'triggered', notified_at: new Date().toISOString() })
          .eq('id', watch.id)

        await sendNotificationToUser(watch.user_id, {
          title: `🎯 Giá ${watch.product_name} đã xuống!`,
          body: `Hiện ${fmtPrice(extractedPrice)} — mục tiêu của bạn là ${fmtPrice(watch.target_price)}. Mở Tappy để mua ngay!`,
          data: { url: `/profile/price-watches` },
        })

        triggered++
      }
    })
  )

  const failed = results.filter(r => r.status === 'rejected').length
  return NextResponse.json({ ok: true, checked, triggered, failed })
}
