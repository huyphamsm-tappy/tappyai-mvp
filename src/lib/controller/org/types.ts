// Controller V2 — Organization / Department foundation types.
//
// The organizational skeleton for all 15 departments. This layer adds the
// DEPARTMENT + SCOPE + OWNERSHIP/ACCESS dimensions AROUND the existing canonical
// PDP — it never replaces it. Authorization = PDP permission decision (unchanged)
// AND a scope/ownership gate that can only FURTHER RESTRICT, never grant.
// Pure module: no DB, no engine mutation, no server imports.

import type { PermissionId } from '@/lib/admin/permissions/types'

// The 15 owner-approved departments. Stable identity keys (data, never branched
// into authorization logic).
export type DepartmentId =
  | 'executive' | 'product' | 'engineering' | 'ai_data' | 'security'
  | 'finance' | 'business_development' | 'marketing' | 'commerce' | 'support'
  | 'legal' | 'hr' | 'content' | 'qa' | 'it'

/** Scope of authority. GLOBAL = the Ultimate Owner's reach; otherwise one department. */
export type OrgScope = 'GLOBAL' | DepartmentId

/** Organizational POSITION (distinct from PDP admin roles, which grant permissions). */
export type OrgRole = 'ULTIMATE_OWNER' | 'DEPARTMENT_HEAD' | 'DEPARTMENT_MANAGER' | 'EMPLOYEE'

export type DepartmentStatus = 'defined' | 'placeholder'
export type AccessMode = 'read' | 'analyze'

/**
 * A governed cross-department access grant. Ownership does NOT transfer: it lets
 * `fromDepartment` READ/ANALYZE resources OWNED by `toDepartment` for a bounded
 * set of permissions.
 */
export interface CrossDepartmentAccess {
  fromDepartment: DepartmentId
  toDepartment: DepartmentId
  mode: AccessMode
  permissions: readonly PermissionId[]
}

/**
 * A department in the registry. Business fields (modules/ownedPermissions) are
 * EMPTY for placeholder departments — architectural identity only, no invented
 * responsibilities.
 */
export interface Department {
  id: DepartmentId
  name: string          // i18n key
  displayName: string   // human default (English)
  status: DepartmentStatus
  /** Permissions whose RESOURCES this department owns (empty for placeholders). */
  ownedPermissions: readonly PermissionId[]
  /** Controller module ids surfaced to this department (empty for placeholders). */
  modules: readonly string[]
  notes?: string
}

/** A user's membership in a department, with organizational position + scope. */
export interface DepartmentMembership {
  userId: string
  departmentId: DepartmentId
  orgRole: OrgRole
  scope: OrgScope
  status: 'active' | 'suspended'
}

/** The thing being accessed: a resource owned by a department, gated by a permission. */
export interface DepartmentResource {
  ownerDepartment: DepartmentId
  permission: PermissionId
}

/**
 * An actor's resolved department context for scope-aware UI (FOUNDATION-07D).
 * GENERIC — carries authorization metadata only, never department-specific
 * business logic. `isGlobal` is the Ultimate Owner's reach; `allowedModules` are
 * the department-owned module ids the actor's scope covers (a business widget
 * must still enforce its own PDP permission server-side).
 */
export interface DepartmentContext {
  isOwner: boolean
  scope: { isGlobal: boolean; departmentIds: DepartmentId[] }
  memberships: readonly DepartmentMembership[]
  allowedModules: string[]
}

/**
 * Which Controller Home experience an actor receives (FOUNDATION-08):
 *   owner      → enterprise command center (all 15 departments)
 *   department → scoped workspace (only the actor's departments)
 *   none       → authenticated but no department workspace
 */
export type HomeMode = 'owner' | 'department' | 'none'

/** A department as summarised on the Home — registry-derived, never fabricated. */
export interface HomeDepartmentSummary {
  id: DepartmentId
  nameKey: string
  status: DepartmentStatus
  /** Count of Controller modules this department OWNS in the registry (real, not a KPI). */
  moduleCount: number
  /** The actor's scope covers this department. */
  inScope: boolean
}

export type OrgDenyReason =
  | 'NO_MEMBERSHIP'
  | 'PERMISSION_DENIED'    // the canonical PDP denied the permission
  | 'SCOPE_DENIED'         // permission ok, but out of the actor's department scope
  | 'UNKNOWN_DEPARTMENT'
  | 'MEMBERSHIP_SUSPENDED'

export type OrgAllowReason =
  | 'ULTIMATE_OWNER'       // GLOBAL — from platform_owner (Actor.isOwner)
  | 'OWNED_SCOPE'          // actor's department owns / covers the resource
  | 'CROSS_DEPARTMENT_ACCESS' // explicit governed read/analyze grant

export type OrgDecision =
  | { allowed: true; reason: OrgAllowReason }
  | { allowed: false; reason: OrgDenyReason; detail?: string }
