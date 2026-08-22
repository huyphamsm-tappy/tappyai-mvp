// POST /api/admin/users/[id]/unban — restore a banned account.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md §4.
//
// Clears `is_banned` and the internal `ban_reason` it justified. It does NOT
// touch `is_suspended`: §4's state machine allows `suspended → banned`, so an
// account can be serving both, and lifting the ban must return the user to the
// suspension they were already under rather than all the way to active.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { standingOf, unbanUser } from '@/lib/admin/users/accountStatusAdmin'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { UnbanUserSchema } from '../../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_UNBAN)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:users:unban:${user.id}`, 20, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = UnbanUserSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { reason } = parsed.data

    const supabase = createAdminClient()
    const denial = await guardMutationTarget(supabase, {
      targetId: params.id,
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      intent: 'user.unban',
      req,
    })
    if (denial) return denial

    const { before, after } = await unbanUser(supabase, params.id)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: 'user.unban',
      targetType: 'user',
      targetId: params.id,
      // The ban reason is carried into `beforeState` because unbanning erases
      // it from the row. Without this the justification for the ban would be
      // unrecoverable the moment it was lifted.
      beforeState: before
        ? { is_banned: before.is_banned, is_suspended: before.is_suspended, ban_reason: before.ban_reason }
        : undefined,
      afterState: { is_banned: after.is_banned, ban_reason: after.ban_reason },
      metadata: { reason },
      req,
    })

    return Response.json({
      data: {
        id: params.id,
        standing: standingOf(after),
        suspended_until: after.suspended_until,
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
