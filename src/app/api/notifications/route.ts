import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

// GET /api/notifications?page=0&limit=20
// Real, persisted notifications for the current user, paginated, newest first.
//
// Only reads the `notifications` table — review_milestones is deliberately NOT
// merged in (owner decision: don't mix Milestone into Notification). Milestone
// activity is therefore no longer surfaced in the Inbox at all; if it should
// come back it belongs as a real notification row written at milestone time,
// not as a second list stitched in at read time.
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ notifications: [], hasMore: false })

  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0'))
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || String(PAGE_SIZE))))
  const offset = page * limit

  const { data: rows, error, count } = await supabase
    .from('notifications')
    .select('id, actor_id, type, entity_type, entity_id, title, body, image, action_url, metadata, is_read, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[notifications] list query error:', error.message)
    return NextResponse.json({ error: 'Không tải được thông báo' }, { status: 500 })
  }

  // Batch-load actor profiles: ONE query for every distinct actor on this
  // page, not one per row (no N+1). Joined live rather than denormalized onto
  // the row so a renamed/re-avatared actor shows correctly in old
  // notifications too.
  const actorIds = Array.from(new Set((rows || []).map(r => r.actor_id).filter(Boolean) as string[]))
  let profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', actorIds)
    profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
  }

  const notifications = (rows || []).map(r => ({
    id: r.id,
    type: r.type as 'LIKE' | 'COMMENT' | 'FOLLOW' | 'REPLY' | 'MENTION' | 'SYSTEM',
    actor_id: r.actor_id,
    actor_name: r.actor_id ? (profileMap[r.actor_id]?.full_name || 'Ẩn danh') : null,
    actor_avatar: r.actor_id ? (profileMap[r.actor_id]?.avatar_url || null) : null,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    // Null for LIKE/COMMENT/FOLLOW (the client composes localized text from
    // the type + actor); set only for types whose text isn't derivable.
    title: r.title,
    body: r.body,
    image: r.image,
    url: r.action_url,
    metadata: r.metadata ?? {},
    is_read: r.is_read,
    created_at: r.created_at,
  }))

  const total = count ?? notifications.length
  const hasMore = offset + limit < total

  return NextResponse.json({ notifications, hasMore })
}
