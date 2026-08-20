// POST /api/admin/users/[id]/unsuspend — lift a suspension.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md §4.
//
// Deliberately NOT idempotency-guarded: unsuspending an already-active user is
// accepted and audited rather than rejected with a 409. The alternative leaks
// the account's current standing to a caller who is allowed to act on it but
// has not read it, and it turns a harmless duplicate click into an error.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { standingOf, unsuspendUser } from '@/lib/admin/users/accountStatusAdmin'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { UnsuspendUserSchema } from '../../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_UNSUSPEND)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:users:unsuspend:${user.id}`, 20, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = UnsuspendUserSchema.safeParse(await req.json().catch(() => null))
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
      intent: 'user.unsuspend',
      req,
    })
    if (denial) return denial

    const { before, after } = await unsuspendUser(supabase, params.id)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: 'user.unsuspend',
      targetType: 'user',
      targetId: params.id,
      beforeState: before
        ? { is_suspended: before.is_suspended, suspended_until: before.suspended_until, is_banned: before.is_banned }
        : undefined,
      afterState: { is_suspended: after.is_suspended, suspended_until: after.suspended_until },
      metadata: { reason },
      req,
    })

    // `standingOf` rather than a hardcoded `'active'`: lifting a suspension on
    // an account that is ALSO banned leaves it banned (§4 allows both flags at
    // once), and reporting "active" there would be a lie the UI would repeat.
    return Response.json({ data: { id: params.id, standing: standingOf(after), suspended_until: null } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
