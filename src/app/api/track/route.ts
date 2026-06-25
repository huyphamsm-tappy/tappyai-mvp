import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_TYPES = new Set([
  'page_view', 'chat_search', 'category_click', 'place_save',
  'place_click', 'review_view', 'deal_click', 'feature_use',
  'review_search', 'review_like', 'review_share', 'review_post',
])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const events = Array.isArray(body?.events) ? body.events : []
    if (!events.length) return NextResponse.json({ ok: true })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const validEvents = events.filter((e: { event_type?: string }) =>
      e?.event_type && ALLOWED_TYPES.has(e.event_type)
    )
    if (!validEvents.length) return NextResponse.json({ ok: true })

    const rows = validEvents.map((e: { event_type: string; metadata?: Record<string, unknown> }) => ({
      user_id: user?.id || null,
      event_type: e.event_type,
      metadata: e.metadata || {},
    }))

    await supabase.from('user_events').insert(rows)
    return NextResponse.json({ ok: true, tracked: rows.length })
  } catch (err) {
    console.error('[track] error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
