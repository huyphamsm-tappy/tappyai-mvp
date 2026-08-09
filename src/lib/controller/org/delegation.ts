// Controller V2 — Department Head delegation BOUNDARY (FOUNDATION-06). Pure.
//
// Hierarchy:  Ultimate Owner → Department Head → Department Manager → Employee
//
// This module answers ONE question — "may this actor assign this membership?" —
// and only encodes the BOUNDARY. It is not an approval workflow: the formal
// request/approve/audit flow is explicitly DEFERRED (no email approvals invented
// in this phase). It grants nothing on its own and never calls the PDP; the PDP
// still independently authorizes the underlying management permission at the
// call site. Composition, not a second engine.
//
// Boundaries (each fail-closed):
//   • The Ultimate Owner is singular and DB-enforced (platform_owner) — you never
//     mint one through a department membership. Assigning ULTIMATE_OWNER is always
//     refused, even for the owner.
//   • A Department Head administers ONLY their own department (scope must cover it).
//   • A Head may assign DEPARTMENT_MANAGER or EMPLOYEE — never a peer Head or higher.
//   • The assigned scope must be the same department — never GLOBAL, never another.
//   • No one may modify the Ultimate Owner via delegation.
//   • No one may grant authority to themselves.

import type { DepartmentId, DepartmentMembership, OrgRole, OrgScope } from './types'
import { getDepartment } from './departments'
import { anyScopeCovers } from './scope'

export interface DelegationRequest {
  /** Who the membership is being assigned to. */
  targetUserId: string
  /** Whether the target user is the Ultimate Owner (from platform_owner — never inferred from email). */
  targetIsOwner?: boolean
  targetDepartment: DepartmentId
  targetOrgRole: OrgRole
  targetScope: OrgScope
}

export type DelegationDenyReason =
  | 'UNKNOWN_DEPARTMENT'
  | 'OWNER_IS_SINGULAR'      // ULTIMATE_OWNER is never assigned via membership
  | 'CANNOT_MODIFY_OWNER'    // the target is the Ultimate Owner
  | 'CANNOT_SELF_GRANT'      // actor === target
  | 'NOT_DEPARTMENT_ADMIN'   // actor is not a Head of the target department
  | 'CANNOT_CREATE_PEER_OR_HIGHER' // a Head cannot mint a Head/Owner
  | 'SCOPE_ESCALATION'       // assigned scope is not exactly the target department

export type DelegationDecision =
  | { allowed: true; reason: 'ULTIMATE_OWNER' | 'DEPARTMENT_HEAD' }
  | { allowed: false; reason: DelegationDenyReason }

/** Roles a Department Head is permitted to assign — strictly below Head. */
const HEAD_ASSIGNABLE: readonly OrgRole[] = ['DEPARTMENT_MANAGER', 'EMPLOYEE']

/**
 * True if the actor may administer `department`: the Ultimate Owner always may;
 * otherwise the actor must hold an ACTIVE DEPARTMENT_HEAD membership whose scope
 * covers that department.
 */
export function canAdministerDepartment(
  actor: { isOwner: boolean },
  actorMemberships: readonly DepartmentMembership[],
  department: DepartmentId
): boolean {
  if (actor.isOwner) return true
  const headScopes = actorMemberships
    .filter((m) => m.status === 'active' && m.orgRole === 'DEPARTMENT_HEAD')
    .map((m) => m.scope)
  return anyScopeCovers(headScopes, department)
}

/** Decide whether `actor` may assign the membership described by `request`. */
export function canDelegate(
  actor: { userId: string; isOwner: boolean },
  actorMemberships: readonly DepartmentMembership[],
  request: DelegationRequest
): DelegationDecision {
  // Fail closed on an unknown department.
  if (!getDepartment(request.targetDepartment)) {
    return { allowed: false, reason: 'UNKNOWN_DEPARTMENT' }
  }

  // The Ultimate Owner is singular and DB-enforced; never minted via membership.
  if (request.targetOrgRole === 'ULTIMATE_OWNER') {
    return { allowed: false, reason: 'OWNER_IS_SINGULAR' }
  }

  // Never modify the Ultimate Owner through delegation.
  if (request.targetIsOwner) {
    return { allowed: false, reason: 'CANNOT_MODIFY_OWNER' }
  }

  // No self-grant — you cannot hand yourself authority.
  if (request.targetUserId === actor.userId) {
    return { allowed: false, reason: 'CANNOT_SELF_GRANT' }
  }

  // The assigned scope must be exactly the target department (no GLOBAL, no
  // foreign department). This is the scope-escalation guard.
  if (request.targetScope !== request.targetDepartment) {
    return { allowed: false, reason: 'SCOPE_ESCALATION' }
  }

  // The Ultimate Owner may assign within these bounds anywhere.
  if (actor.isOwner) return { allowed: true, reason: 'ULTIMATE_OWNER' }

  // Otherwise the actor must be a Head of the target department.
  if (!canAdministerDepartment(actor, actorMemberships, request.targetDepartment)) {
    return { allowed: false, reason: 'NOT_DEPARTMENT_ADMIN' }
  }

  // A Head may assign only strictly-below roles — never a peer Head.
  if (!HEAD_ASSIGNABLE.includes(request.targetOrgRole)) {
    return { allowed: false, reason: 'CANNOT_CREATE_PEER_OR_HIGHER' }
  }

  return { allowed: true, reason: 'DEPARTMENT_HEAD' }
}
