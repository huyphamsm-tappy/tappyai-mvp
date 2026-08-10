// Controller V2 — department-aware navigation FILTERING (FOUNDATION-07C). Pure.
//
// A SECOND, composable filter on top of the existing PDP-derived navigation
// (deriveNavigation). It does NOT replace or re-implement navigation — it takes
// already-PDP-authorized NavGroups and removes modules the actor's department
// scope does not cover. There is still exactly ONE navigation authority; this is
// scope refinement, applied AFTER the PDP filter.
//
// Wired into the live AdminShell behind CONTROLLER_ORG_MEMBERSHIP_ENABLED
// (see admin/layout.tsx), applied after the PDP filter.
//
// Security note: hiding a module from nav is UX only. The server-side boundary
// for a direct URL or API request is the module's own PDP guard, and department
// membership is not an input to it. `authorizeDepartmentResource` in
// ./authorization.ts does implement department-scoped resource checks, but it
// has NO runtime caller — it is a separate, future capability, not an active
// boundary. See docs/controller-v2/FOUNDATION-10_RESOURCE_ENFORCEMENT_DECISION.md.

import type { NavGroup } from '../navigationProvider'
import { DEPARTMENTS, DEPARTMENT_IDS } from './departments'
import { anyScopeCovers } from './scope'
import type { DepartmentId, DepartmentMembership } from './types'

// Reverse map moduleId → owning department, built once from the registry. A
// module absent here is department-neutral (shared/global) and is never hidden
// by department scope — its PDP guard is its only gate.
const MODULE_OWNER: ReadonlyMap<string, DepartmentId> = (() => {
  const m = new Map<string, DepartmentId>()
  for (const id of DEPARTMENT_IDS) for (const mod of DEPARTMENTS[id].modules) m.set(mod, id)
  return m
})()

/** The department that owns a module, or null if the module is department-neutral. */
export function moduleDepartment(moduleId: string): DepartmentId | null {
  return MODULE_OWNER.get(moduleId) ?? null
}

/**
 * Whether an actor may SEE a module given their department memberships.
 * Department-neutral modules → always visible (PDP already gated them). Owner →
 * GLOBAL. Otherwise the actor needs an active membership whose scope covers the
 * owning department.
 */
export function isModuleVisibleForDepartment(
  moduleId: string,
  ctx: { isOwner: boolean; memberships: readonly DepartmentMembership[] }
): boolean {
  const owner = moduleDepartment(moduleId)
  if (!owner) return true
  if (ctx.isOwner) return true
  const scopes = ctx.memberships.filter((m) => m.status === 'active').map((m) => m.scope)
  return anyScopeCovers(scopes, owner)
}

/**
 * Refine PDP-derived nav groups by department scope: drop items the actor's
 * scope does not cover, then drop any group left empty. Owner keeps everything.
 */
export function filterNavByDepartment(
  groups: readonly NavGroup[],
  ctx: { isOwner: boolean; memberships: readonly DepartmentMembership[] }
): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => isModuleVisibleForDepartment(i.moduleId, ctx)) }))
    .filter((g) => g.items.length > 0)
}
