// Controller V2 — Navigation Provider (FOUNDATION-01 §13, FOUNDATION-02 STEP 8).
//
// Navigation is DERIVED from the registry — never a static array. It is
// permission-aware (via the Core's PDP delegation), deterministically ordered,
// hub-grouped, hides disabled/unavailable modules, and never emits a duplicate
// route. The legacy static NAV[] is NOT removed here; this provider is proven
// first (FOUNDATION-02 STEP 8: migrate safely before deleting legacy).

import type { Actor } from '@/lib/admin/rbac'
import type { ControllerCore } from './core'

export interface NavEntry {
  moduleId: string
  label: string
  icon?: string
  route: string
  order: number
}

export interface NavGroup {
  hubId: string
  label: string
  order: number
  items: NavEntry[]
}

/**
 * Build the navigation an actor should see, from the registry. Only
 * enabled+available modules the actor is authorized to see are included; empty
 * hub groups are dropped; routes are de-duplicated; order is deterministic.
 */
export function deriveNavigation(core: ControllerCore, actor: Actor | null, now?: number): NavGroup[] {
  const groups: NavGroup[] = []
  const seenRoutes = new Set<string>()

  for (const hub of core.listHubs()) {
    const items: NavEntry[] = []
    const modules = core
      .discover()
      .filter((m) => m.manifest.hub === hub.id)
      .sort((a, b) => a.manifest.navigation.order - b.manifest.navigation.order || a.manifest.id.localeCompare(b.manifest.id))

    for (const mod of modules) {
      if (!core.isModuleAccessible(mod.manifest.id, actor, now)) continue
      const route = mod.manifest.routes[0]
      if (!route || seenRoutes.has(route)) continue
      seenRoutes.add(route)
      items.push({
        moduleId: mod.manifest.id,
        label: mod.manifest.navigation.label,
        icon: mod.manifest.navigation.icon,
        route,
        order: mod.manifest.navigation.order,
      })
    }

    if (items.length > 0) {
      groups.push({ hubId: hub.id, label: hub.navigationGroup, order: hub.navigationOrder, items })
    }
  }

  return groups.sort((a, b) => a.order - b.order || a.hubId.localeCompare(b.hubId))
}
