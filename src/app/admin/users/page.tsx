import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { UsersManager } from '@/components/admin/users/UsersManager'

// Module 08 User Management — the Controller surface over the shipped Admin
// Users API (#119, ADR-023). It adds no business logic and no second
// authorization path: every request it makes goes to `/api/admin/users/*`,
// which enforces its own permission through `requirePermission`.
//
// TWO LAYERS, AND THEY ARE NOT THE SAME THING.
//
//   `requirePagePermission` below is ENFORCEMENT — it redirects an actor who
//   may not open this surface at all.
//
//   The `can` flags are UX. 12_RBAC.md §4.2: "UI permission checks are for UX
//   only (hide buttons the user can't use). Server-side checks are the security
//   enforcement." 01_ARCH §8 states the same requirement from the other side —
//   "you never see a door you cannot open". A moderator must not be shown a Ban
//   button that the API will refuse.
//
// Both are resolved by the PDP. There is no role comparison anywhere in this
// module — not here, and not in the client component, which receives booleans
// and never learns what role produced them.
export default async function AdminUsersPage() {
  const ctx = await requirePagePermission(PERMISSIONS.USERS_LIST_READ)

  const can = {
    detail: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_DETAIL_READ),
    suspend: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_SUSPEND),
    unsuspend: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_UNSUSPEND),
    ban: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_BAN),
    unban: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_UNBAN),
    // Gates the email-search affordance only. ADR-023(b) gates the search
    // itself server-side; this stops the box from advertising a search that
    // will come back 403.
    emailSearch: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_EMAIL_READ_FULL),
  }

  return <UsersManager can={can} />
}
