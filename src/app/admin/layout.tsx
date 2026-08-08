import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveActorForUser } from '@/lib/admin/rbac'
import { resolveAdminNavigation } from '@/lib/controller/adminNavigation'
import { AdminShell } from '@/components/admin/layout/AdminShell'
import { Toaster } from '@/components/ui/sonner'

// Back Office root layout — the AUTHORITATIVE RBAC gate for all /admin pages
// (owner decision Phase 0: enforce in layout + handlers, not middleware).
// Middleware has already redirected unauthenticated users; here we resolve the
// admin role and deny non-admins. Wraps everything in `.admin-theme` so the
// shadcn tokens apply only inside the back office.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')

  // POLICY CHANGE (declared — see RELEASE_READINESS §5): the previous gate was
  // `if (!resolveAdminRole(user.id)) redirect('/reviews')`, which locked the
  // Platform Owner out of their own Controller if they held no admin_roles row.
  // Ownership does not derive from a role, so it must not depend on one.
  //
  // Component 3 / FOUNDATION-03: resolve the full Actor (all roles, not just the
  // highest). Navigation is derived server-side from the Controller registry +
  // PDP (resolveAdminNavigation) — the single navigation authority; the legacy
  // static NAV[] is gone. `role` is still passed, but only to render the role
  // label.
  const actor = await resolveActorForUser(user.id, user.email)
  if (!actor.isOwner && actor.roles.length === 0) redirect('/reviews') // authenticated but not an admin

  const navGroups = resolveAdminNavigation(actor)

  return (
    <div className="admin-theme">
      <AdminShell
        role={actor.highestRole ?? 'analyst'}
        isOwner={actor.isOwner}
        email={user.email ?? '—'}
        navGroups={navGroups}
      >
        {children}
      </AdminShell>
      <Toaster />
    </div>
  )
}
