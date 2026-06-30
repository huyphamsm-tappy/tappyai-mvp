import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllSubscribedUserIds, sendNotificationToUser } from '@/lib/notifications/send'
import { getDealsForPersonalization } from '@/lib/shopee-deals'

export const runtime = 'nodejs'
export const maxDuration = 60

// Runs daily at 00:30 UTC = 07:30 ICT (UTC+7) — configured in vercel.json
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userIds = await getAllSubscribedUserIds()
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    const deals = await getDealsForPersonalization()
    const dealList = deals
      .map((d, i) => `${i + 1}. [${d.category}] ${d.title} — ${d.discount}`)
      .join('\n')

    // Batch-fetch preferences for all subscribed users
    const supabase = createAdminClient()
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('user_id, preferences, cuisine_likes')
      .in('user_id', userIds)

    const prefByUser = new Map<string, string[]>()
    for (const p of prefs ?? []) {
      const tags = [
        ...(Array.isArray(p.preferences) ? p.preferences as string[] : []),
        ...(Array.isArray(p.cuisine_likes) ? p.cuisine_likes as string[] : []),
      ]
      prefByUser.set(p.user_id as string, tags)
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const results = await Promise.allSettled(
      userIds.map(async (uid) => {
        const tags = prefByUser.get(uid) ?? []
        const prefStr = tags.length ? tags.join(', ') : 'mua sắm tổng quát'

        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Sở thích người dùng: ${prefStr}
Deals hôm nay:
${dealList}

Chọn 1-2 deals phù hợp nhất. Trả lời đúng định dạng này (tiếng Việt):
TITLE: (tối đa 60 ký tự, bắt đầu bằng emoji)
BODY: (tối đa 120 ký tự)`,
          }],
        })

        const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const titleMatch = text.match(/TITLE:\s*(.+)/)
        const bodyMatch = text.match(/BODY:\s*(.+)/)

        const title = titleMatch?.[1]?.trim() ?? '🛍️ Deal hôm nay cho bạn!'
        const body = bodyMatch?.[1]?.trim() ?? `${deals[0]?.title} — ${deals[0]?.discount}`

        await sendNotificationToUser(uid, {
          title,
          body,
          data: { url: '/deals' },
        })
      })
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({ ok: true, sent: userIds.length - failed, failed })
  } catch (e) {
    console.error('[cron/deal-notifications] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
