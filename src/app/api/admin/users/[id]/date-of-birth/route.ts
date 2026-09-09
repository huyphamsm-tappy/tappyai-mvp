// POST /api/admin/users/[id]/date-of-birth — correct a date of birth.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 19_Security.md §5.
// Handler contract: RBAC → origin → rate-limit → validate → target guard →
// operation → uniform envelope (21_Coding_Standards.md §2).
//
// WHY THIS ROUTE EXISTS. `set_user_date_of_birth()` gives a user exactly one
// self-correction. After that a mis-typed year is unrecoverable by the person
// it affects, and if the stored date puts them under 18 they are locked out of
// the product entirely. The database primitive for the remedy shipped with the
// V3 User Data Foundation; this is the only way a human reaches it.
// See docs/backoffice/phase-reports/V3_DOB_ADMIN_CORRECTION_PATH.md.
//
// ── TWO THINGS THIS ROUTE DELIBERATELY DOES NOT DO ───────────────────────────
//
// 1. IT DOES NOT CALL `writeAuditLog`. `admin_set_user_date_of_birth()` INSERTs
//    the `audit_log` row inside the SAME TRANSACTION as the change, so the two
//    commit together or not at all and a refusal writes nothing. Auditing again
//    here would produce two entries for one event, and the second would survive
//    a transaction that rolled back — an audit claiming a correction that never
//    happened. `route.test.ts` asserts the absence.
//
//    The one audit this file can produce is `guardMutationTarget`'s
//    `user.action_denied` on an Owner-protected target. That is a DENIAL event,
//    a different thing, and it is the shared behaviour of every Module 08
//    mutation.
//
// 2. IT DOES NOT READ THE CURRENT DATE OF BIRTH. There is no such read anywhere
//    in the Controller and there must not be one: no PostgREST role holds a
//    privilege on the column, `user_age_status()` answers only for the CALLER's
//    own `auth.uid()`, and correcting a value does not require seeing it.
//    Operators act on what the subject tells them; the function refuses
//    anything invalid. The response carries a status, never a date.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { correctDateOfBirth } from '@/lib/admin/users/dateOfBirthAdmin'
import { CorrectDateOfBirthSchema } from '../../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    // `users.date_of_birth.correct` — `super_admin` only (Owner, 2026-09-09).
    // The PDP is the single decision path; this file compares no roles.
    const ctx = await requirePermission(req, PERMISSIONS.USERS_DOB_CORRECT)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    // Same window as the sibling sanctions. A correction is rarer than a
    // suspension, but inventing a stricter number here would be policy nobody
    // decided; the ceiling exists to bound abuse, not to ration the operation.
    const rl = await distributedRateLimit(`admin:users:dob:${user.id}`, 20, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = CorrectDateOfBirthSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    // Normalised `YYYY-MM-DD` from `parseDateOfBirthInput`. Never logged, never
    // echoed, never placed in a URL — it leaves this scope only as an RPC
    // argument.
    const { date_of_birth, reason } = parsed.data

    // The privileged client is created only HERE, after authorization has
    // answered. `service_role` is the credential the operation needs, not a way
    // around the check that precedes it.
    const supabase = createAdminClient()

    const denial = await guardMutationTarget(supabase, {
      targetId: params.id,
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      intent: 'user.date_of_birth.correct',
      req,
    })
    if (denial) return denial

    const status = await correctDateOfBirth(supabase, {
      targetId: params.id,
      dateOfBirth: date_of_birth,
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      reason,
    })

    switch (status) {
      case 'corrected':
        // Status only. The date the operator just set is NOT echoed back: a
        // response body is a log line, a browser cache entry and a screenshot.
        return Response.json({ data: { id: params.id, corrected: true } })

      // The three below are already refused by `guardMutationTarget` and the
      // zod schema, so reaching them means the API and the database disagree
      // about what is valid. Mapped honestly rather than collapsed into a 500,
      // because the database is the authority and its answer is the true one.
      case 'user_not_found':
        return adminError('NOT_FOUND', 'User not found', 404)
      case 'invalid_date':
        return adminError('VALIDATION_ERROR', 'date_of_birth was refused by the database', 422)
      case 'reason_too_short':
        return adminError('VALIDATION_ERROR', 'reason must be at least 20 characters', 422)

      // The actor comes from the authenticated context, so this is our defect,
      // never the caller's input. It must not read as a client error.
      case 'invalid_actor':
        console.error('[admin][users] date_of_birth correction rejected the actor')
        return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
  } catch (err) {
    return adminErrorResponse(err)
  }
}
