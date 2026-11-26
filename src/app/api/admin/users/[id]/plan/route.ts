// /api/admin/users/[id]/plan — see and give a paid plan to one consumer account (owner 26/11/2026).
//
//   GET   the person's current plan and the grants made from this screen (so one can be taken back)
//   POST  grant a plan for 1 to 12 months, or with no expiry
//   (the revoke is POST …/plan/revoke)
//
// WHY. There was no way to give a person a plan without a payment: the SQL function behind every purchase (`p8_apply_entitlement`) has an
// "admin" channel (source `manual`), but nothing called it. The first case: the owner's own account, founder@tappyai.com, which had no plan and
// therefore the Free allowance (no tools).
//
// WHAT IT GRANTS: ACCESS VALUE only (a plan for a time, stacked on any plan the person already holds). It never grants authority: no admin role,
// no permission. Roles stay behind /api/admin/rbac/roles (`super_admin`).
//
// AUTHORIZATION: `users.plan.grant` (admin and super_admin; the Platform Owner holds every permission). One PDP decision, no role comparison here.
// The target is NOT run through `guardMutationTarget`: that guard exists to stop sanctions against an Owner / oneself, and a grant is not a
// sanction. A grant to the Owner (or to oneself) is recorded like any other: the audit row names actor and target.
//
// ONE WRITER, THE SAME ONE AS A PURCHASE: `grantPlan(..., 'admin', externalRef)`. The reference is generated here (the caller cannot choose it), so
// every call is a new, auditable grant, and it is the handle the revoke uses.
//
// NO EXPIRY is stored as a date GRANT_LIFETIME_YEARS (100) years away: every rule that reads "paid until" (entitlement, expiry cron, the screens)
// keeps working unchanged, and revoking it removes that long unused tail like any other grant.

import { randomUUID } from 'crypto'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { grantPlan } from '@/lib/payments/grantPlan'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import { addMonths } from '@/lib/admin/users/planGrant'
import { GrantPlanSchema, GRANT_LIFETIME_YEARS } from '../../schema'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_PLAN_GRANT)
    if (!UUID_RE.test(params.id)) return adminError('VALIDATION_ERROR', 'Invalid user id', 422)
    const rl = await distributedRateLimit(`admin:users:plan:read:${ctx.user.id}`, 60, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    const supabase = createAdminClient()
    const [subRes, grantRes, revokeRes] = await Promise.all([
      supabase.from('subscriptions').select('plan, status, current_period_end, source').eq('user_id', params.id).maybeSingle(),
      supabase.from('entitlement_ledger').select('external_ref, plan, seconds, after_end, note, created_at, actor_id')
        .eq('user_id', params.id).eq('source', 'manual').eq('mode', 'stack').order('id', { ascending: false }).limit(20),
      supabase.from('entitlement_ledger').select('external_ref').eq('user_id', params.id).eq('mode', 'revoke_manual').limit(200),
    ])
    if (subRes.error || grantRes.error || revokeRes.error) return adminError('INTERNAL', 'Could not read the plan', 500)

    const revoked = new Set(((revokeRes.data ?? []) as Array<{ external_ref: string }>).map((r) => r.external_ref))
    const grants = ((grantRes.data ?? []) as Array<Record<string, unknown>>).map((g) => ({
      grant_ref: g.external_ref as string,
      plan: g.plan as string,
      label: PLAN_CONFIG[g.plan as keyof typeof PLAN_CONFIG]?.label ?? String(g.plan),
      seconds: Number(g.seconds ?? 0),
      ends_at: (g.after_end as string | null) ?? null,
      reason: (g.note as string | null) ?? null,
      granted_at: g.created_at as string,
      revoked: revoked.has(`revoke:${g.external_ref as string}`),
    }))
    const sub = subRes.data as { plan: string; status: string; current_period_end: string | null; source: string | null } | null
    return Response.json({ data: { current: sub ? { plan: sub.plan, status: sub.status, ends_at: sub.current_period_end, source: sub.source } : null, grants } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

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
    const { plan, months, lifetime, reason } = parsed.data

    const supabase = createAdminClient()

    // The target must be a real, non-anonymous account: a guest identity is not somebody to give a plan to.
    const { data: target, error: targetError } = await supabase.auth.admin.getUserById(params.id)
    if (targetError || !target?.user) return adminError('NOT_FOUND', 'User not found', 404)
    if (target.user.is_anonymous === true) return adminError('VALIDATION_ERROR', 'A guest session cannot hold a plan', 422)

    const now = new Date()
    const expiresAt = lifetime ? addMonths(now, GRANT_LIFETIME_YEARS * 12) : addMonths(now, months as number)
    const externalRef = `admin:${user.id}:${randomUUID()}`
    const result = await grantPlan(params.id, plan, 'admin', externalRef, expiresAt, {
      purchasedAt: now,
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
      afterState: { plan, lifetime: lifetime === true, months: months ?? null, ends_at: result.status === 'applied' ? result.afterEnd : null },
      metadata: { plan, plan_label: PLAN_CONFIG[plan].label, months: months ?? null, lifetime: lifetime === true, reason, external_ref: externalRef, result: result.status },
      req,
    })

    return Response.json({
      data: {
        id: params.id,
        plan,
        months: months ?? null,
        lifetime: lifetime === true,
        status: result.status,
        grant_ref: externalRef,
        ends_at: result.status === 'applied' ? result.afterEnd : null,
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
