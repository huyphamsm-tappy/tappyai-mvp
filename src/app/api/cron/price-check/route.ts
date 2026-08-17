import { NextResponse } from 'next/server'
import { AI } from '@/lib/ai/llm'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitNotification } from '@/lib/notifications/emit'
import { pw, normalizePwLang, type PwLang } from '@/lib/priceWatch/messages'

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

// STEP 13: price formatting and notification copy moved into the shared Price
// Watch message layer so both exist in Vietnamese AND English. The local
// fmtPrice() was Vietnamese-only ("4.2 triệu"), so an English user received
// "Now 4.2 triệu — your target is 4.5 triệu".

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

  // STEP 13: resolve each watch owner's stored UI language in ONE batched read,
  // so a push goes out in the language that user chose. `profiles.language` is
  // nullable ("not set yet") and anything unset resolves to Vietnamese, which is
  // exactly today's behaviour for every existing user. A failed lookup is also
  // Vietnamese — a language read must never stop a price alert from being sent.
  const langByUser = new Map<string, PwLang>()
  try {
    const userIds = [...new Set((watches as Watch[]).map(w => w.user_id))]
    const { data: profiles } = await supabase.from('profiles').select('id, language').in('id', userIds)
    for (const p of (profiles ?? []) as Array<{ id: string; language: unknown }>) {
      langByUser.set(p.id, normalizePwLang(p.language))
    }
  } catch { /* every user falls back to 'vi' below */ }

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

        const lang = langByUser.get(watch.user_id) ?? 'vi'
        await emitNotification({
          userId: watch.user_id,
          type: 'price',
          category: 'deal',
          title: pw.notifyTitle(lang, watch.product_name),
          body: pw.notifyBody(lang, extractedPrice, watch.target_price),
          entityUrl: `/profile/price-watches`,
        })

        triggered++
      }
    })
  )

  const failed = results.filter(r => r.status === 'rejected').length
  return NextResponse.json({ ok: true, checked, triggered, failed })
}
