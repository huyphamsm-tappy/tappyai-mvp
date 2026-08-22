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
export const REGISTRY_VERSION = '2026-08-21.3'

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

  // Module 04 User Analytics — growth, engagement and the subscription funnel.
  // `12_RBAC.md` §3 grants **User Analytics** to all four roles, which is also
  // exactly what `analytics.auth.read` and `analytics.activation.read` carry —
  // the other two surfaces of the same module. A separate id rather than a
  // reuse: C6 §5 makes permission ownership exclusive per module, so a shared
  // permission would have tied three surfaces to one manifest.
  //
  // Aggregate only. No PII, no revenue figures — the funnel reports population
  // counts, never amounts, and Business Analytics stays `admin`+ in §3.
  def({
    id: 'analytics.users.read',
    displayName: 'Read user analytics',
    description:
      'View user growth, engagement (DAU/WAU/MAU, stickiness) and the free→Pro subscription funnel. Aggregate counts only; no user PII and no revenue amounts.',
    module: 'analytics',
    capability: 'analytics.read',
    category: 'read',
    riskLevel: 'low',
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

  // ── Session security (Controller V2 Component 11) ─────────────────────────
  // A DISTINCT capability from security.rbac: reading or ending someone's
  // sessions is not the same authority as granting them a role, and folding the
  // two together would make a future capability gate unable to separate them.
  //
  // The read/revoke split is deliberately asymmetric, ratified 2026-08-13 (P-7).
  // Ending another person's sessions is comparable in blast radius to
  // security.roles.grant, which is super_admin-only, so revoke matches it while
  // read stays available to `admin`. The Ultimate Owner can never be the TARGET
  // of a revoke — that is enforced in the handler and in the SQL function, not
  // by this registry (contract §5.1.1).
  def({
    id: 'security.sessions.read',
    displayName: 'View active sessions',
    description:
      'List a user’s sessions: creation time, last activity, expiry and platform class. Credential material is never returned.',
    module: 'security',
    capability: 'security.sessions',
    category: 'read',
    riskLevel: 'medium',
    defaultRoles: ['admin', 'super_admin'],
  }),
  def({
    id: 'security.sessions.revoke',
    displayName: 'Revoke sessions / force logout',
    description:
      'End a specific session, or every session for one user. Cannot target the Platform Owner, and never affects anonymous sessions.',
    module: 'security',
    capability: 'security.sessions',
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

  // ── User management (Module 08) ───────────────────────────────────────────
  // A DISTINCT capability from `security.rbac`: administering a CONSUMER
  // account's standing is not the authority to grant administrative power, and
  // folding them together would make a future capability gate unable to
  // separate "can suspend a user" from "can create an admin".
  //
  // WHO GETS READ. `05_API_Architecture.md` §6 says "admin or higher" for the
  // list and 360 views, while `10_User_Management.md` §6 defines an email
  // MASKING policy for `moderator` — a policy that only means something if a
  // moderator can open the list at all. §3.9 also assigns suspend/unsuspend to
  // `moderator`, which is unusable without lookup. The two statements are
  // reconciled here by admitting `moderator` to the read surface and moving the
  // PII boundary onto `users.email.read_full`, which is where §6 actually puts
  // it. `analyst` is NOT admitted: they hold no user-management duty in §3.9,
  // and §6's analyst row is read as covering aggregate analytics surfaces.
  def({
    id: 'users.list.read',
    displayName: 'List consumer users',
    description:
      'Search and page the consumer user list, including each account’s standing (active / suspended / banned). Email addresses are withheld unless `users.email.read_full` is also held.',
    module: 'users',
    capability: 'users.manage',
    category: 'read',
    riskLevel: 'medium',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'users.detail.read',
    displayName: 'View a consumer user',
    description:
      'Open one consumer account: profile summary, account standing, ban reason and suspension expiry.',
    module: 'users',
    capability: 'users.manage',
    category: 'read',
    riskLevel: 'medium',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  // The PII boundary of `10_User_Management.md` §6, expressed as a permission
  // rather than a role comparison, so the PDP stays the only decision source.
  // Its absence MASKS the address (`h***@gmail.com`); it never denies the
  // request, which is why it is checked with `permissionEngine.can` and not
  // with `requirePermission`.
  def({
    id: 'users.email.read_full',
    displayName: 'See unmasked user email',
    description:
      'Read a consumer user’s full email address. Without it the address is masked. §6: PII access requires at minimum the `admin` role.',
    module: 'users',
    capability: 'users.manage',
    category: 'read',
    riskLevel: 'high',
    defaultRoles: ['admin', 'super_admin'],
  }),
  // Owner Decision A, 2026-08-20 (ADR-023) sub-decision (a). A `moderator`
  // reaches the user detail view but not the internal moderation note: they can
  // neither ban nor unban, so no action of theirs is informed by it, and
  // Constitution Rule 9 (minimum data access per role) settles the rest.
  //
  // A SEPARATE permission from `users.email.read_full`, not a reuse. The two
  // fields carry different data classifications — an address is user PII under
  // `10` §6, a ban reason is an internal note whose `33` §3 classification is
  // still an open Owner decision — and one permission covering both would make
  // that future answer unable to move one without the other.
  def({
    id: 'users.ban_reason.read',
    displayName: 'Read a ban reason',
    description:
      'Read the internal moderation note recorded when an account was banned. Withheld without it; the ban itself stays visible.',
    module: 'users',
    capability: 'users.manage',
    category: 'read',
    riskLevel: 'high',
    defaultRoles: ['admin', 'super_admin'],
  }),
  // ── Content Moderation (Module 09) ───────────────────────────────────────
  //
  // `12_RBAC.md` §3 gives seven moderation rows. FIVE become permissions here;
  // TWO DO NOT, and that is the important part:
  //
  //   Moderation — Suspend user   →  reuses `users.account.suspend`
  //   Moderation — Ban user       →  reuses `users.account.ban`
  //
  // §3 grants those two exactly the roles Module 08's existing permissions
  // already carry (suspend moderator+, ban admin+). Minting `moderation.user.
  // suspend` beside `users.account.suspend` would create two ids for one
  // authority — a second authorization path, disagreeing the first time either
  // is changed. A moderator suspending from the queue is the same act as a
  // moderator suspending from the user detail, and it goes through the same id.
  //
  // `warn` is in §4.5's action enum but has NO permission here and no surface:
  // a warning has to reach the user, and this platform has no in-app
  // notification path a moderator can address. Building one would be inventing
  // a product, not implementing a contract.
  def({
    id: 'moderation.queue.read',
    displayName: 'View the moderation queue',
    description:
      'Read reported content and user reports awaiting review, including the report reason. Aggregated provenance only; reporter identity is never exposed (ADR-026).',
    module: 'moderation',
    capability: 'moderation.review',
    category: 'read',
    riskLevel: 'medium',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'moderation.report.dismiss',
    displayName: 'Dismiss a report',
    description: 'Close a queue item as no violation. The report is kept; only the queue item is resolved.',
    module: 'moderation',
    capability: 'moderation.review',
    category: 'write',
    riskLevel: 'medium',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'moderation.content.hide',
    displayName: 'Hide reported content',
    description:
      'Restrict a review so it leaves every public read path, and restore it again. Sets the Content Safety Gate’s own publication_state; no parallel mechanism.',
    module: 'moderation',
    capability: 'moderation.review',
    category: 'write',
    riskLevel: 'high',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'moderation.content.delete',
    displayName: 'Delete reported content',
    description: 'Permanently remove reported content. Not recoverable from the Controller.',
    module: 'moderation',
    capability: 'moderation.review',
    category: 'destructive',
    riskLevel: 'critical',
    // §3: moderator ❌. Deleting is the one content action §3 withholds from
    // the role that does the reviewing.
    defaultRoles: ['admin', 'super_admin'],
  }),
  // `moderation.queue.assign` was here and has been REMOVED (2026-08-21).
  //
  // `12_RBAC.md` §3 lists exactly SEVEN moderation rows — View, Dismiss, Warn,
  // Hide content, Delete content, Suspend user, Ban user — and none of them is
  // "Assign". `04` §4.4 does give the queue an `assigned_to` column, but a
  // COLUMN IS NOT AN AUTHORITY: it says the queue can record an assignee, not
  // who is allowed to set one.
  //
  // So the permission was invented here, with a role set nobody granted, and it
  // had no surface — a dead capability carrying a made-up authority. Removing
  // it is the correction; adding assignment properly needs an Owner decision on
  // who may assign, which §3 does not answer.

  // ── Internal admin notes (Module 08) ─────────────────────────────────────
  //
  // `12_RBAC.md` §3 states ONE authority for notes — "User — Add notes":
  // analyst ❌ · moderator ✅ · admin ✅ · super_admin ✅. It does not state a
  // separate READ authority, so both ids carry the SAME roles: whoever may
  // write a note may read the notes, and analyst gets neither.
  //
  // Two ids rather than one because the actions are genuinely different and
  // the registry's shape requires it — and because widening READ later (should
  // the Owner decide analyst may see notes) must not also widen WRITE.
  def({
    id: 'users.notes.read',
    displayName: 'Read internal notes',
    description:
      'Read the internal admin notes kept about an account. The subject can never read these; they are an operator record, not a message to the user.',
    module: 'users',
    capability: 'users.manage',
    category: 'read',
    riskLevel: 'high',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'users.notes.write',
    displayName: 'Add an internal note',
    description:
      'Add or pin an internal admin note on an account (10_User_Management.md §3.9).',
    module: 'users',
    capability: 'users.manage',
    category: 'write',
    riskLevel: 'medium',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'users.account.suspend',
    displayName: 'Suspend a user',
    description:
      'Temporarily bar a consumer account from posting, commenting and AI, leaving browsing intact (§4). Time-limited or indefinite.',
    module: 'users',
    capability: 'users.manage',
    category: 'write',
    riskLevel: 'high',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'users.account.unsuspend',
    displayName: 'Lift a suspension',
    description: 'Return a suspended consumer account to active standing.',
    module: 'users',
    capability: 'users.manage',
    category: 'write',
    riskLevel: 'medium',
    defaultRoles: ['moderator', 'admin', 'super_admin'],
  }),
  def({
    id: 'users.account.ban',
    displayName: 'Ban a user',
    description:
      'Permanently bar a consumer account. Records the ban and its internal reason; session revocation is a separate operation and is NOT performed by this permission.',
    module: 'users',
    capability: 'users.manage',
    // NOT `security`. That category is reserved here for permissions that
    // change who holds POWER over the platform — granting a role, ending an
    // administrative session — and the registry pins it to `super_admin` alone
    // (`engine.test.ts`). Barring a consumer account is severe but it confers
    // no authority, and §3.9 assigns it to `admin`. `destructive` is the
    // honest classification: irreversible-in-effect for the person it lands on.
    category: 'destructive',
    riskLevel: 'critical',
    defaultRoles: ['admin', 'super_admin'],
  }),
  def({
    id: 'users.account.unban',
    displayName: 'Lift a ban',
    description: 'Restore a banned consumer account and clear its ban reason.',
    module: 'users',
    capability: 'users.manage',
    // A restoration, so not `destructive` — but it erases `ban_reason`, and it
    // returns platform access to someone an admin removed it from. High, not
    // medium, because getting it wrong is not visible from the outside.
    category: 'write',
    riskLevel: 'high',
    defaultRoles: ['admin', 'super_admin'],
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
  ANALYTICS_USERS_READ: 'analytics.users.read',
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
  SECURITY_SESSIONS_READ: 'security.sessions.read',
  SECURITY_SESSIONS_REVOKE: 'security.sessions.revoke',
  USERS_LIST_READ: 'users.list.read',
  USERS_DETAIL_READ: 'users.detail.read',
  USERS_EMAIL_READ_FULL: 'users.email.read_full',
  USERS_BAN_REASON_READ: 'users.ban_reason.read',
  MODERATION_QUEUE_READ: 'moderation.queue.read',
  MODERATION_REPORT_DISMISS: 'moderation.report.dismiss',
  MODERATION_CONTENT_HIDE: 'moderation.content.hide',
  MODERATION_CONTENT_DELETE: 'moderation.content.delete',
  USERS_NOTES_READ: 'users.notes.read',
  USERS_NOTES_WRITE: 'users.notes.write',
  USERS_SUSPEND: 'users.account.suspend',
  USERS_UNSUSPEND: 'users.account.unsuspend',
  USERS_BAN: 'users.account.ban',
  USERS_UNBAN: 'users.account.unban',
} as const

export type KnownPermissionId = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
