// Controller V2 — Department Memberships, as a Controller module.
//
// The BACKEND already exists and is production-live: FOUNDATION-06 schema,
// FOUNDATION-07C membership service (canonical PDP + department authority +
// audit), FOUNDATION-10B's API, and F-10 itself, which the Owner activated on
// 2026-08-10 under Decision C, Option 1. Production carries one active
// DEPARTMENT_HEAD membership. None of it is re-implemented here.
//
// What was missing is everything ABOVE the API — the same gap Phase 7 found in
// the shell and Module 08 found in the users surface: a layer that exists in
// the registry and is invisible in the product. `/org/memberships` was the last
// admin route with no page, and STATUS.md carried it as blocked on "F-10
// activation plus four further decisions" long after all five were resolved.
//
// Owner Decision D6 (2026-08-22) authorized the surface. This is its manifest.

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { orgMembershipEnabled } from '../org/featureGate'
import type { ModuleManifest } from '../types'

/**
 * Module — Department Memberships.
 *
 * THE HUB WAS NEVER AN OPEN QUESTION. `01_ARCH` §4.1 types a permission as
 * `hub.module.action`, and this capability has been `security.membership.read`
 * since F-07D. The permission id had already named both the hub and the module;
 * choosing anything else here would contradict the id the PDP enforces.
 *
 * ORDER 40 — after RBAC (30) and Audit (20), so no existing Security entry
 * moves. Placing it first would have renumbered two live surfaces to seat one
 * new one, which is the trade Module 08 refused for the same reason.
 *
 * `permissions` declares ONLY the read. C6 §5 makes permission ownership
 * exclusive across modules, so declaring `.manage` would claim it for this
 * module and refuse any future module that legitimately needs it — and this
 * surface does not use it. Decision D6 keeps assignment, suspension and removal
 * in the API, where they already are: destructive UAT is not authorized, and a
 * control that cannot be verified should not ship.
 *
 * `data` is deliberately ABSENT (ADR-024): absence means the module owns no
 * tables. `department_membership` is FOUNDATION-06 infrastructure that the
 * kernel's own membership resolution reads on every request — it is not this
 * module's property, and claiming it would be smuggling ownership into a UI
 * change.
 */
export const orgMembershipModule: ModuleManifest = {
  id: 'tappy.hub.security.membership',
  name: 'Department Memberships',
  version: '1.0.0',
  owner: 'platform',
  hub: 'tappy.hub.security',
  capabilities: [],
  permissions: [PERMISSIONS.SECURITY_MEMBERSHIP_READ],
  dependencies: [],
  routes: ['/admin/org/memberships'],
  navigation: {
    label: 'admin.nav.memberships',
    icon: 'Building2',
    order: 40,
    visibilityPermission: PERMISSIONS.SECURITY_MEMBERSHIP_READ,
  },
  lifecycle: 'stable',
  // `01_ARCH` §8: "you never see a door you cannot open." While F-10 is off the
  // membership API returns 404, so this entry must not be navigable — and the
  // kernel already models exactly that: `isReady` requires status 'enabled',
  // and `isModuleAccessible`, which the navigation provider consults, requires
  // readiness. This is the existing mechanism, not a new one.
  status: orgMembershipEnabled() ? 'enabled' : 'disabled',
  compatibility: { controller: '^1' },
}
