// /api/admin/rbac/roles/[id] — revoke an admin role (super_admin only).
// 05_API_Architecture.md §9.

import { requireAdminRole, adminErrorResponse, adminError, invalidateRoleCache, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, role } = await requireAdminRole(req, 'super_admin')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:rbac:revoke:${user.id}`, 20, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const supabase = createAdminClient()

    // Read the row first for audit before_state + to invalidate the right user cache.
    const { data: existing, error: readErr } = await supabase
      .from('admin_roles')
      .select('id, user_id, role, expires_at, notes')
      .eq('id', params.id)
      .single()

    if (readErr || !existing) return adminError('NOT_FOUND', 'Role assignment not found', 404)

    // Guardrail: prevent revoking the last remaining super_admin (avoids lockout).
    if (existing.role === 'super_admin') {
      const { count } = await supabase
        .from('admin_roles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
      if ((count ?? 0) <= 1) {
        return adminError('CONFLICT', 'Cannot revoke the last remaining super_admin', 409)
      }
    }

    const { error: delErr } = await supabase.from('admin_roles').delete().eq('id', params.id)
    if (delErr) {
      console.error('[admin][rbac] revoke failed:', delErr.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    invalidateRoleCache(existing.user_id)
    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: role,
      action: 'rbac.role_revoked',
      targetType: 'user',
      targetId: existing.user_id,
      beforeState: { role: existing.role, expires_at: existing.expires_at },
      req,
    })

    return Response.json({ data: { id: params.id, revoked: true } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
