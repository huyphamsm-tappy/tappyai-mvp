import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

// GET /api/notifications?page=0&limit=20
// Real, persisted notifications (LIKE/COMMENT/FOLLOW — Notification System
// MVP) for the current user, paginated, newest first.
//
// Milestone entries (review_milestones) are NOT part of the new
// `notifications` table's type set (LIKE/COMMENT/FOLLOW only, per the MVP
// schema) but were shown in the old derived-list version of this route.
// Backward-compat requirement: keep surfacing them so a user who used to see
// "🎉 review đạt N lượt thích" doesn't lose that entirely. They're merged in
// ONLY on page 0 (matching the old code's own "10 most recent" cap) since
// they have no is_read state and can't be cleanly paginated alongside the
// real table — they never count toward the unread badge (see
// /api/notifications/unread-count) and can't be individually marked read.
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ notifications: [], hasMore: false })

  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0'))
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || String(PAGE_SIZE))))
  const offset = page * limit

  const { data: rows, error, count } = await supabase
    .from('notifications')
    .select('id, actor_id, type, entity_type, entity_id, is_read, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[notifications] list query error:', error.message)
    return NextResponse.json({ error: 'Không tải được thông báo' }, { status: 500 })
  }

  // Batch-load actor profiles (avoid N+1 — one query for every distinct actor
  // on this page, not one per row).
  const actorIds = Array.from(new Set((rows || []).map(r => r.actor_id)))
  let profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', actorIds)
    profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
  }

  const urlFor = (entityType: string, entityId: string) =>
    entityType === 'profile' ? `/users/${entityId}` : `/reviews/${entityId}`

  const notifications = (rows || []).map(r => ({
    id: r.id,
    type: r.type as 'LIKE' | 'COMMENT' | 'FOLLOW',
    actor_id: r.actor_id,
    actor_name: profileMap[r.actor_id]?.full_name || 'Ẩn danh',
    actor_avatar: profileMap[r.actor_id]?.avatar_url || null,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    url: urlFor(r.entity_type, r.entity_id),
    is_read: r.is_read,
    created_at: r.created_at,
  }))

  // Milestones: backward-compat only, page 0, never affects pagination math
  // for the real table above.
  let merged: (typeof notifications[number] | {
    id: string; type: 'MILESTONE'; actor_id: null; actor_name: null; actor_avatar: null
    entity_type: 'review'; entity_id: string; url: string; is_read: true; created_at: string
    milestone: number; place_name: string | null
  })[] = notifications

  if (page === 0) {
    const { data: myReviews } = await supabase
      .from('reviews')
      .select('id, place_name')
      .eq('user_id', user.id)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .limit(50)
    const myReviewIds = (myReviews || []).map(r => r.id)
    const reviewNameMap = Object.fromEntries((myReviews || []).map(r => [r.id, r.place_name]))

    if (myReviewIds.length > 0) {
      const { data: milestoneRows } = await supabase
        .from('review_milestones')
        .select('id, review_id, milestone, created_at')
        .in('review_id', myReviewIds)
        .order('created_at', { ascending: false })
        .limit(10)

      const milestones = (milestoneRows || []).map(m => ({
        id: 'ms_' + m.id,
        type: 'MILESTONE' as const,
        actor_id: null,
        actor_name: null,
        actor_avatar: null,
        entity_type: 'review' as const,
        entity_id: m.review_id,
        url: `/reviews/${m.review_id}`,
        is_read: true as const,
        created_at: m.created_at,
        milestone: m.milestone,
        place_name: reviewNameMap[m.review_id] ?? null,
      }))

      merged = [...notifications, ...milestones].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }
  }

  const total = count ?? notifications.length
  const hasMore = offset + limit < total

  return NextResponse.json({ notifications: merged, hasMore })
}
