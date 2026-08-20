// POST /api/admin/users/[id]/ban — permanently bar an account.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md §4.
//
// ⚠️ THIS ROUTE DOES NOT REVOKE SESSIONS, AND §4 SAYS A BAN SHOULD.
//
// §4 defines a ban as three things: set the flag, revoke every active Supabase
// session, and stop the user logging in. Only the first is a column. The other
// two are Auth Admin API operations against `auth.sessions`, which is a
// separate piece of work with its own Owner authorization (Module 08 item 3).
//
// So what a ban does TODAY: consumer enforcement blocks the account from
// posting, commenting and using AI — `evaluateAccountStatus` ranks a ban above
// a suspension, so a banned user is blocked on every gated route. What it does
// NOT do: end an existing session, or prevent a fresh login. A banned user with
// a live session keeps browsing.
//
// The response says so, in `session_revocation_pending`. A Controller that
// renders "banned" without that caveat would tell a moderator the person is
// gone when they are still signed in. Until session revocation ships, the
// operational answer is to follow a ban with
// `POST /api/admin/security/sessions/force-logout`, which does end every
// session for one user — it is `security.sessions.revoke`, held by
// `super_admin`, so it is not chained from here silently.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import {
  banUser,
  standingOf,
  BAN_SESSION_REVOCATION_PENDING,
} from '@/lib/admin/users/accountStatusAdmin'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { BanUserSchema } from '../../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_BAN)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    // Tighter than suspend: a ban is the highest-blast-radius operation this
    // module offers, and matches the limit on force-logout.
    const rl = await distributedRateLimit(`admin:users:ban:${user.id}`, 10, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = BanUserSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { reason, notes } = parsed.data

    const supabase = createAdminClient()
    const denial = await guardMutationTarget(supabase, {
      targetId: params.id,
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      intent: 'user.ban',
      req,
    })
    if (denial) return denial

    const { before, after } = await banUser(supabase, params.id, reason)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: 'user.ban',
      targetType: 'user',
      targetId: params.id,
      beforeState: before
        ? { is_banned: before.is_banned, is_suspended: before.is_suspended, ban_reason: before.ban_reason }
        : undefined,
      afterState: { is_banned: after.is_banned, ban_reason: after.ban_reason },
      // Recorded on the entry so a later reader can tell that the ban did not
      // include session revocation — a fact that will stop being true, and
      // whose history must not be rewritten by the change that fixes it.
      metadata: { reason, notes: notes ?? null, sessions_revoked: false },
      req,
    })

    return Response.json({
      data: {
        id: params.id,
        standing: standingOf(after),
        // See the header. This flag is the API's statement that the ban is
        // recorded but not yet enforced at the session layer.
        session_revocation_pending: BAN_SESSION_REVOCATION_PENDING,
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
