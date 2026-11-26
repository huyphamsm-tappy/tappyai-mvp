// POST /api/admin/users/[id]/plan/revoke — take back ONE plan that was granted from the admin screen (owner 26/11/2026).
//
// It calls the database function that already exists for this (`p8_revoke_manual_grant`, migration 20261015): the grant is named by its ledger
// reference; only the part of it that is still unused is removed, first-in-first-out along the stacked timeline, so time the person BOUGHT before or
// after the grant keeps its full length. Idempotent (`revoke:<grant ref>`), the reason is stored with the entry, and the call is audited.
//
// Only grants made from this screen can be taken back (`grant_ref` must look like `admin:<actor>:<uuid>`; the function itself also demands
// source "manual"). A purchase, a store period or a legacy row is never touched here.
//
// AUTHORIZATION: `users.plan.revoke` (same roles as the grant). Not run through `guardMutationTarget`, for the same reason as the grant.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { RevokePlanGrantSchema } from '../../../schema'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_PLAN_REVOKE)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:users:plan:revoke:${user.id}`, 10, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    if (!UUID_RE.test(params.id)) return adminError('VALIDATION_ERROR', 'Invalid user id', 422)

    const parsed = RevokePlanGrantSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { grant_ref, reason } = parsed.data

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('p8_revoke_manual_grant', {
      p_user: params.id,
      p_grant_ref: grant_ref,
      p_actor: user.id,
      p_note: reason,
    })
    if (error) return adminError('INTERNAL', 'Could not take the plan back', 500)

    const r = (data ?? {}) as { status?: string; removed_seconds?: number; after_end?: string | null; state?: string }
    if (r.status === 'not_found') return adminError('NOT_FOUND', 'That grant does not exist for this user', 404)
    if (r.status === 'duplicate') return Response.json({ data: { id: params.id, status: 'already_revoked' } })

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: 'user.plan.revoke',
      targetType: 'user',
      targetId: params.id,
      afterState: { ends_at: r.after_end ?? null, state: r.state ?? null },
      metadata: { grant_ref, reason, removed_seconds: r.removed_seconds ?? 0 },
      req,
    })

    return Response.json({ data: { id: params.id, status: 'revoked', ends_at: r.after_end ?? null, state: r.state ?? null } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
