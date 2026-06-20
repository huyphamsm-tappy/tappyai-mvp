import { sendNotificationToUser } from '@/lib/notifications/send'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const DAYS_AHEAD = 3 // notify users whose booking date is within this many days

// Runs daily at 02:00 UTC = 09:00 ICT (UTC+7) — configured in vercel.json
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Find bookings whose date falls within [today, today + DAYS_AHEAD]
    const today = new Date()
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + DAYS_AHEAD)

    const todayStr = today.toISOString().split('T')[0]
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('user_id, service_name, date, status')
      .gte('date', todayStr)
      .lte('date', cutoffStr)
      .in('status', ['confirmed', 'pending'])

    if (error) {
      console.error('[cron/travel-reminder] Query error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    if (!bookings?.length) return NextResponse.json({ ok: true, sent: 0 })

    // Check which of these users have push subscriptions
    const userIds = Array.from(new Set(bookings.map(b => b.user_id as string)))
    const { data: subs } = await supabase
      .from('notification_subscriptions')
      .select('user_id')
      .in('user_id', userIds)
      .eq('enabled', true)

    const subscribedIds = Array.from(new Set((subs ?? []).map(s => s.user_id as string)))
    const subscribedSet = new Set(subscribedIds)

    // Send one notification per user (for their earliest upcoming booking)
    const byUser = new Map<string, { service_name: string; date: string }>()
    for (const b of bookings) {
      const uid = b.user_id as string
      if (!subscribedSet.has(uid)) continue
      if (!byUser.has(uid) || b.date < byUser.get(uid)!.date) {
        byUser.set(uid, { service_name: b.service_name, date: b.date })
      }
    }

    const results = await Promise.allSettled(
      Array.from(byUser.entries()).map(([uid, booking]) => {
        const daysLeft = Math.round(
          (new Date(booking.date).getTime() - today.getTime()) / 86_400_000
        )
        const when = daysLeft === 0 ? 'hôm nay' : daysLeft === 1 ? 'ngày mai' : `${daysLeft} ngày nữa`
        return sendNotificationToUser(uid, {
          title: 'Nhắc lịch đặt chỗ 📅',
          body: `Bạn có lịch tại ${booking.service_name} vào ${when}. Chúc bạn có trải nghiệm tuyệt vời!`,
          data: { url: '/profile/bookings' },
        })
      })
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return NextResponse.json({ ok: true, sent: byUser.size - failed, failed })
  } catch (e) {
    console.error('[cron/travel-reminder] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
