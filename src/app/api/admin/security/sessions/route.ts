// /api/admin/security/sessions — session inventory (Controller V2 Component 11).
//
// Contract: docs/controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md §7, §16.
// Handler contract: RBAC -> origin -> rate-limit -> validate -> operation ->
// audit -> uniform envelope (21_Coding_Standards.md §2).
//
// The route holds no session policy. Which rows exist, which are excluded and
// which columns may leave the database are all decided by fn_session_inventory,
// because the application tier cannot read auth.sessions at all — measured
// 2026-08-14, and that is the point of ADR-021.

import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { adminError, adminErrorResponse } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { SessionListQuerySchema, type SessionRow } from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_SESSIONS_READ)
    const { user } = ctx

    const rl = await distributedRateLimit(`admin:sessions:list:${user.id}`, 100, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const url = new URL(req.url)
    const parsed = SessionListQuerySchema.safeParse({
      userId: url.searchParams.get('userId'),
      limit: url.searchParams.get('limit') ?? undefined,
      before: url.searchParams.get('before') ?? undefined,
    })
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    }
    const { userId, limit, before } = parsed.data

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('fn_session_inventory', {
      p_user_id: userId,
      p_limit: limit,
      p_before: before ?? null,
    })

    if (error) {
      // The message can name the auth schema; it never reaches the client.
      console.error('[admin][sessions] inventory failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    const rows = (data ?? []) as SessionRow[]

    // Reading someone's sessions is itself a security-relevant act: it reveals
    // where and when that person is signed in. C7 records it.
    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'session.listed',
      targetType: 'user',
      targetId: userId,
      metadata: { returned: rows.length },
      req,
    })

    return Response.json({ data: rows })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
