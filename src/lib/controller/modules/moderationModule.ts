import type { ModuleManifest } from '../types'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { userHub } from './userManagementModule'

// Module 09 Content Moderation — the manifest.
//
// HUB: `tappy.hub.user`, and that is not a choice made here. `12_HUB_TAXONOMY`
// §1 lists the User hub's scope as "Users · Subscriptions · Devices · Sessions
// · Support · Moderation" and places module 09 under it. The hub is already
// registered, so no taxonomy decision was needed or taken.
//
// PERMISSIONS: only `moderation.queue.read`. C6 §5 makes permission ownership
// exclusive per module, so a manifest declares the permission that GATES ITS
// SURFACE — the action permissions are enforced per-request by the resolve
// route, which picks the right one from `12_RBAC` §3 for the action asked for.
//
// DATA (ADR-024): this module owns the two moderation tables. It does NOT own
// `content_reports` or `music_track_reports` — those belong to the Content
// Safety Gate and the music module, and Module 09 only reads them through the
// ingestion function.

export const moderationModule: ModuleManifest = {
  id: 'tappy.hub.user.moderation',
  name: 'Content Moderation',
  version: '1.0.0',
  owner: 'platform',
  hub: userHub.id,
  capabilities: [],
  permissions: [PERMISSIONS.MODERATION_QUEUE_READ],
  dependencies: [],
  routes: ['/admin/moderation'],
  data: { tables: ['moderation_queue', 'moderation_actions'] },
  navigation: {
    label: 'admin.nav.moderation',
    icon: 'ShieldAlert',
    // After User Management (10) in the same hub: an operator reaches a report
    // about somebody after the people surface, not before it.
    order: 20,
    visibilityPermission: PERMISSIONS.MODERATION_QUEUE_READ,
  },
  lifecycle: 'stable',
  status: 'enabled',
  compatibility: { controller: '^1' },
}
