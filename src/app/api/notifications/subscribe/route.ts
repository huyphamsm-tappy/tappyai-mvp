import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'

// POST /api/notifications/subscribe — upsert a Web Push subscription for the current user
export async function POST(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    // Two transports, one contract. `notification_subscriptions` was created with a `provider`
    // column and a JSON payload for exactly this, so Android's FCM token registers here rather
    // than through a second endpoint with its own auth. The provider comes from the request; the
    // USER always comes from the verified session, never from the body.
    let provider: string
    let subscription_data: Record<string, unknown>

    if (body?.provider === 'fcm') {
      const { token } = body
      if (typeof token !== 'string' || !token) {
        return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
      }
      provider = 'fcm'
      subscription_data = { token }
    } else {
      const { endpoint, keys } = body
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
      }
      provider = 'webpush'
      subscription_data = { endpoint, keys }
    }

    const { error } = await supabase
      .from('notification_subscriptions')
      .upsert(
        {
          user_id: user.id,
          provider,
          subscription_data,
          enabled: true,
        },
        { onConflict: 'user_id,provider' }
      )

    if (error) {
      console.error('[subscribe] Upsert error:', error)
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[subscribe] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/notifications/subscribe — disable the subscription for the current user
export async function DELETE(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('notification_subscriptions')
      .update({ enabled: false })
      .eq('user_id', user.id)
      .eq('provider', 'webpush')

    if (error) {
      console.error('[subscribe] Disable error:', error)
      return NextResponse.json({ error: 'Failed to disable subscription' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[subscribe] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
