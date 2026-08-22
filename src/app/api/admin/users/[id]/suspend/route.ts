// POST /api/admin/users/[id]/suspend — temporarily bar an account.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md §4,
// 19_Security.md §5. Handler contract: RBAC → origin → rate-limit → validate →
// operation → audit → uniform envelope (21_Coding_Standards.md §2).
//
// WHAT A SUSPENSION ACTUALLY DOES, so this route is not read as more than it is:
// §4 says a suspended user cannot post, cannot comment and cannot use AI, but
// can still browse. That enforcement already ships — `src/lib/account/
// accountStatus.ts` gates `POST /api/reviews`, `POST /api/reviews/[id]/comments`
// and `POST /api/chat`. Writing the row here is what turns it on for someone.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { standingOf, suspendUser, suspensionExpiry } from '@/lib/admin/users/accountStatusAdmin'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { SuspendUserSchema } from '../../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_SUSPEND)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:users:suspend:${user.id}`, 20, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = SuspendUserSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { duration_hours, reason } = parsed.data

    const supabase = createAdminClient()
    const denial = await guardMutationTarget(supabase, {
      targetId: params.id,
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      intent: 'user.suspend',
      req,
    })
    if (denial) return denial

    // Absent `duration_hours` means indefinite — see `suspensionExpiry`.
    const until = suspensionExpiry(duration_hours)
    const { before, after } = await suspendUser(supabase, params.id, until)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: 'user.suspend',
      targetType: 'user',
      targetId: params.id,
      // `before` is null when the user had no status row at all. Recorded as
      // null rather than as a synthesised "all false" row, so the log
      // distinguishes a first sanction from a re-suspension.
      beforeState: before
        ? { is_suspended: before.is_suspended, suspended_until: before.suspended_until, is_banned: before.is_banned }
        : undefined,
      afterState: { is_suspended: after.is_suspended, suspended_until: after.suspended_until },
      metadata: { duration_hours: duration_hours ?? null, indefinite: until === null, reason },
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
