// Controller V2 — department-scoped authorization (composition over the ONE PDP).
//
// This is NOT a second permission engine. It calls the canonical
// `permissionEngine.authorize` for the PERMISSION decision, then applies a
// department SCOPE / OWNERSHIP / cross-department ACCESS gate that can only
// FURTHER RESTRICT — it never grants a permission the PDP denied. Ownership and
// access are modelled separately (data ownership ≠ data access).
//
// Decision order (each step fail-closed):
//   0. Unknown department            → DENY (UNKNOWN_DEPARTMENT)
//   1. PDP denies the permission      → DENY (PERMISSION_DENIED)  [the one authority]
//   2. Ultimate Owner (Actor.isOwner) → ALLOW (ULTIMATE_OWNER / GLOBAL)
//   3. No active membership           → DENY (NO_MEMBERSHIP)      [auth ≠ authz]
//   4. A membership scope covers the resource's owner department → ALLOW (OWNED_SCOPE)
//   5. An explicit cross-department grant covers it → ALLOW (CROSS_DEPARTMENT_ACCESS)
//   6. otherwise                      → DENY (SCOPE_DENIED)

import { permissionEngine } from '@/lib/admin/permissions/engine'
import type { Actor } from '@/lib/admin/rbac'
import type { Decision, PermissionId } from '@/lib/admin/permissions/types'
import { CROSS_DEPARTMENT_ACCESS, getDepartment } from './departments'
import { anyScopeCovers } from './scope'
import type { DepartmentMembership, DepartmentResource, OrgDecision } from './types'

type AuthorizeFn = (actor: Actor | null, permission: PermissionId, now?: number) => Decision

export function authorizeDepartmentResource(
  actor: Actor | null,
  memberships: readonly DepartmentMembership[],
  resource: DepartmentResource,
  opts: { authorize?: AuthorizeFn; now?: number } = {}
): OrgDecision {
  const authorize = opts.authorize ?? ((a, p, n) => permissionEngine.authorize(a, p, n))

  // 0. Unknown department — fail closed.
  if (!getDepartment(resource.ownerDepartment)) {
    return { allowed: false, reason: 'UNKNOWN_DEPARTMENT', detail: resource.ownerDepartment }
  }

  // 1. The canonical PDP is the permission authority. If it denies, we deny —
  //    the scope gate can never grant what the PDP withheld.
  const pdp = authorize(actor, resource.permission, opts.now)
  if (!pdp.allowed) {
    return { allowed: false, reason: 'PERMISSION_DENIED', detail: pdp.reason }
  }

  // 2. Ultimate Owner has GLOBAL scope.
  if (actor?.isOwner) return { allowed: true, reason: 'ULTIMATE_OWNER' }

  // 3. Authentication is not authorization: a Controller identity with no active
  //    department membership reaches no department resource.
  const active = memberships.filter((m) => m.status === 'active')
  if (active.length === 0) return { allowed: false, reason: 'NO_MEMBERSHIP' }

  // 4. Owned / in-scope.
  if (anyScopeCovers(active.map((m) => m.scope), resource.ownerDepartment)) {
    return { allowed: true, reason: 'OWNED_SCOPE' }
  }

  // 5. Governed cross-department access (read/analyze) — access, never ownership.
  const hasCross = active.some((m) =>
    CROSS_DEPARTMENT_ACCESS.some(
      (g) =>
        g.fromDepartment === m.departmentId &&
        g.toDepartment === resource.ownerDepartment &&
        g.permissions.includes(resource.permission)
    )
  )
  if (hasCross) return { allowed: true, reason: 'CROSS_DEPARTMENT_ACCESS' }

  // 6. Fail closed.
  return { allowed: false, reason: 'SCOPE_DENIED', detail: resource.ownerDepartment }
}

/** Department ids an actor may see in navigation (Owner → all; else their memberships). Foundation for department-aware nav. */
export function visibleDepartmentIds(actor: Actor | null, memberships: readonly DepartmentMembership[]): string[] {
  if (actor?.isOwner) return ['GLOBAL']
  return [...new Set(memberships.filter((m) => m.status === 'active').map((m) => m.departmentId))]
}
