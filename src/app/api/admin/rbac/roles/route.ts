// /api/admin/rbac/roles — list + grant admin roles (super_admin only).
// 05_API_Architecture.md §9. Handler contract: RBAC -> origin -> rate-limit ->
// validate -> operation -> audit -> uniform envelope (21_Coding_Standards.md §2).

import { requireAdminRole, adminErrorResponse, adminError, invalidateRoleCache, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { GrantRoleSchema } from './schema'

// Reads auth headers per request — always dynamic (never statically rendered).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requireAdminRole(req, 'super_admin')
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
    const { user, role } = await requireAdminRole(req, 'super_admin')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:rbac:grant:${user.id}`, 20, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const parsed = GrantRoleSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const input = parsed.data

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('admin_roles')
      .insert({
        user_id: input.user_id,
        role: input.role,
        granted_by: user.id,
        notes: input.notes ?? null,
        expires_at: input.expires_at ?? null,
      })
      .select('id, user_id, role, granted_at, expires_at, notes')
      .single()

    if (error) {
      if (error.code === '23505') return adminError('CONFLICT', 'User already has this role', 409)
      console.error('[admin][rbac] grant failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    invalidateRoleCache(input.user_id)
    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: role,
      action: 'rbac.role_granted',
      targetType: 'user',
      targetId: input.user_id,
      afterState: { role: input.role, expires_at: input.expires_at ?? null },
      metadata: { notes: input.notes ?? null },
      req,
    })

    return Response.json({ data })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
