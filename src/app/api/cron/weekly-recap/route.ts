import { NextResponse } from 'next/server'
import { AI } from '@/lib/ai/llm'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMemoryBatch } from '@/lib/memory/memoryService'
import { getAllSubscribedUserIds, sendNotificationToUser } from '@/lib/notifications/send'

export const runtime = 'nodejs'
export const maxDuration = 60

// Runs every Sunday at 13:00 UTC = 20:00 Vietnam time (configured in vercel.json)
// Only sends to users with ≥3 conversations in the past 7 days

const MIN_CONVOS = 3 // minimum conversations to qualify for recap

type ConvoCount = {
  user_id: string
  count: number
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Get all subscribed users
    const userIds = await getAllSubscribedUserIds()
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    // Count conversations in the past 7 days per user
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: convoCounts } = await supabase
      .from('conversations')
      .select('user_id')
      .in('user_id', userIds)
      .gte('updated_at', sevenDaysAgo)

    // Aggregate counts
    const countByUser = new Map<string, number>()
    for (const row of (convoCounts ?? [])) {
      countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1)
    }

    // Only send to users with enough activity
    const activeUserIds = userIds.filter(uid => (countByUser.get(uid) ?? 0) >= MIN_CONVOS)
    if (!activeUserIds.length) {
      return NextResponse.json({ ok: true, sent: 0, skipped: userIds.length, reason: 'insufficient_activity' })
    }

    // Fetch memory for active users
    const memoryByUser = await getMemoryBatch(activeUserIds, supabase)

    const results = await Promise.allSettled(
      activeUserIds.map(async (uid) => {
        const mem = memoryByUser.get(uid)
        const convoCount = countByUser.get(uid) ?? 0
        const location = mem?.location_base || 'TP.HCM'
        const recentTopics = (mem?.history ?? []).slice(-5)
        const foodPrefs = mem?.preferences?.food?.slice(0, 3) ?? []
        const companions = mem?.companions ?? null

        // Build context string for Haiku
        const topicStr = recentTopics.length > 0
          ? `Chủ đề tuần này: ${recentTopics.join(', ')}`
          : 'Đã khám phá nhiều nội dung'
        const compStr = companions ? `Hay ${companions}` : ''
        const prefStr = foodPrefs.length > 0 ? `Thích: ${foodPrefs.join(', ')}` : ''

        const prompt = `Bạn là TappyAI — trợ lý AI đời thường người Việt.
Tạo TIN NHẮN TỔNG KẾT TUẦN ngắn gọn, ấm áp, cá nhân hóa.

Thông tin user:
- Đã chat với Tappy ${convoCount} lần tuần này
- Khu vực: ${location}
- ${topicStr}
${compStr ? `- ${compStr}` : ''}
${prefStr ? `- ${prefStr}` : ''}

Yêu cầu:
- TITLE: ≤55 ký tự, bắt đầu bằng emoji, mention số lần chat hoặc chủ đề chính
- BODY: ≤110 ký tự, khen ngợi nhẹ + gợi ý 1 điều thú vị cho tuần tới, kêu gọi mở Tappy
- Giọng văn: thân thiện như bạn bè, KHÔNG sáo rỗng
- Ngôn ngữ: tiếng Việt

Ví dụ tốt:
TITLE: 🎉 Tuần của bạn cùng Tappy!
BODY: ${convoCount} lần khám phá ${location} cùng Tappy rồi đó. Tuần tới thử${foodPrefs[0] ? ` món ${foodPrefs[0]} mới` : ' địa điểm mới'} nhé?

Trả lời ĐÚNG format:
TITLE: [nội dung]
BODY: [nội dung]`

        const { text } = await AI.generate({ role: 'fast', maxTokens: 150, prompt })
        const titleMatch = text.match(/TITLE:\s*(.+)/)
        const bodyMatch = text.match(/BODY:\s*(.+)/)

        const title = titleMatch?.[1]?.trim() ?? `🎉 ${convoCount} lần cùng Tappy tuần này!`
        const body = bodyMatch?.[1]?.trim() ?? 'Tappy đã đồng hành cùng bạn cả tuần. Tuần tới khám phá gì tiếp nhé?'

        await sendNotificationToUser(uid, {
          title,
          body,
          data: { url: '/profile/tappy-knows' },
        })
      })
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({
      ok: true,
      sent: activeUserIds.length - failed,
      skipped: userIds.length - activeUserIds.length,
      failed,
    })
  } catch (e) {
    console.error('[cron/weekly-recap] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
