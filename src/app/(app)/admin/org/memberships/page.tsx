import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { MembershipRoster } from '@/components/admin/org/MembershipRoster'
import { GuardedSurface } from '@/components/admin/layout/GuardedSurface'

// Department Memberships — the Controller surface over the shipped membership
// API (FOUNDATION-10B), authorized by Owner Decision D6, 2026-08-22.
//
// It adds no business logic and no second authorization path: the one request
// it makes goes to `/api/admin/org/memberships`, which enforces the same
// permission through `requirePermission` and runs the canonical PDP inside
// `listDepartmentRoster`.
//
// `requirePagePermission` here is ENFORCEMENT — it redirects an actor who may
// not open this surface at all. There are no `can` flags because there is
// nothing to gate: the surface is read-only by D6, so every operator who can
// open it can see all of it. Passing flags nothing reads would suggest a
// capability model this page does not have.
//
// The page is reachable only while F-10 is on. That is not enforced here — it
// is enforced twice over, where it belongs: the API returns 404 behind the
// feature gate, and the module manifest's `status` follows the same flag, so
// the kernel keeps the nav entry out of `isModuleAccessible`. `01_ARCH` §8:
// you never see a door you cannot open.
export default async function AdminOrgMembershipsPage() {
  await requirePagePermission(PERMISSIONS.SECURITY_MEMBERSHIP_READ)
  return (
    <GuardedSurface><MembershipRoster /></GuardedSurface>
  )
}
