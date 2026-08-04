// /api/admin/rbac/roles — list + grant admin roles (super_admin only).
// 05_API_Architecture.md §9. Handler contract: RBAC -> origin -> rate-limit ->
// validate -> operation -> audit -> uniform envelope (21_Coding_Standards.md §2).

import { requireOwner, adminErrorResponse, adminError, invalidateRoleCache, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { GrantRoleSchema } from './schema'

// Reads auth headers per request — always dynamic (never statically rendered).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requirePermission(req, PERMISSIONS.SECURITY_ROLES_READ)
    if (!rateLimit(`admin:rbac:list:${user.id}`, 100, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('admin_roles')
      .select('id, user_id, role, granted_by, granted_at, expires_at, notes, profiles!admin_roles_user_id_fkey(full_name)')
      .order('granted_at', { ascending: false })

    if (error) {
      console.error('[admin][rbac] list failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    return Response.json({ data })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_ROLES_GRANT)
    const { user } = ctx
    const role = ctx.actor.highestRole ?? 'super_admin'
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:rbac:grant:${user.id}`, 20, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const parsed = GrantRoleSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const input = parsed.data

    // Constitutional pre-checks (Controller V2 component 1). These mirror the
    // rules enforced inside fn_grant_admin_role so the API can answer a clear
    // 403 instead of surfacing a raw Postgres 42501. The DATABASE is the
    // authority — after the lockdown migration this handler no longer holds
    // INSERT on admin_roles at all, so a bug here cannot escalate privilege.
    if (input.role === 'super_admin') requireOwner(ctx, 'grant super_admin')
    if (input.user_id === user.id) {
      return adminError('FORBIDDEN', 'Self-promotion is not permitted', 403)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('fn_grant_admin_role', {
      p_actor_id: user.id,
      p_user_id: input.user_id,
      p_role: input.role,
      p_notes: input.notes ?? null,
      p_expires_at: input.expires_at ?? null,
    })

    if (error) {
      if (error.code === '23505') return adminError('CONFLICT', 'User already has this role', 409)
      // 42501 = insufficient_privilege, raised by the constitutional guards.
      if (error.code === '42501') return adminError('FORBIDDEN', error.message, 403)
      console.error('[admin][rbac] grant failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    invalidateRoleCache(input.user_id)
    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: role,
      // super_admin grants are Owner-only and audited under their own action so
      // they can be alerted on and filtered without parsing afterState.
      action: input.role === 'super_admin' ? 'owner.super_admin_granted' : 'rbac.role_granted',
      targetType: 'user',
      targetId: input.user_id,
      afterState: { role: input.role, expires_at: input.expires_at ?? null },
      metadata: { notes: input.notes ?? null, by_owner: ctx.actor.isOwner },
      req,
    })

    return Response.json({ data })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
