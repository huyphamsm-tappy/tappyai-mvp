// Controller V2 — the SINGLE navigation authority for /admin (FOUNDATION-03).
//
// Replaces the legacy static NAV[] + visibleNavItems(). The admin layout calls
// this with the resolved Actor; navigation is derived from the Module/Hub
// registry and filtered through the existing PDP. Output is fully serializable
// (strings/numbers) so it crosses the server→client boundary into AdminShell.

import type { Actor } from '@/lib/admin/rbac'
import { buildAdminController } from './registry/adminModules'
import { deriveNavigation } from './navigationProvider'
import type { NavGroup } from './navigationProvider'

export type { NavGroup, NavEntry } from './navigationProvider'

/**
 * Registry-derived navigation groups the actor may see, hub-grouped and
 * deterministically ordered. A fresh controller is built per call (registration
 * is pure/in-memory); nav derivation is read-only.
 */
export function resolveAdminNavigation(actor: Actor | null): NavGroup[] {
  const core = buildAdminController()
  return deriveNavigation(core, actor)
}
