// POST /api/admin/users/[id]/ban — permanently bar an account.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md §4.
//
// §4 defines a ban as three things: set the flag, revoke every active Supabase
// session, and stop the user logging in. For a long time only the first was
// built, and the response said so in `session_revocation_pending`. C11 put the
// revocation mechanism into production on 2026-08-15 (ADR-021); this route now
// uses it, so two of the three hold. Preventing a fresh login remains separate.
//
// AUTHORIZATION — Owner Decision A, 2026-08-21.
// `users.account.ban` authorizes the COMPLETE ban operation, revocation
// included. That is ONE decision for one operation, not a second authorization
// path: the revocation here is an internal step of a ban, reached only through
// this handler and only for this target.
//
// It is deliberately NOT a compound gate. §4 gives the ban to the ban
// permission; also demanding `security.sessions.revoke` would make the
// documented ban unperformable by the role the contract grants it to.
//
// And it grants nothing generic. Arbitrary session revocation stays behind
// `security.sessions.revoke` on the C11 routes; holding the ban permission
// confers no power to end sessions outside a ban.
//
// ATOMICITY IS NOT AVAILABLE, so honesty stands in for it. `account_status`
// lives in this database; `auth.sessions` belongs to GoTrue. No transaction
// spans them. The flag is written FIRST, because the reachable failure state is
// then "banned but still signed in" — visible, recoverable, and exactly what
// this route did before — rather than "sessions killed for an account that was
// never banned". When revocation fails the ban STANDS and the response keeps
// saying `session_revocation_pending: true`. A partial ban is never silent.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { banUser, standingOf } from '@/lib/admin/users/accountStatusAdmin'
import { revokeAllSessions, revocationSucceeded } from '@/lib/admin/sessions/revokeSessions'
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

    // Then the sessions. Reached only after the flag is written and only after
    // every guard above — including `guardMutationTarget`, which refuses an
    // Owner target, so `owner_protected` should be unreachable here. C11's
    // function refuses independently anyway; the two defences do not share a
    // code path on purpose.
    const revocation = await revokeAllSessions(supabase, params.id)
    const sessionsRevoked = revocationSucceeded(revocation)

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
      // `sessions_revoked` stays a BOOLEAN, the shape it has always had, so
      // entries written before and after this change stay comparable — the
      // history of bans that did not revoke must remain readable. The count and
      // the failure reason are new keys beside it.
      metadata: {
        reason,
        notes: notes ?? null,
        sessions_revoked: sessionsRevoked,
        revoked_count: revocation.revoked,
        ...(sessionsRevoked ? {} : { revocation_reason: revocation.reason }),
      },
      req,
    })

    return Response.json({
      data: {
        id: params.id,
        standing: standingOf(after),
        sessions_revoked: revocation.revoked,
        // Still true whenever the session half did not happen — a Controller
        // that renders "banned" without this would tell a moderator the person
        // is gone while they are still signed in.
        session_revocation_pending: !sessionsRevoked,
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
