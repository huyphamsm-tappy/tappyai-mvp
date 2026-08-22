// Controller V2 — Module 08 User Management, as a Controller module.
//
// The BACKEND already exists and is production-live: `account_status`
// (ADR-022, #117), consumer enforcement (#118), and the Admin Users API with
// eight permissions (#119, ADR-023). None of it is re-implemented here.
//
// What was missing is everything ABOVE the API. `ADMIN_HUBS` held five hubs and
// `ADMIN_MODULES` eight modules, and neither `tappy.hub.user` nor any users
// module was among them — so Module 08 was reachable by direct API call and
// invisible in the product. This file is the manifest that closes that, and it
// DESCRIBES the shipped surface exactly as `securityAuditModule` describes the
// shipped Audit surface.
//
// The hub USED to live in this file, following the Security Hub's precedent.
// That reasoning — "a hub whose modules are declared elsewhere has no single
// place that states what it is for" — held only while the hub had exactly one
// module. `FOUNDATION_01_CONTRACTS.md` §2 says a Hub "contains and governs
// modules", so once Module 09 joined, the container was being defined inside
// one of the things it contains, and Moderation had to import THIS FILE to
// reach it. `userHub` now lives in `hubs.ts` and is re-exported below.

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { HubDescriptor, ModuleManifest } from '../types'

/**
 * The User Hub — `01_ARCH` §2.2 (*"Users · Subscriptions · Devices · Sessions ·
 * Support · Moderation"*), id fixed by [`12_HUB_TAXONOMY.md`](../../../../docs/controller-v2/12_HUB_TAXONOMY.md)
 * §1 under Owner Decision G. The id is not this module's to choose.
 *
 * ORDER 5, not a renumbering. Taxonomy §1 lists User second, after Founder.
 * The shipped hubs sit at 0/10/20/30/40, so slotting in at 5 puts User in its
 * architected position while changing **no other hub's** navigation order — a
 * renumber would move four live surfaces to place one new one.
 *
 * PERMISSION SCOPE. FOUNDATION-01 §2: *"a Hub … owns a permission scope"*, and
 * `permissionScope` gates every module in the hub. `users.list.read` is the
 * honest gate for a hub about users: nobody who cannot see that a user exists
 * has business in it.
 *
 * ⚠️ MEASURED: a **no-op for the current registry** — the hub holds one module,
 * which requires the same permission, so no actor's access changes. That is the
 * same state Phase 4 measured for `tappy.hub.security` and recorded rather than
 * overstated. It becomes load-bearing when Moderation (09) and CRM (11) join.
 */
// Defined in `hubs.ts` since 2026-08-21 and re-exported here so existing
// importers are unaffected. It moved because Module 09 joined this hub and had
// to import the descriptor — from a MODULE file, which is the module → module
// dependency §1 rule 1 forbids.
export { userHub } from './hubs'
import { userHub } from './hubs'

/**
 * Module 08 — User Management.
 *
 * `permissions` declares what the module OWNS for registry purposes. It lists
 * `users.list.read` alone, and deliberately not the other seven `users.*`
 * permissions: C6 §5 makes permission ownership **exclusive across modules**,
 * so listing all eight here would claim them for this module and refuse any
 * future module — Moderation, CRM — that legitimately needs one. The list
 * entry is what the navigation gates on, and it is the permission that opens
 * the surface.
 *
 * The remaining seven are enforced where they have always been enforced: in the
 * API routes, through `requirePermission`, and for the two field gates through
 * `permissionEngine.can`. **This manifest adds no authorization path.**
 *
 * `data` is deliberately ABSENT (ADR-024): absence means the module owns no
 * tables. Whether Module 08 owns `account_status` — a table the consumer app
 * also reads through its own user-scoped client — is a real question, and
 * answering it inside a UI change would be smuggling.
 */
export const userManagementModule: ModuleManifest = {
  id: 'tappy.hub.user.management',
  name: 'User Management',
  version: '1.0.0',
  owner: 'platform',
  hub: userHub.id,
  capabilities: [],
  permissions: [PERMISSIONS.USERS_LIST_READ],
  dependencies: [],
  routes: ['/admin/users'],
  navigation: {
    // NOT the pre-existing `admin.nav.users` ("Người dùng" / "Users"): that is
    // the hub group's own wording, and a sidebar reading "Người dùng ▸ Người
    // dùng" tells an operator nothing about which surface they are opening.
    label: 'admin.nav.userManagement',
    icon: 'Users',
    order: 10,
    visibilityPermission: PERMISSIONS.USERS_LIST_READ,
  },
  lifecycle: 'stable',
  status: 'enabled',
  compatibility: { controller: '^1' },
}
