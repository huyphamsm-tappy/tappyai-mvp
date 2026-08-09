// Controller V2 — pure department-context derivation (FOUNDATION-08).
//
// The SINGLE place that turns (isOwner, memberships) into the scope facts the
// Home/nav/switcher render from. Pure + fail-closed, so data isolation is unit-
// testable and mutation-provable. It creates no authorization authority: the PDP
// and the department authorization layer remain the deciders; this only shapes
// what an already-authorized actor may SEE.

import { DEPARTMENTS, DEPARTMENT_IDS } from './departments'
import type {
  DepartmentContext,
  DepartmentId,
  DepartmentMembership,
  HomeDepartmentSummary,
  HomeMode,
} from './types'

/** Build the actor's department context. Owner → global + all owned modules. */
export function buildDepartmentContext(
  isOwner: boolean,
  memberships: readonly DepartmentMembership[]
): DepartmentContext {
  const active = memberships.filter((m) => m.status === 'active')
  const departmentIds = [...new Set(active.map((m) => m.departmentId))]
  const ownedDepartments: DepartmentId[] = isOwner ? DEPARTMENT_IDS : departmentIds
  const allowedModules = [...new Set(ownedDepartments.flatMap((d) => DEPARTMENTS[d].modules))]
  return { isOwner, scope: { isGlobal: isOwner, departmentIds }, memberships: active, allowedModules }
}

/** The Home experience for this context. */
export function homeMode(ctx: DepartmentContext): HomeMode {
  if (ctx.isOwner) return 'owner'
  return ctx.memberships.length > 0 ? 'department' : 'none'
}

/**
 * Departments the actor may SEE in the switcher / grid. THE isolation boundary
 * for Home rendering: the Ultimate Owner sees all 15; everyone else sees ONLY
 * their own active-membership departments — never another department.
 */
export function authorizedScopes(ctx: DepartmentContext): DepartmentId[] {
  if (ctx.isOwner) return [...DEPARTMENT_IDS]
  return [...new Set(ctx.memberships.filter((m) => m.status === 'active').map((m) => m.departmentId))]
}

/** True iff the actor may view a specific department (server-side isolation check). */
export function canViewDepartment(ctx: DepartmentContext, departmentId: DepartmentId): boolean {
  return authorizedScopes(ctx).includes(departmentId)
}

/**
 * Registry-derived summaries for the departments the actor may see. Owner → all
 * 15 (enterprise grid); department user → only their departments. moduleCount is
 * the real registry-owned module count, not a fabricated metric.
 */
export function departmentSummaries(ctx: DepartmentContext): HomeDepartmentSummary[] {
  return authorizedScopes(ctx).map((id) => ({
    id,
    nameKey: DEPARTMENTS[id].name,
    status: DEPARTMENTS[id].status,
    moduleCount: DEPARTMENTS[id].modules.length,
    inScope: true,
  }))
}
