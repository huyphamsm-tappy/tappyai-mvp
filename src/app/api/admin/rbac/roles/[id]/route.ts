// /api/admin/rbac/roles/[id] — revoke an admin role (super_admin only).
// 05_API_Architecture.md §9.

import { requireOwner, adminErrorResponse, adminError, invalidateRoleCache, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_ROLES_REVOKE)
    const { user } = ctx
    const role = auditActorRole(ctx.actor)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:rbac:revoke:${user.id}`, 20, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const supabase = createAdminClient()

    // Read the row first for audit before_state + to invalidate the right user
    // cache. This is a READ only — the delete goes through fn_revoke_admin_role,
    // which re-reads and re-checks everything server-side.
    const { data: existing, error: readErr } = await supabase
      .from('admin_roles')
      .select('id, user_id, role, expires_at, notes')
      .eq('id', params.id)
      .single()

    if (readErr || !existing) return adminError('NOT_FOUND', 'Role assignment not found', 404)

    // Constitutional pre-check (component 1): only the Platform Owner may demote
    // a Super Admin. Mirrors the guard inside fn_revoke_admin_role so the caller
    // gets a clear 403 rather than a raw Postgres error.
    if (existing.role === 'super_admin') requireOwner(ctx, 'revoke super_admin')

    // The last-super_admin lockout guard and the Owner-protection guard both now
    // live inside fn_revoke_admin_role, so they cannot be bypassed by any other
    // write path.
    const { error: delErr } = await supabase.rpc('fn_revoke_admin_role', {
      p_actor_id: user.id,
      p_role_id: params.id,
    })
    if (delErr) {
      if (delErr.code === 'P0002') return adminError('NOT_FOUND', 'Role assignment not found', 404)
      if (delErr.code === '23514') {
        return adminError('CONFLICT', 'Cannot revoke the last remaining super_admin', 409)
      }
      if (delErr.code === '42501') return adminError('FORBIDDEN', delErr.message, 403)
      console.error('[admin][rbac] revoke failed:', delErr.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    invalidateRoleCache(existing.user_id)
    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: role,
      action: existing.role === 'super_admin' ? 'owner.super_admin_revoked' : 'rbac.role_revoked',
      targetType: 'user',
      targetId: existing.user_id,
      beforeState: { role: existing.role, expires_at: existing.expires_at },
      metadata: { by_owner: ctx.actor.isOwner },
      req,
    })

    return Response.json({ data: { id: params.id, revoked: true } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
