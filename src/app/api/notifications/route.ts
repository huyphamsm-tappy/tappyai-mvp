import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'
import type { NotificationDTO } from '@/lib/notifications/contract'

export const runtime = 'edge'

const DEFAULT_LIMIT = 40
const MAX_LIMIT = 100

// GET /api/notifications  (ADR-014 contract v1, shared Web/Android/iOS)
// Reads the persisted `notifications` table directly — no on-read aggregation.
// → { notifications: NotificationDTO[], unread_count }
// Query: ?limit=40 (≤100), ?before=<ISO> cursor for older pages.
export async function GET(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ notifications: [], unread_count: 0 })

  const url = new URL(req.url)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))
  const before = url.searchParams.get('before')

  let query = supabase
    .from('notifications')
    .select('id, type, category, title, body, actor_id, entity_url, image_url, data, read_at, created_at')
    .eq('user_id', user.id) // redundant with RLS, kept explicit
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) query = query.lt('created_at', before)

  const { data: rows, error } = await query
  if (error) {
    console.error('[api/notifications] read failed:', error)
    return NextResponse.json({ notifications: [], unread_count: 0 }, { status: 500 })
  }

  // Resolve actor display info for social rows (one batched profiles fetch).
  const actorIds = Array.from(new Set((rows ?? []).map(r => r.actor_id).filter(Boolean))) as string[]
  let profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', actorIds)
    profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  }

  const notifications: NotificationDTO[] = (rows ?? []).map(r => ({
    id: r.id as string,
    type: r.type as string,
    category: r.category as string,
    title: r.title as string,
    body: r.body as string,
    actor: r.actor_id
      ? {
          id: r.actor_id as string,
          name: profileMap[r.actor_id as string]?.full_name || 'Ẩn danh',
          avatar: profileMap[r.actor_id as string]?.avatar_url || null,
        }
      : null,
    entity_url: (r.entity_url as string | null) ?? null,
    image_url: (r.image_url as string | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    read_at: (r.read_at as string | null) ?? null,
    created_at: r.created_at as string,
  }))

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  return NextResponse.json({ notifications, unread_count: count ?? 0 })
}
