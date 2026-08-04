// Controller V2 — Component 3 (RBAC): core permission types.
//
// Client-safe: pure types and pure functions only. NO server imports, so UI
// components may import from here without pulling `next/headers` into the
// client bundle (the boundary established by roles.ts in Component 2).

import type { AdminRole } from '@/lib/admin/roles'
import type { CapabilityId } from '@/lib/admin/capabilities'

/**
 * Permission identifier: `<module>.<resource>.<action>`.
 *
 * Widened to `string` at the type level, but a permission that is not declared
 * in the registry is REJECTED at runtime (`UNKNOWN_PERMISSION`) — the registry,
 * not this type, is the source of truth. Handlers must reference registry
 * constants, never string literals; the architecture guard enforces that.
 */
export type PermissionId = string

/** How much damage misuse of this permission could do. Drives review and alerting. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** Broad grouping for UI and reporting. Not used in authorization decisions. */
export type PermissionCategory = 'read' | 'write' | 'destructive' | 'security'

/**
 * A permission as a first-class object. Every field is required except
 * `deprecated`, so a new entry cannot be added without stating its risk,
 * its module, and who gets it by default.
 */
export interface PermissionDefinition {
  /** `<module>.<resource>.<action>` — immutable once shipped. */
  id: PermissionId
  /** Short human label for admin UI. */
  displayName: string
  /** What holding this permission actually allows. Written for a reviewer. */
  description: string
  /** Owning module. One module owns each permission. */
  module: string
  /**
   * Capability this permission belongs to.
   *
   * ⚠️ METADATA ONLY until the Capability Registry ships (Component 5).
   * Nothing may gate on it today — see `capabilityGateEnabled` in authorize.ts.
   */
  capability: CapabilityId
  category: PermissionCategory
  riskLevel: RiskLevel
  /**
   * Roles that receive this permission by default. This is the ONLY place a
   * role→permission edge is declared; roleMap.ts derives the mapping from it,
   * so the two can never disagree.
   *
   * `owner` is deliberately not a valid value — the Platform Owner is outside
   * RBAC entirely and bypasses this pipeline.
   */
  defaultRoles: readonly AdminRole[]
  /**
   * Set when a permission is on its way out. Deprecated permissions still
   * resolve and still authorize — removing them silently would be a security
   * regression — but they are reported so callers can be migrated.
   */
  deprecated?: {
    since: string
    reason: string
    replacedBy?: PermissionId
  }
}

/** Why an authorization decision came out the way it did. Every denial names one. */
export type DenyReason =
  | 'UNAUTHENTICATED'
  | 'UNKNOWN_PERMISSION'
  | 'NO_GRANT'
  | 'CAPABILITY_UNAVAILABLE'

/** Why an authorization decision was allowed. Owner bypass is distinguishable. */
export type AllowReason = 'OWNER_BYPASS' | 'ROLE_GRANT'

export type Decision =
  | { allowed: true; reason: AllowReason; permission: PermissionId }
  | { allowed: false; reason: DenyReason; permission: PermissionId; detail?: string }

/** The permissions an actor holds, plus the registry version they were resolved against. */
export interface ResolvedPermissionSet {
  userId: string
  /** Sorted for deterministic output. */
  permissions: readonly PermissionId[]
  /** Fast membership test built from the same data. */
  has: (permission: PermissionId) => boolean
  roles: readonly AdminRole[]
  /** Registry version this set was computed against — see cache.ts. */
  registryVersion: string
  resolvedAt: number
}
