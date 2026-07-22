import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminRole, hasRole, type AdminRole } from '@/lib/admin/rbac'

// Page-level RBAC guard for admin server components. The /admin layout already
// ensures the user is *some* admin; this enforces a per-page MINIMUM role
// (e.g. /admin/rbac requires super_admin). API handlers enforce independently
// too (defense-in-depth). Redirects to /admin if the role is insufficient.
export async function requirePageRole(
  minRole: AdminRole
): Promise<{ userId: string; email: string; role: AdminRole }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')

  const role = await resolveAdminRole(user.id)
  if (!role || !hasRole(role, minRole)) redirect('/admin')

  return { userId: user.id, email: user.email ?? '—', role }
}
