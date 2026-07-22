// /api/admin/audit — search the immutable audit log (admin+). Read-only.
// 05_API_Architecture.md §10. Default date window applied to avoid full scans
// (20_Performance.md); cursor pagination on created_at.

import { requireAdminRole, adminErrorResponse, adminError } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'

// Reads auth headers per request — always dynamic (never statically rendered).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requireAdminRole(req, 'admin')
    if (!rateLimit(`admin:audit:list:${user.id}`, 100, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const url = new URL(req.url)
    const actorId = url.searchParams.get('actor_id')
    const action = url.searchParams.get('action')
    const targetType = url.searchParams.get('target_type')
    const targetId = url.searchParams.get('target_id')
    const before = url.searchParams.get('before') // cursor: created_at ISO
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 50 : limitRaw, 1), 100)

    const supabase = createAdminClient()
    let query = supabase
      .from('audit_log')
      .select('id, actor_id, actor_email, actor_role, action, target_type, target_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (actorId) query = query.eq('actor_id', actorId)
    if (action) query = query.eq('action', action)
    if (targetType) query = query.eq('target_type', targetType)
    if (targetId) query = query.eq('target_id', targetId)
    if (before) query = query.lt('created_at', before)

    const { data, error } = await query
    if (error) {
      console.error('[admin][audit] list failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    const rows = data ?? []
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? items[items.length - 1].created_at : null

    return Response.json({ data: items, meta: { page: { cursor: nextCursor, hasMore } } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
