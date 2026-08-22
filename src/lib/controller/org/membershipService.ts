// Controller V2 — Department Membership management SERVICE (FOUNDATION-07C).
//
// The authoritative, server-side enforcement for mutating department memberships.
// It is a COMPOSITION over the existing authorities — it creates no new engine:
//
//   authenticated actor                     (caller resolves identity)
//     AND  canonical PDP permission          (permissionEngine — the ONE PDP)
//     AND  department authority               (canDelegate / canAdministerDepartment)
//     AND  target/membership constraints      (fail-closed)
//     THEN persist                            (MembershipRepository port)
//     THEN audit                              (writeAuditLog — the ONE audit writer)
//
// Every failure is fail-closed and (for sensitive ops) audited. The scope layer
// can only RESTRICT: it never grants a permission the PDP denied. The Ultimate
// Owner is never represented as a membership; canDelegate refuses ULTIMATE_OWNER
// and refuses modifying the owner, mirroring the DB CHECK.
//
// PDP GATE (FOUNDATION-07D): membership mutation is gated on the DEDICATED
// permission `security.membership.manage` (reads: `security.membership.read`) — a
// distinct capability from `security.roles.*`, so administering department
// memberships does not inherit platform-wide RBAC-granting semantics. Held by
// super_admin (Owner via bypass) today; extending it to a lower role is a
// deferred OWNER DECISION. The department AUTHORITY gate (canDelegate) is the
// second, department-scoped restriction.

import { permissionEngine } from '@/lib/admin/permissions/engine'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { Actor } from '@/lib/admin/rbac'
import type { Decision, PermissionId } from '@/lib/admin/permissions/types'
import { writeAuditLog, type AuditParams } from '@/lib/admin/audit'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { canAdministerDepartment, canDelegate, type DelegationRequest } from './delegation'
import { getDepartment } from './departments'
import type { MembershipRepository } from './membershipRepository'
import type { DepartmentId, DepartmentMembership, OrgScope } from './types'

type AuthorizeFn = (actor: Actor | null, permission: PermissionId, now?: number) => Decision
type AuditSink = (params: AuditParams) => void

export interface MembershipServiceDeps {
  repo: MembershipRepository
  /** Defaults to the canonical PDP. Never mock this in security tests. */
  authorize?: AuthorizeFn
  /** Defaults to the canonical audit writer. */
  audit?: AuditSink
  req?: Request
}

export type MembershipDenyReason =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED' // the canonical PDP denied the gating permission
  | 'UNKNOWN_DEPARTMENT'
  | 'NOT_DEPARTMENT_ADMIN'
  | 'CANNOT_MODIFY_OWNER'
  | 'CANNOT_SELF_GRANT'
  | 'OWNER_IS_SINGULAR'
  | 'CANNOT_CREATE_PEER_OR_HIGHER'
  | 'SCOPE_ESCALATION'
  | 'NOT_FOUND'

export type MembershipResult =
  | { ok: true; membership: DepartmentMembership }
  | { ok: false; reason: MembershipDenyReason }

// Dedicated department-membership permissions (canonical PDP registry).
const MANAGE = PERMISSIONS.SECURITY_MEMBERSHIP_MANAGE
const READ = PERMISSIONS.SECURITY_MEMBERSHIP_READ

function pdp(deps: MembershipServiceDeps): AuthorizeFn {
  return deps.authorize ?? ((a, p, n) => permissionEngine.authorize(a, p, n))
}

function emit(deps: MembershipServiceDeps, actor: Actor, params: Omit<AuditParams, 'actorId' | 'actorEmail' | 'actorRole' | 'req'>): void {
  const sink = deps.audit ?? writeAuditLog
  sink({
    actorId: actor.userId,
    actorEmail: actor.email ?? '—',
    actorRole: auditActorRole(actor),
    req: deps.req,
    ...params,
  })
}

/**
 * Assign a department membership (Department Head / Manager / Employee).
 * Owner assigns anywhere (within the bounds canDelegate enforces); a Department
 * Head assigns only Manager/Employee within their own department.
 */
export async function assignMembership(
  actor: Actor | null,
  request: DelegationRequest,
  deps: MembershipServiceDeps
): Promise<MembershipResult> {
  if (!actor) return deny(deps, null, 'org.membership.assign', request.targetUserId, 'UNAUTHENTICATED')

  // 1. Canonical PDP — the ONE permission authority. Fail-closed on denial.
  if (!pdp(deps)(actor, MANAGE).allowed) {
    return deny(deps, actor, 'org.membership.assign', request.targetUserId, 'PERMISSION_DENIED', request)
  }

  // 2. Department authority + escalation guards (own department only, no
  //    self-grant, no peer/owner creation, scope must equal the department).
  const actorMemberships = await deps.repo.activeForUser(actor.userId)
  const decision = canDelegate({ userId: actor.userId, isOwner: actor.isOwner }, actorMemberships, request)
  if (!decision.allowed) {
    return deny(deps, actor, 'org.membership.assign', request.targetUserId, decision.reason, request)
  }

  // 3. Persist (active) + audit success.
  const membership: DepartmentMembership = {
    userId: request.targetUserId,
    departmentId: request.targetDepartment,
    orgRole: request.targetOrgRole,
    scope: request.targetScope,
    status: 'active',
  }
  await deps.repo.put(membership)
  emit(deps, actor, {
    action: 'org.membership_assigned',
    targetType: 'user',
    targetId: request.targetUserId,
    afterState: { departmentId: membership.departmentId, orgRole: membership.orgRole, scope: membership.scope, status: 'active' },
    metadata: { by_owner: actor.isOwner, authority: decision.reason },
  })
  return { ok: true, membership }
}

/** Suspend or reactivate a membership. Requires department admin authority. */
export async function setMembershipStatus(
  actor: Actor | null,
  target: { targetUserId: string; targetIsOwner?: boolean; departmentId: DepartmentId; status: 'active' | 'suspended' },
  deps: MembershipServiceDeps
): Promise<MembershipResult> {
  const action = target.status === 'suspended' ? 'org.membership_suspended' : 'org.membership_reactivated'
  const guard = await authorizeManage(actor, target, deps, action)
  if (!guard.ok) return guard
  const existing = guard.existing

  await deps.repo.setStatus(target.targetUserId, target.departmentId, target.status)
  const updated: DepartmentMembership = { ...existing, status: target.status }
  emit(deps, actor as Actor, {
    action,
    targetType: 'user',
    targetId: target.targetUserId,
    beforeState: { status: existing.status },
    afterState: { status: target.status, departmentId: target.departmentId },
  })
  return { ok: true, membership: updated }
}

/** Remove a membership. Requires department admin authority. */
export async function removeMembership(
  actor: Actor | null,
  target: { targetUserId: string; targetIsOwner?: boolean; departmentId: DepartmentId },
  deps: MembershipServiceDeps
): Promise<MembershipResult> {
  const guard = await authorizeManage(actor, target, deps, 'org.membership_removed')
  if (!guard.ok) return guard
  const existing = guard.existing

  await deps.repo.remove(target.targetUserId, target.departmentId)
  emit(deps, actor as Actor, {
    action: 'org.membership_removed',
    targetType: 'user',
    targetId: target.targetUserId,
    beforeState: { departmentId: existing.departmentId, orgRole: existing.orgRole, status: existing.status },
  })
  return { ok: true, membership: existing }
}

// ── Shared authority gate for status/remove (existing membership required) ────
async function authorizeManage(
  actor: Actor | null,
  target: { targetUserId: string; targetIsOwner?: boolean; departmentId: DepartmentId },
  deps: MembershipServiceDeps,
  action: string
): Promise<{ ok: true; existing: DepartmentMembership } | { ok: false; reason: MembershipDenyReason }> {
  if (!actor) { deny(deps, null, action, target.targetUserId, 'UNAUTHENTICATED'); return { ok: false, reason: 'UNAUTHENTICATED' } }

  if (!pdp(deps)(actor, MANAGE).allowed) {
    deny(deps, actor, action, target.targetUserId, 'PERMISSION_DENIED')
    return { ok: false, reason: 'PERMISSION_DENIED' }
  }
  if (!getDepartment(target.departmentId)) {
    deny(deps, actor, action, target.targetUserId, 'UNKNOWN_DEPARTMENT')
    return { ok: false, reason: 'UNKNOWN_DEPARTMENT' }
  }
  // Never modify the Ultimate Owner via the org layer.
  if (target.targetIsOwner) {
    deny(deps, actor, action, target.targetUserId, 'CANNOT_MODIFY_OWNER')
    return { ok: false, reason: 'CANNOT_MODIFY_OWNER' }
  }
  // Department authority: Owner, or an active Head of THIS department.
  const actorMemberships = await deps.repo.activeForUser(actor.userId)
  if (!canAdministerDepartment({ isOwner: actor.isOwner }, actorMemberships, target.departmentId)) {
    deny(deps, actor, action, target.targetUserId, 'NOT_DEPARTMENT_ADMIN')
    return { ok: false, reason: 'NOT_DEPARTMENT_ADMIN' }
  }
  const existing = await deps.repo.find(target.targetUserId, target.departmentId)
  if (!existing) {
    deny(deps, actor, action, target.targetUserId, 'NOT_FOUND')
    return { ok: false, reason: 'NOT_FOUND' }
  }
  return { ok: true, existing }
}

/**
 * The department ROSTER — every active membership, across all departments.
 *
 * Owner Decision D6 (2026-08-22) authorized `/admin/org/memberships`, and this
 * is the read behind it. FOUNDATION-10B left the read unexposed because
 * "F-10 does not require it, and adding CRUD 'for completeness' would widen the
 * surface without a consumer". There is now a consumer, and this exists for it
 * alone.
 *
 * IT ADDS NO AUTHORIZATION PATH. `security.membership.read` has existed since
 * F-07D with `defaultRoles: ['super_admin']`; it was defined and never used.
 * The gate is the canonical PDP, exactly as every other read in this service.
 *
 * AUDITED, on both outcomes. Who belongs to which department is org structure —
 * C11 audits `session.listed`, Module 08 `user.notes_listed`, Module 09
 * `moderation.queue_listed`, all for the same reason. The metadata carries a
 * COUNT and never the rows: `audit.log.read` is admin+, a wider population than
 * this permission's super_admin, so copying the roster into the audit trail
 * would hand the org chart to everyone who can read it.
 */
export async function listDepartmentRoster(
  actor: Actor | null,
  deps: MembershipServiceDeps
): Promise<{ ok: true; memberships: readonly DepartmentMembership[] } | { ok: false; reason: MembershipDenyReason }> {
  const action = 'org.membership_listed'
  if (!actor) return { ok: false, reason: 'UNAUTHENTICATED' }
  if (!pdp(deps)(actor, READ).allowed) {
    // Denied BEFORE the repository is touched. A denial that still ran the
    // query would leak through timing and put org data on the return path.
    deny(deps, actor, action, actor.userId, 'PERMISSION_DENIED')
    return { ok: false, reason: 'PERMISSION_DENIED' }
  }
  const memberships = await deps.repo.listAllActive()
  emit(deps, actor, {
    action,
    targetType: 'department_membership',
    targetId: 'all',
    metadata: { returned: memberships.length },
  })
  return { ok: true, memberships }
}

/** Read the memberships of a user — gated on the canonical read permission. */
export async function listMemberships(
  actor: Actor | null,
  userId: string,
  deps: MembershipServiceDeps
): Promise<{ ok: true; memberships: readonly DepartmentMembership[] } | { ok: false; reason: MembershipDenyReason }> {
  if (!actor) return { ok: false, reason: 'UNAUTHENTICATED' }
  if (!pdp(deps)(actor, READ).allowed) return { ok: false, reason: 'PERMISSION_DENIED' }
  const memberships = await deps.repo.activeForUser(userId)
  return { ok: true, memberships }
}

// Audit a denial of a sensitive operation, then return the failure result.
function deny(
  deps: MembershipServiceDeps,
  actor: Actor | null,
  action: string,
  targetId: string,
  reason: MembershipDenyReason,
  request?: DelegationRequest
): { ok: false; reason: MembershipDenyReason } {
  if (actor) {
    emit(deps, actor, {
      action: `${action}.denied`,
      targetType: 'user',
      targetId,
      metadata: { reason, request: request ? { department: request.targetDepartment, orgRole: request.targetOrgRole, scope: request.targetScope } : undefined },
    })
  }
  return { ok: false, reason }
}

// Re-export for callers assembling a request.
export type { DelegationRequest, OrgScope }
