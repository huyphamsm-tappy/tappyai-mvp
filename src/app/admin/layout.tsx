import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminRole } from '@/lib/admin/rbac'
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

  const role = await resolveAdminRole(user.id)
  if (!role) redirect('/reviews') // authenticated but not an admin

  return (
    <div className="admin-theme">
      <AdminShell role={role} email={user.email ?? '—'}>
        {children}
      </AdminShell>
      <Toaster />
    </div>
  )
}
