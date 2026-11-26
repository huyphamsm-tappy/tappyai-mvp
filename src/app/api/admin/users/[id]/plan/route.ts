// POST /api/admin/users/[id]/plan — grant a paid plan to one consumer account (owner 26/11/2026).
//
// WHY. There was no way to give a person a plan without a payment: the SQL function behind every purchase (`p8_apply_entitlement`) has an
// "admin" channel (source `manual`), but nothing called it. The first case: the owner's own account, founder@tappyai.com, which had no plan and
// therefore the Free allowance (no tools).
//
// WHAT IT GRANTS: ACCESS VALUE only (a plan for N days, stacked on any plan the person already holds). It never grants authority: no admin role,
// no permission. Roles stay behind /api/admin/rbac/roles (`super_admin`).
//
// AUTHORIZATION: `users.plan.grant` (admin and super_admin; the Platform Owner holds every permission). One PDP decision, no role comparison here.
// The target is NOT run through `guardMutationTarget`: that guard exists to stop sanctions against an Owner / oneself, and a grant is not a
// sanction. An administrator giving the Owner (or themselves) a plan is recorded like any other grant: the audit row names actor and target.
//
// ONE WRITER, THE SAME ONE AS A PURCHASE: `grantPlan(..., 'admin', externalRef)`. The external reference is generated here, so a double click is
// two grants but a retry of the SAME request body from the SAME form (client sends nothing) cannot reuse one: each call is a new, auditable grant.

import { randomUUID } from 'crypto'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { grantPlan } from '@/lib/payments/grantPlan'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import { GrantPlanSchema } from '../../schema'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_PLAN_GRANT)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    // A grant is worth money: a tight ceiling per administrator.
    const rl = await distributedRateLimit(`admin:users:plan:${user.id}`, 10, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    if (!UUID_RE.test(params.id)) return adminError('VALIDATION_ERROR', 'Invalid user id', 422)

    const parsed = GrantPlanSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { plan, days, reason } = parsed.data

    const supabase = createAdminClient()

    // The target must be a real, non-anonymous account: a guest identity is not somebody to give a plan to.
    const { data: target, error: targetError } = await supabase.auth.admin.getUserById(params.id)
    if (targetError || !target?.user) return adminError('NOT_FOUND', 'User not found', 404)
    if (target.user.is_anonymous === true) return adminError('VALIDATION_ERROR', 'A guest session cannot hold a plan', 422)

    const expiresAt = new Date(Date.now() + days * 86_400_000)
    const externalRef = `admin:${user.id}:${randomUUID()}`
    const result = await grantPlan(params.id, plan, 'admin', externalRef, expiresAt, {
      actorId: user.id,
      note: reason,
      db: supabase,
    })

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: 'user.plan.grant',
      targetType: 'user',
      targetId: params.id,
      afterState: { plan, days, expires_at: result.status === 'applied' ? result.afterEnd : null },
      metadata: { plan, plan_label: PLAN_CONFIG[plan].label, days, reason, external_ref: externalRef, result: result.status },
      req,
    })

    return Response.json({
      data: {
        id: params.id,
        plan,
        days,
        status: result.status,
        expires_at: result.status === 'applied' ? result.afterEnd : null,
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
