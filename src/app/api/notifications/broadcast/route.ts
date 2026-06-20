import { sendNotificationToUser, getAllSubscribedUserIds } from '@/lib/notifications/send'
import { NextResponse } from 'next/server'

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${secret}`
}

/**
 * POST /api/notifications/broadcast
 * Protected by CRON_SECRET bearer token.
 * Body: { title: string, body: string, segment?: 'all', data?: Record<string, unknown> }
 *
 * Example curl:
 *   curl -X POST https://your-app.vercel.app/api/notifications/broadcast \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"title":"TappyAI","body":"Ưu đãi hôm nay: giảm 20% dịch vụ spa!"}'
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { title, body, data } = await req.json()
    if (!title || !body) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
    }

    const userIds = await getAllSubscribedUserIds()
    if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 })

    const results = await Promise.allSettled(
      userIds.map(uid => sendNotificationToUser(uid, { title, body, data }))
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({ ok: true, sent: userIds.length - failed, failed })
  } catch (e) {
    console.error('[broadcast] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
