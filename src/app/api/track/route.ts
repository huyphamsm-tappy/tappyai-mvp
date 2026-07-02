import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'

const ALLOWED_TYPES = new Set([
  'page_view', 'page_time', 'chat_search', 'category_click', 'place_save',
  'place_click', 'review_view', 'deal_click', 'feature_use',
  'review_search', 'review_like', 'review_share', 'review_post',
  'hide', 'not_interested', 'report',
])

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  let events: Array<{ event_type: string; metadata?: Record<string, unknown> }>
  try {
    const body = await req.json()
    events = Array.isArray(body.events) ? body.events : []
    if (!events.length) return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // Sanitize + filter
  const rows = events
    .filter(e => ALLOWED_TYPES.has(e.event_type))
    .slice(0, 20) // max 20 per batch
    .map(e => ({
      user_id: user.id,
      event_type: e.event_type,
      metadata: e.metadata ?? {},
    }))

  if (rows.length) {
    await supabase.from('user_events').insert(rows)

    // Rebuild preference profile when search or negative feedback signals arrive
    const needsRebuild = rows.some(r =>
      r.event_type === 'chat_search' ||
      r.event_type === 'review_search' ||
      r.event_type === 'hide' ||
      r.event_type === 'not_interested' ||
      r.event_type === 'report'
    )
    if (needsRebuild) rebuildProfile(user.id, supabase).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
