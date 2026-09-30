import { getAllSubscribedUserIds } from '@/lib/notifications/send'
import { emitNotification } from '@/lib/notifications/emit'
import { NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'

// Runs daily at 04:00 UTC = 11:00 ICT (UTC+7) — configured in vercel.json
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userIds = await getAllSubscribedUserIds()
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    const results = await Promise.allSettled(
      userIds.map(uid =>
        emitNotification({
          userId: uid,
          type: 'lunch',
          category: 'explore',
          title: 'TappyAI 🍜',
          body: 'Tới giờ ăn trưa rồi! Để Tappy gợi ý nhà hàng ngon gần bạn nhé?',
          entityUrl: '/?prompt=gợi+ý+nhà+hàng+ăn+trưa',
        })
      )
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({ ok: true, sent: userIds.length - failed, failed })
  } catch (e) {
    console.error('[cron/lunch-reminder] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
