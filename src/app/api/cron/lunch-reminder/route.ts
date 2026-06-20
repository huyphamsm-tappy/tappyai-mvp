import { sendNotificationToUser, getAllSubscribedUserIds } from '@/lib/notifications/send'
import { NextResponse } from 'next/server'

// Runs daily at 04:00 UTC = 11:00 ICT (UTC+7) — configured in vercel.json
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userIds = await getAllSubscribedUserIds()
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    const results = await Promise.allSettled(
      userIds.map(uid =>
        sendNotificationToUser(uid, {
          title: 'TappyAI 🍜',
          body: 'Tới giờ ăn trưa rồi! Để Tappy gợi ý nhà hàng ngon gần bạn nhé?',
          data: { url: '/?prompt=gợi+ý+nhà+hàng+ăn+trưa' },
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
