// Controller V2 — Component 3 (RBAC): the Permission Registry.
//
// THE SINGLE SOURCE OF TRUTH for what permissions exist. A permission that is
// not declared here does not exist: `authorize()` rejects it as
// UNKNOWN_PERMISSION rather than failing open.
//
// Handlers must reference `PERMISSIONS.x` constants, never string literals.
//
// The catalogue below is derived from the 22 authorization decision points that
// existed before Component 3 — it describes the system as it actually is, not
// an aspirational surface. New modules add entries when they ship.

import type { PermissionDefinition, PermissionId } from './types'

/**
 * Bumped whenever the catalogue changes in a way that could alter a resolved
 * permission set (adding/removing an entry, or changing `defaultRoles`).
 * Cached permission sets carry this value and are discarded on mismatch, so a
 * registry change can never be served from a stale cache.
 */
export const REGISTRY_VERSION = '2026-08-08.1'

function def(d: PermissionDefinition): PermissionDefinition {
  return d
}

const DEFINITIONS: readonly PermissionDefinition[] = [
  // ── Dashboard ────────────────────────────────────────────────────────────
  def({
    id: 'dashboard.home.view',
    displayName: 'View Controller home',
    description: 'Open the Controller home dashboard. The minimum permission any admin needs.',
    module: 'dashboard',
    capability: 'controller.dashboard',
    category: 'read',
    riskLevel: 'low',
    defaultRoles: ['analyst', 'moderator', 'admin', 'super_admin'],
  }),

  // ── Analytics ────────────────────────────────────────────────────────────
  def({
    id: 'analytics.auth.read',
    displayName: 'Read authentication analytics',
    description: 'View signup, login and provider breakdowns. Aggregate data only; no user PII.',
    module: 'analytics',
    capability: 'analytics.read',
    category: 'read',
    riskLevel: 'low',
    // `moderator` is present to PRESERVE EXISTING BEHAVIOUR. Under the old
    // ROLE_RANK ladder these routes required `analyst`, and moderator outranked
    // analyst, so moderators can read analytics today. Removing them here would
    // be a silent privilege revocation smuggled into a mechanism change.
    // Tightening is proposed separately — see 03_COMPONENT3_RBAC_DESIGN.md §9.
    defaultRoles: ['analyst', 'moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'analytics.activation.read',
    displayName: 'Read activation analytics',
    description: 'View activation funnel, rules and cohort breakdowns. Aggregate data only.',
    module: 'analytics',
    capability: 'analytics.read',
    category: 'read',
    riskLevel: 'low',
    // `moderator` preserves existing ROLE_RANK behaviour — see the note above.
    defaultRoles: ['analyst', 'moderator', 'admin', 'super_admin'],
  }),

  def({
    id: 'analytics.content.read',
    displayName: 'Read content analytics',
    description:
      'View review, video, hashtag and creator aggregates. Aggregate data only; no user PII.',
    module: 'analytics',
    capability: 'analytics.read',
    category: 'read',
    riskLevel: 'low',
    // The legacy /admin/analytics page had NO permission of its own before
    // Component 3 — it relied on the /admin layout, which admits any admin.
    // Every role is listed here so the guard preserves that exactly. Borrowing
    // `analytics.auth.read` instead (the review caught this) would have gated a
    // content page on an authentication permission, making the registry lie
    // about what it protects.
    defaultRoles: ['analyst', 'moderator', 'admin', 'super_admin'],
  }),

  // ── Audit ────────────────────────────────────────────────────────────────
  def({
    id: 'audit.log.read',
    displayName: 'Read audit log',
    description:
      'View the administrative audit trail, including actor identity and before/after state. Reveals who did what.',
    module: 'audit',
    capability: 'audit.read',
    category: 'read',
    riskLevel: 'medium',
    defaultRoles: ['admin', 'super_admin'],
  }),

  // ── Settings ─────────────────────────────────────────────────────────────
  def({
    id: 'settings.config.read',
    displayName: 'Read platform settings',
    description: 'View effective Controller configuration. Read-only; no secrets are exposed.',
    module: 'settings',
    capability: 'settings.read',
    category: 'read',
    riskLevel: 'low',
    defaultRoles: ['admin', 'super_admin'],
  }),

  // ── Commerce / Deals ─────────────────────────────────────────────────────
  def({
    id: 'commerce.deals.read',
    displayName: 'List partner deals',
    description: 'View partner deals in the Controller, including unpublished ones.',
    module: 'commerce',
    capability: 'commerce.deals',
    category: 'read',
    riskLevel: 'low',
    defaultRoles: ['admin', 'super_admin'],
  }),
  def({
    id: 'commerce.deals.create',
    displayName: 'Create partner deal',
    description: 'Create a partner deal. Published deals are visible to end users.',
    module: 'commerce',
    capability: 'commerce.deals',
    category: 'write',
    riskLevel: 'medium',
    defaultRoles: ['admin', 'super_admin'],
  }),
  def({
    id: 'commerce.deals.update',
    displayName: 'Update partner deal',
    description: 'Edit an existing partner deal, including its published state.',
    module: 'commerce',
    capability: 'commerce.deals',
    category: 'write',
    riskLevel: 'medium',
    defaultRoles: ['admin', 'super_admin'],
  }),
  def({
    id: 'commerce.deals.delete',
    displayName: 'Delete partner deal',
    description: 'Permanently remove a partner deal. Not recoverable from the Controller.',
    module: 'commerce',
    capability: 'commerce.deals',
    category: 'destructive',
    riskLevel: 'high',
    defaultRoles: ['admin', 'super_admin'],
  }),
  def({
    id: 'commerce.deals.upload_media',
    displayName: 'Upload deal media',
    description: 'Upload images for partner deals to blob storage.',
    module: 'commerce',
    capability: 'commerce.deals',
    category: 'write',
    riskLevel: 'medium',
    defaultRoles: ['admin', 'super_admin'],
  }),

  // ── Security / RBAC ──────────────────────────────────────────────────────
  def({
    id: 'security.roles.read',
    displayName: 'View admin role assignments',
    description: 'See who holds which administrative role.',
    module: 'security',
    capability: 'security.rbac',
    category: 'read',
    riskLevel: 'medium',
    defaultRoles: ['super_admin'],
  }),
  def({
    id: 'security.roles.grant',
    displayName: 'Grant an admin role',
    description:
      'Grant an administrative role to a user. Granting `super_admin` additionally requires the Platform Owner and is enforced in the database, outside RBAC.',
    module: 'security',
    capability: 'security.rbac',
    category: 'security',
    riskLevel: 'critical',
    defaultRoles: ['super_admin'],
  }),
  def({
    id: 'security.roles.revoke',
    displayName: 'Revoke an admin role',
    description:
      'Revoke an administrative role. Revoking `super_admin` additionally requires the Platform Owner and is enforced in the database, outside RBAC.',
    module: 'security',
    capability: 'security.rbac',
    category: 'security',
    riskLevel: 'critical',
    defaultRoles: ['super_admin'],
  }),

  // ── Organization / department membership (Controller V2 FOUNDATION-07D) ────
  // A DISTINCT capability from security.roles.* : administering DEPARTMENT
  // memberships must not inherit platform-wide RBAC-granting semantics. The PDP
  // is the first gate (this permission); department AUTHORITY (canDelegate — Head
  // of the target department) is the second. Held by super_admin only for now;
  // extending it to a lower role (so an `admin`-role Head can self-serve) would
  // broaden current authority and is a deferred OWNER DECISION (see F-07D report).
  def({
    id: 'security.membership.read',
    displayName: 'View department memberships',
    description: 'See which users belong to which department, with org role and scope.',
    module: 'security',
    capability: 'security.rbac',
    category: 'read',
    riskLevel: 'medium',
    defaultRoles: ['super_admin'],
  }),
  def({
    id: 'security.membership.manage',
    displayName: 'Manage department memberships',
    description:
      'Assign, suspend, reactivate or remove a department membership. Bounded by department authority: a Department Head may act only within their own department; the Ultimate Owner acts globally.',
    module: 'security',
    capability: 'security.rbac',
    category: 'security',
    riskLevel: 'critical',
    defaultRoles: ['super_admin'],
  }),
] as const

/** A registry instance. Injectable so tests can exercise fixtures without touching the real catalogue. */
export interface PermissionRegistry {
  readonly version: string
  readonly all: readonly PermissionDefinition[]
  get(id: PermissionId): PermissionDefinition | undefined
  has(id: PermissionId): boolean
  byModule(module: string): readonly PermissionDefinition[]
  deprecated(): readonly PermissionDefinition[]
}

/**
 * Build a registry from definitions.
 *
 * Throws on a duplicate id: two definitions for one permission would make
 * authorization depend on array order, which is exactly the kind of silent
 * ambiguity this component exists to remove.
 */
export function createRegistry(
  definitions: readonly PermissionDefinition[],
  version: string
): PermissionRegistry {
  const index = new Map<PermissionId, PermissionDefinition>()
  for (const d of definitions) {
    if (index.has(d.id)) {
      throw new Error(`[permissions] duplicate permission id in registry: ${d.id}`)
    }
    index.set(d.id, d)
  }
  const all = Object.freeze([...definitions])

  return {
    version,
    all,
    get: (id) => index.get(id),
    has: (id) => index.has(id),
    byModule: (module) => all.filter((d) => d.module === module),
    deprecated: () => all.filter((d) => d.deprecated !== undefined),
  }
}

/** The production registry. */
export const permissionRegistry = createRegistry(DEFINITIONS, REGISTRY_VERSION)

/**
 * Typed constants for handlers. Referencing `PERMISSIONS.AUDIT_LOG_READ` rather
 * than the raw string means a typo is a compile error instead of a silent
 * runtime denial.
 */
export const PERMISSIONS = {
  DASHBOARD_HOME_VIEW: 'dashboard.home.view',
  ANALYTICS_AUTH_READ: 'analytics.auth.read',
  ANALYTICS_ACTIVATION_READ: 'analytics.activation.read',
  ANALYTICS_CONTENT_READ: 'analytics.content.read',
  AUDIT_LOG_READ: 'audit.log.read',
  SETTINGS_CONFIG_READ: 'settings.config.read',
  COMMERCE_DEALS_READ: 'commerce.deals.read',
  COMMERCE_DEALS_CREATE: 'commerce.deals.create',
  COMMERCE_DEALS_UPDATE: 'commerce.deals.update',
  COMMERCE_DEALS_DELETE: 'commerce.deals.delete',
  COMMERCE_DEALS_UPLOAD_MEDIA: 'commerce.deals.upload_media',
  SECURITY_ROLES_READ: 'security.roles.read',
  SECURITY_ROLES_GRANT: 'security.roles.grant',
  SECURITY_ROLES_REVOKE: 'security.roles.revoke',
  SECURITY_MEMBERSHIP_READ: 'security.membership.read',
  SECURITY_MEMBERSHIP_MANAGE: 'security.membership.manage',
} as const

export type KnownPermissionId = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
