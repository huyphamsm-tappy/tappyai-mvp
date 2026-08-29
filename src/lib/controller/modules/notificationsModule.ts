import type { ModuleManifest } from '../types'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'

// Controller Notifications — the manifest (Phase A foundation).
//
// HUB: `tappy.hub.founder`, and NOT `tappy.hub.user` — which is where this
// module was first placed, wrongly.
//
// 🚨 A HUB CAN GATE ITS MODULES. `userHub` declares
// `permissionScope: users.list.read` (moderator and up), and FOUNDATION-01 §2
// makes a hub GOVERN every module inside it — including modules with a weaker
// `visibilityPermission` of their own. Placing Notifications there would have
// meant an analyst could never see it, silently voiding the Owner's explicit
// grant of `notifications.history.read` to analyst. The grant would have
// existed in the registry and been unreachable in the product.
//
// `founderHub` declares no scope, so the Owner's role matrix holds exactly as
// written. Only `tappy.hub.user` and `tappy.hub.security` declare scopes today.
//
// ⚠️ The hub choice is a presentation decision and is flagged for Owner
// confirmation: "Notifications" under Điều hành / Founder reads as an
// operations tool, which is what it is.
//
// The hub id is a LITERAL here rather than `founderHub.id`: `founderHub` lives
// in `registry/adminModules`, which imports this file, and importing it back
// would be a cycle that leaves the binding in TDZ at module-evaluation time.
// `notificationFoundation.test.ts` asserts this literal equals `founderHub.id`,
// so the two cannot drift apart silently.
//
// PERMISSIONS: the manifest declares the permission that GATES ITS SURFACE, per
// C6 §5, and that is `notifications.history.read` — the LOWEST of the three, on
// purpose. An analyst may open the page and read what was sent; only admin+ may
// compose a targeted send, and only super_admin may broadcast. Gating the
// surface on `send.user` instead would hide the history from the very roles the
// Owner granted it to.
//
// ⚠️ THE SURFACE PERMISSION IS NOT THE ACTION PERMISSION. Opening this page
// authorizes nothing beyond reading. Phase B's send route will enforce
// `notifications.send.user` per request, independently of this manifest and
// independently of whether the nav entry was ever rendered — navigation
// visibility has never been authorization here.
//
// DATA: none owned. The notification tables belong to the existing notification
// system, whose single writer is `emitNotification` (ADR-014). This module reads
// through that system and will never become a second writer.
//
// ⚠️ Phase A is a SHELL. There is no send route, no recipient picker, and no
// call to any push provider. The `notifications.send.*` permissions exist so the
// authorization model is settled and testable before any code can send anything.

export const notificationsModule: ModuleManifest = {
  id: 'tappy.hub.founder.notifications',
  name: 'Notifications',
  version: '1.0.0',
  owner: 'platform',
  hub: 'tappy.hub.founder',
  capabilities: [],
  permissions: [PERMISSIONS.NOTIFICATIONS_HISTORY_READ],
  dependencies: [],
  routes: ['/admin/notifications'],
  navigation: {
    label: 'admin.nav.notifications',
    icon: 'Bell',
    // After Home (0) in the Founder hub. Nothing was renumbered.
    order: 10,
    visibilityPermission: PERMISSIONS.NOTIFICATIONS_HISTORY_READ,
  },
  lifecycle: 'stable',
  status: 'enabled',
  compatibility: { controller: '^1' },
}
