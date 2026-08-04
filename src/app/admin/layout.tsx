import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveActorForUser } from '@/lib/admin/rbac'
import { permissionEngine } from '@/lib/admin/permissions'
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

  // Component 3: resolve the full Actor (all roles, not just the highest) and
  // hand the shell the actor's PERMISSIONS. The shell filters navigation on
  // those rather than on role rank, so an operator never sees a door they
  // cannot open. `role` is still passed, but only to render the role label.
  const actor = await resolveActorForUser(user.id, user.email)
  if (!actor.isOwner && actor.roles.length === 0) redirect('/reviews') // authenticated but not an admin

  const permissions = permissionEngine.listPermissions(actor)

  return (
    <div className="admin-theme">
      <AdminShell
        role={actor.highestRole ?? 'analyst'}
        email={user.email ?? '—'}
        permissions={permissions}
      >
        {children}
      </AdminShell>
      <Toaster />
    </div>
  )
}
