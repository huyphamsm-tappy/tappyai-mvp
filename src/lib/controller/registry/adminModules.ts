// Controller V2 — FOUNDATION-03 admin registry.
//
// Registers the EXISTING, already-deployed /admin surfaces as real Controller
// modules under real hubs. Manifests DESCRIBE the existing implementations —
// same permissions, routes, labels, icons and order as the legacy nav.ts NAV[].
// No new permissions, no duplicate business logic, no page rewrites.
//
// This is the integration SUBSTRATE, proven equivalent to the legacy nav (see
// adminModules.equivalence.test.ts). It IS wired into the live AdminShell:
// src/app/admin/page.tsx calls buildAdminController() and derives navigation
// from the registry.
//
// Note on terminology: the `ready:false` entries in the legacy nav.ts are
// "COMING SOON" placeholders and are unrelated to the Component 6 lifecycle
// state `ready` (which is derived as enabled && available — see ControllerCore).

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { ControllerCore } from '../core'
import { createObservabilityEventSink } from '../events'
import type { AuditSink, EventSink, HubDescriptor, ModuleManifest } from '../types'
import { securityAuditModule } from '../modules/securityAuditModule'
import { userManagementModule } from '../modules/userManagementModule'
import { userHub, securityHub } from '../modules/hubs'
import { moderationModule } from '../modules/moderationModule'
import { orgMembershipModule } from '../modules/orgMembershipModule'
import { notificationsModule } from '../modules/notificationsModule'

// ── Hubs (real, backed by shipped modules) ──────────────────────────────────
/**
 * The Founder Hub (01_ARCH §2.2 · 12_HUB_TAXONOMY §3, under Owner Decision G).
 *
 * Registered as `tappy.hub.dashboard` until Phase 8 — a container of
 * convenience invented by this registry before the taxonomy existed. §3's
 * disposition is explicit: "RENAME to tappy.hub.founder. It is the Founder Hub
 * under a placeholder name; module 01 is a Founder module."
 *
 * §3 called that "a migration with a real cutover", because a hub id lives in a
 * module's manifest AND in the audit trail. MEASURED on production before
 * acting, and the audit half was false: zero `controller.%` audit rows exist,
 * zero rows reference a hub id, and `module_registry` does not exist. Every
 * `buildAdminController()` call site uses the default NOOP audit sink, so hub
 * registration has never been written anywhere. Nothing outside this file
 * stores a hub id, so there is no data to migrate.
 *
 * The hub is now Founder in id and name. It is NOT yet the Founder Hub of
 * §2.2 — Business Analytics and the Investor Dashboard do not exist, and
 * `daily_snapshots` has no migration. This corrects an identity; it completes
 * nothing.
 */
export const founderHub: HubDescriptor = {
  id: 'tappy.hub.founder', name: 'Founder', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.founder', navigationOrder: 0, lifecycle: 'stable',
}
export const analyticsHub: HubDescriptor = {
  id: 'tappy.hub.analytics', name: 'Analytics', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.analytics', navigationOrder: 10, lifecycle: 'stable',
}
export const commerceHub: HubDescriptor = {
  id: 'tappy.hub.commerce', name: 'Commerce', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.commerce', navigationOrder: 30, lifecycle: 'stable',
}
// Marketing V1 foundation. Slots at 35 — between commerce(30) and
// configuration(40) — for the same reason userHub slots at 5: adding a hub must
// not renumber live surfaces. Marketing sits next to Commerce because an
// operator reads the two as adjacent business functions.
export const marketingHub: HubDescriptor = {
  id: 'tappy.hub.marketing', name: 'Marketing', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.marketing', navigationOrder: 35, lifecycle: 'stable',
}
export const configurationHub: HubDescriptor = {
  id: 'tappy.hub.configuration', name: 'Configuration', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.configuration', navigationOrder: 40, lifecycle: 'stable',
}
// securityHub (tappy.hub.security, order 20) is defined in ../modules/securityAuditModule.
// userHub (tappy.hub.user, order 5) is defined in ../modules/userManagementModule.
// Nav order: founder(0) → user(5) → analytics(10) → security(20) → commerce(30) → configuration(40).
// User slots at 5 rather than renumbering: taxonomy §1 orders it second, and a
// renumber would move four live surfaces in order to place one new one.

function mod(
  id: string, name: string, hub: string, route: string, permission: string,
  label: string, icon: string, order: number,
  over: Partial<ModuleManifest> = {}
): ModuleManifest {
  return {
    id, name, version: '1.0.0', owner: 'platform', hub,
    capabilities: [], permissions: [permission], dependencies: [],
    routes: [route],
    navigation: { label, icon, order, visibilityPermission: permission },
    lifecycle: 'stable', status: 'enabled', compatibility: { controller: '^1' },
    ...over,
  }
}

// ── Real modules (describe the shipped /admin pages) ─────────────────────────
//
// Home DECLARES its dependency on `audit.read` because it genuinely has one:
// the Controller Home renders a recent-audit panel. The declaration is
// load-bearing, not decorative — `src/app/admin/page.tsx` resolves it through
// `bindCapability` and renders the panel as unavailable when the capability
// does not resolve. That is the first real provides/requires relationship in
// the registry; before it, capability resolution existed but no shipped module
// had ever exercised it.
export const homeModule = mod(
  // The MODULE id is unchanged: 01_ARCH §2.1 makes it "globally unique,
  // immutable", and the taxonomy authorized renaming the HUB only. The mismatch
  // between this id and its hub is a recorded consequence of honouring that.
  'tappy.hub.dashboard.home', 'Home', founderHub.id, '/admin', PERMISSIONS.DASHBOARD_HOME_VIEW,
  'admin.nav.dashboard', 'LayoutDashboard', 0,
  { dependencies: [{ capabilityId: 'audit.read', versionRange: '^1' }] }
)
export const analyticsContentModule = mod('tappy.hub.analytics.content', 'Content Analytics', analyticsHub.id, '/admin/analytics', PERMISSIONS.ANALYTICS_CONTENT_READ, 'admin.nav.analytics', 'BarChart3', 10)
export const analyticsAuthModule = mod('tappy.hub.analytics.auth', 'Auth Analytics', analyticsHub.id, '/admin/analytics/auth', PERMISSIONS.ANALYTICS_AUTH_READ, 'admin.nav.authAnalytics', 'UserCheck', 20)
export const analyticsActivationModule = mod('tappy.hub.analytics.activation', 'Activation Analytics', analyticsHub.id, '/admin/analytics/activation', PERMISSIONS.ANALYTICS_ACTIVATION_READ, 'admin.nav.activationAnalytics', 'Zap', 30)
// Module 04 User Analytics, third surface: growth + engagement + subscription
// funnel from daily_snapshots and subscriptions. auth(20) and activation(30)
// are the other two; this sits after them at 40 so neither moves.
export const analyticsUsersModule = mod('tappy.hub.analytics.users', 'User Analytics', analyticsHub.id, '/admin/analytics/users', PERMISSIONS.ANALYTICS_USERS_READ, 'admin.nav.userAnalytics', 'TrendingUp', 40)
export const commerceDealsModule = mod('tappy.hub.commerce.deals', 'Deals', commerceHub.id, '/admin/deals', PERMISSIONS.COMMERCE_DEALS_READ, 'admin.nav.deals', 'Tag', 10)

// ── Marketing V1 (FOUNDATION ENTRIES) ────────────────────────────────────────
//
// The five Owner-frozen module groups. Each declares a real route, a real
// permission and a real navigation entry, and each is owned by the `marketing`
// department in `org/departments.ts`.
//
// ⚠️ FOUNDATION ONLY. The pages behind these routes render the coming-soon
// state; there is no table, API, server action or CRUD behind any of them yet.
// They are declared now so the department, its permissions and its navigation
// are real and testable — a module that exists in the registry but not in the
// database is honest; a card that pretends to work is not.
//
// The `visibilityPermission` each carries is the module's READ permission, so
// the nav entry and the Department Home card appear only for an actor the PDP
// would actually admit — availability is department ownership INTERSECTED with
// authorization, never one without the other.
export const marketingCampaignsModule = mod('tappy.hub.marketing.campaigns', 'Campaigns', marketingHub.id, '/admin/marketing/campaigns', PERMISSIONS.MARKETING_CAMPAIGNS_READ, 'admin.nav.campaigns', 'Megaphone', 10)
export const marketingContentModule = mod('tappy.hub.marketing.content', 'Marketing Content', marketingHub.id, '/admin/marketing/content', PERMISSIONS.MARKETING_CONTENT_READ, 'admin.nav.marketingContent', 'FileText', 20)
export const marketingAudienceModule = mod('tappy.hub.marketing.audience', 'Audience', marketingHub.id, '/admin/marketing/audience', PERMISSIONS.MARKETING_AUDIENCE_READ, 'admin.nav.audience', 'Users', 30)
export const marketingPromotionsModule = mod('tappy.hub.marketing.promotions', 'Promotions', marketingHub.id, '/admin/marketing/promotions', PERMISSIONS.MARKETING_PROMOTIONS_READ, 'admin.nav.promotions', 'BadgePercent', 40)
export const marketingAnalyticsModule = mod('tappy.hub.marketing.analytics', 'Marketing Analytics', marketingHub.id, '/admin/marketing/analytics', PERMISSIONS.MARKETING_ANALYTICS_READ, 'admin.nav.marketingAnalytics', 'LineChart', 50)
export const securityRolesModule = mod('tappy.hub.security.rbac', 'RBAC', securityHub.id, '/admin/rbac', PERMISSIONS.SECURITY_ROLES_READ, 'admin.nav.roles', 'KeyRound', 30)
export const configurationSettingsModule = mod('tappy.hub.configuration.settings', 'Settings', configurationHub.id, '/admin/settings', PERMISSIONS.SETTINGS_CONFIG_READ, 'admin.nav.settings', 'SettingsIcon', 10)

export const ADMIN_HUBS: readonly HubDescriptor[] = [founderHub, userHub, securityHub, analyticsHub, commerceHub, marketingHub, configurationHub]
export const ADMIN_MODULES: readonly ModuleManifest[] = [
  homeModule,
  userManagementModule,
  moderationModule,
  analyticsContentModule, analyticsAuthModule, analyticsActivationModule, analyticsUsersModule,
  notificationsModule,
  securityAuditModule, securityRolesModule, orgMembershipModule,
  commerceDealsModule,
  marketingCampaignsModule, marketingContentModule, marketingAudienceModule,
  marketingPromotionsModule, marketingAnalyticsModule,
  configurationSettingsModule,
]

/**
 * Build a ControllerCore with every real admin hub + module registered.
 * Throws if any registration fails — a registry that half-loads is a defect.
 *
 * Uses `registerAll`, which orders the batch topologically. `ADMIN_MODULES` is
 * listed in navigation order, and Home (order 0) depends on a capability the
 * Audit module provides — so a loop calling `register()` in array order would
 * fail on a batch that is perfectly satisfiable. Declaration order is a display
 * concern and must not become a hidden dependency contract.
 */
export function buildAdminController(opts: { audit?: AuditSink; events?: EventSink } = {}): ControllerCore {
  const core = new ControllerCore({
    controllerVersion: '1.0.0',
    audit: opts.audit,
    // K-3 (Owner Decision D-K3): the production event sink. Previously this fell
    // through to the kernel's NOOP, so registering 6 hubs and 12 modules
    // observed nothing at all — which is precisely the "no-op Event Bus"
    // Decision F's Definition of Done rules out. A caller may still supply its
    // own sink; only the DEFAULT changed.
    events: opts.events ?? createObservabilityEventSink(),
  })
  for (const hub of ADMIN_HUBS) {
    const r = core.registerHub(hub)
    if (!r.ok) throw new Error(`admin hub "${hub.id}" failed to register: ${r.errors.join('; ')}`)
  }
  const r = core.registerAll(ADMIN_MODULES)
  if (!r.ok) throw new Error(`admin module registration failed: ${r.errors.join('; ')}`)
  return core
}
