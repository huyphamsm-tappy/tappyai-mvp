// POST /api/admin/security/sessions/force-logout — end every session for ONE user.
//
// Contract: docs/controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md §6, §16.
//
// One subject per call, deliberately: there is no bulk form, because a
// "log everyone out" button is an availability weapon and no authoritative
// source asks for one.
//
// The atomicity lives in fn_session_revoke_all — ONE statement, whose READ
// COMMITTED snapshot is the effect set. This handler must never select sessions
// and revoke them in a loop; that would leave a window where a concurrent login
// is wrongly killed or wrongly spared depending on timing (§4.1).

import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { revokeAllSessions } from '@/lib/admin/sessions/revokeSessions'
import { ForceLogoutSchema } from '../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_SESSIONS_REVOKE)
    const { user } = ctx

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    // Tighter than a single revoke: this is the highest-blast-radius operation
    // in the component.
    const rl = await distributedRateLimit(`admin:sessions:forcelogout:${user.id}`, 10, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = ForceLogoutSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { userId, reason } = parsed.data

    const supabase = createAdminClient()

    // Handler-side Owner protection (§5.1.1). The SQL function refuses too.
    const { data: ownerFlag, error: ownerError } = await supabase.rpc('fn_is_platform_owner', {
      p_user_id: userId,
    })
    if (ownerError) {
      console.error('[admin][sessions] owner check failed:', ownerError.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    if (ownerFlag === true) {
      writeAuditLog({
        actorId: user.id,
        actorEmail: user.email ?? '—',
        actorRole: auditActorRole(ctx.actor),
        action: 'session.revoke_denied',
        targetType: 'user',
        targetId: userId,
        metadata: { scope: 'all', reason: 'owner_protected', stated_reason: reason },
        req,
      })
      return adminError('FORBIDDEN', 'The Platform Owner’s sessions cannot be revoked', 403)
    }

    // Shared with the ban route, which now performs the same revocation as an
    // internal step. One place decides what each outcome MEANS, so the two
    // cannot drift apart over whether `owner_protected` counts as success.
    const result = await revokeAllSessions(supabase, userId)
    if (result.reason === 'error') {
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    if (result.reason === 'not_found') {
      // Unknown or anonymous subject. Reported identically so this surface
      // cannot be used to tell one from the other.
      return adminError('NOT_FOUND', 'User not found', 404)
    }
    if (result.reason === 'owner_protected') {
      return adminError('FORBIDDEN', 'The Platform Owner’s sessions cannot be revoked', 403)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'session.force_logout',
      targetType: 'user',
      targetId: userId,
      // The reason is the point of the entry: a forced logout with no recorded
      // motive is unreadable six months later.
      metadata: { revoked: result.revoked, reason },
      req,
    })

    return Response.json({ data: { revoked: result.revoked } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
