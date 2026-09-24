import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveActorForPage } from '@/lib/admin/permissions/guards'
import { resolveAdminNavigation } from '@/lib/controller/adminNavigation'
import { orgMembershipEnabled, resolveActorMemberships } from '@/lib/controller/org/server'
import { filterNavByDepartment } from '@/lib/controller/org/navDepartment'
import { AdminShell } from '@/components/admin/layout/AdminShell'
import { controllerEnv } from '@/lib/controller/adminConfig'
import { serverEnv } from '@/lib/config/env'
import { refreshPlatformSettings } from '@/lib/controller/platformSettingsServer'
import { Toaster } from '@/components/ui/sonner'
import { loginPathFor } from '@/lib/auth/returnTo'
import { denialPath } from '@/lib/admin/denial'

// Back Office root layout — the AUTHORITATIVE RBAC gate for all /admin pages
// (owner decision Phase 0: enforce in layout + handlers, not middleware).
// Middleware has already redirected unauthenticated users; here we resolve the
// admin role and deny non-admins. Wraps everything in `.admin-theme` so the
// shadcn tokens apply only inside the back office.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(loginPathFor('/admin'))

  // K-2 (Owner Decision D1b): load the Configuration Provider's runtime tier.
  // TTL-limited, so this is one read per instance per 30s rather than one per
  // page, and it never throws — a settings outage falls through to
  // flags/env/defaults, which is what FOUNDATION-01 §7 precedence is for.
  //
  // AFTER the authentication check, deliberately. An anonymous request must not
  // be able to make the Controller touch a service-role table; middleware
  // already redirects those, and relying on that alone would put the only guard
  // in a different file from the thing it guards.
  await refreshPlatformSettings()

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
  //
  // FOUNDATION-10C: `resolveActorForPage` runs the trusted corporate-identity
  // boundary before the Actor exists — an identity that is not a verified
  // @tappyai.com mailbox is redirected out of the Controller and never becomes a
  // principal. Being corporate is NOT authorization: the role/owner check below
  // and the per-page PDP guard still decide everything.
  const actor = await resolveActorForPage(user)
  // B5: a corporate identity with no role at all is told so, instead of being
  // dropped on the consumer site with no signal.
  if (!actor.isOwner && actor.roles.length === 0) redirect(denialPath('no_admin_role'))

  // Single navigation authority: registry → PDP filter (resolveAdminNavigation).
  // FOUNDATION-07D refinement: when department memberships are ENABLED, apply the
  // department-scope filter AFTER the PDP filter — a module owned by a department
  // is shown only to members whose scope covers it (Owner sees all). While the
  // flag is OFF (the default, and production today), no filter runs and behavior
  // is byte-for-byte unchanged. This is presentation only; server authorization
  // (page guards + the membership API) remains the boundary for direct access.
  let navGroups = resolveAdminNavigation(actor)
  if (orgMembershipEnabled()) {
    const memberships = await resolveActorMemberships(actor)
    navGroups = filterNavByDepartment(navGroups, { isOwner: actor.isOwner, memberships })
  }

  return (
    // D10 (V2.1): `admin-theme` supplies the Controller's fixed dark palette;
    // `dark` is paired with it so Tailwind's `dark:` variants — which components
    // like DealsManager already ship in full — actually resolve inside the
    // Controller. Both are STATIC classes on this subtree: no toggle, no
    // preference, no persistence, and `<html>` is untouched, so the consumer app
    // is unaffected. `.admin-theme` is declared after `.dark` in globals.css, so
    // the Controller palette wins wherever the two define the same token.
    //
    // `canonicalOrigin` is read HERE, from the same `serverEnv.siteUrl()` that
    // `isSameOrigin` reads on every guarded /api/admin/* request. Handing it
    // down means the UI's answer and the server's answer come from one value; a
    // client component reading the environment for itself would be a second
    // source, and two sources eventually disagree. It is presentation only —
    // the server guard decides, exactly as before.
    <div className="admin-theme dark">
      <AdminShell
        role={actor.highestRole ?? 'analyst'}
        isOwner={actor.isOwner}
        email={user.email ?? '—'}
        navGroups={navGroups}
        env={controllerEnv()}
        canonicalOrigin={serverEnv.siteUrl() ?? null}
      >
        {children}
      </AdminShell>
      <Toaster />
    </div>
  )
}
