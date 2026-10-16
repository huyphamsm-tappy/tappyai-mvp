import { NextResponse } from 'next/server'
import { AI } from '@/lib/ai/llm'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllSubscribedUserIds } from '@/lib/notifications/send'
import { emitNotification } from '@/lib/notifications/emit'
import { getActiveDeals } from '@/lib/deals/partnerDeals'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { loadAllowedUserIds } from '@/lib/ai/consent/aiDataConsent'
import { DEAL_NUDGE_TITLE } from '@/lib/i18n/backgroundNotices'

export const runtime = 'nodejs'
export const maxDuration = 60

// Runs daily at 00:30 UTC = 07:30 ICT (UTC+7) — configured in vercel.json
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userIds = await getAllSubscribedUserIds()
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    const deals = await getActiveDeals()
    if (!deals.length) return NextResponse.json({ ok: true, sent: 0, note: 'no active deals' })
    const dealList = deals
      .map((d, i) => `${i + 1}. [${d.category}] ${d.title} — ${d.description ?? ''}`)
      .join('\n')

    // Preferences go to the AI only for users who agreed to it; the others get the deal itself, with no model.
    const supabase = createAdminClient()
    const allowed = await loadAllowedUserIds(supabase, userIds)
    const aiUserIds = userIds.filter(uid => allowed.has(uid))
    const { data: prefs } = aiUserIds.length
      ? await supabase
          .from('user_preferences')
          .select('user_id, preferences, cuisine_likes')
          .in('user_id', aiUserIds)
      : { data: [] }

    const prefByUser = new Map<string, string[]>()
    for (const p of prefs ?? []) {
      const tags = [
        ...(Array.isArray(p.preferences) ? p.preferences as string[] : []),
        ...(Array.isArray(p.cuisine_likes) ? p.cuisine_likes as string[] : []),
      ]
      prefByUser.set(p.user_id as string, tags)
    }

    const results = await Promise.allSettled(
      userIds.map(async (uid) => {
        if (!allowed.has(uid)) {
          // No AI: the first active deal as it is written, without the user's preferences.
          await emitNotification({
            userId: uid,
            type: 'deal',
            category: 'deal',
            title: DEAL_NUDGE_TITLE,
            body: `${deals[0]?.title} — ${deals[0]?.description ?? ''}`,
            entityUrl: '/deals',
          })
          return
        }
        const tags = prefByUser.get(uid) ?? []
        const prefStr = tags.length ? tags.join(', ') : 'mua sắm tổng quát'

        const { text } = await AI.generate({
          role: 'fast',
          maxTokens: 200,
          prompt: `Sở thích người dùng: ${prefStr}
Deals hôm nay:
${dealList}

Chọn 1-2 deals phù hợp nhất. Trả lời đúng định dạng này (tiếng Việt):
TITLE: (tối đa 60 ký tự, bắt đầu bằng emoji)
BODY: (tối đa 120 ký tự)`,
        })
        const titleMatch = text.match(/TITLE:\s*(.+)/)
        const bodyMatch = text.match(/BODY:\s*(.+)/)

        const title = titleMatch?.[1]?.trim() ?? '🛍️ Deal hôm nay cho bạn!'
        const body = bodyMatch?.[1]?.trim() ?? `${deals[0]?.title} — ${deals[0]?.description ?? ''}`

        await emitNotification({
          userId: uid,
          type: 'deal',
          category: 'deal',
          title,
          body,
          entityUrl: '/deals',
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
