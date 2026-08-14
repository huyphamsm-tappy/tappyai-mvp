// DELETE /api/admin/security/sessions/[sessionId] — revoke ONE session.
//
// Contract: docs/controller-v2/11_COMPONENT11_SESSION_SECURITY_CONTRACT.md §5, §16.
//
// OWNER PROTECTION RUNS TWICE, and that is deliberate (§5.1.1). This handler
// resolves the target subject and refuses if it is the Platform Owner, so the
// caller gets a clean 403; fn_session_revoke refuses again, so no future caller
// can route around the application check. The database is the authority; the
// handler exists to give a good answer.

import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import type { RevokeResult } from '../schema'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: Request, { params }: { params: { sessionId: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_SESSIONS_REVOKE)
    const { user } = ctx

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:sessions:revoke:${user.id}`, 20, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const sessionId = params.sessionId
    if (!UUID.test(sessionId)) {
      return adminError('VALIDATION_ERROR', 'sessionId must be a UUID', 422)
    }

    const supabase = createAdminClient()

    // Handler-side Owner protection. `fn_session_subject` returns NULL for an
    // unknown session AND for an anonymous one, so neither can be probed here.
    const { data: subject, error: subjectError } = await supabase.rpc('fn_session_subject', {
      p_session_id: sessionId,
    })
    if (subjectError) {
      console.error('[admin][sessions] subject lookup failed:', subjectError.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    if (!subject) return adminError('NOT_FOUND', 'Session not found', 404)

    const { data: ownerFlag, error: ownerError } = await supabase.rpc('fn_is_platform_owner', {
      p_user_id: subject,
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
        targetId: subject as string,
        metadata: { sessionId, reason: 'owner_protected' },
        req,
      })
      return adminError('FORBIDDEN', 'The Platform Owner’s sessions cannot be revoked', 403)
    }

    const { data, error } = await supabase.rpc('fn_session_revoke', { p_session_id: sessionId })
    if (error) {
      console.error('[admin][sessions] revoke failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    // RETURNS TABLE arrives as an array of one row.
    const result = (Array.isArray(data) ? data[0] : data) as RevokeResult | undefined
    if (!result || result.reason === 'not_found') {
      return adminError('NOT_FOUND', 'Session not found', 404)
    }
    if (result.reason === 'owner_protected') {
      // Unreachable through this handler — the check above already returned.
      // Kept because the function is the authority and may be called elsewhere.
      return adminError('FORBIDDEN', 'The Platform Owner’s sessions cannot be revoked', 403)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'session.revoked',
      targetType: 'user',
      targetId: subject as string,
      metadata: { sessionId, revoked: result.revoked },
      req,
    })

    return Response.json({ data: { revoked: result.revoked } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
