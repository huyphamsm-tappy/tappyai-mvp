import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/notifications/subscribe — upsert a Web Push subscription for the current user
export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { endpoint, keys } = body
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
    }

    const { error } = await supabase
      .from('notification_subscriptions')
      .upsert(
        {
          user_id: user.id,
          provider: 'webpush',
          subscription_data: { endpoint, keys },
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
export async function DELETE() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
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
