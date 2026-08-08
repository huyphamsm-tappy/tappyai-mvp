// Controller V2 — FOUNDATION-03 admin registry.
//
// Registers the EXISTING, already-deployed /admin surfaces as real Controller
// modules under real hubs. Manifests DESCRIBE the existing implementations —
// same permissions, routes, labels, icons and order as the legacy nav.ts NAV[].
// No new permissions, no duplicate business logic, no page rewrites.
//
// This is the integration SUBSTRATE. It is proven equivalent to the legacy nav
// (see adminModules.equivalence.test.ts) but is NOT yet wired into AdminShell —
// the live cutover is gated on the future-hub placeholder decision (the four
// `ready:false` entries in nav.ts, documented there as "future Hubs").

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { ControllerCore } from '../core'
import type { AuditSink, EventSink, HubDescriptor, ModuleManifest } from '../types'
import { securityHub, securityAuditModule } from '../modules/securityAuditModule'

// ── Hubs (real, backed by shipped modules) ──────────────────────────────────
export const dashboardHub: HubDescriptor = {
  id: 'tappy.hub.dashboard', name: 'Dashboard', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.dashboard', navigationOrder: 0, lifecycle: 'stable',
}
export const analyticsHub: HubDescriptor = {
  id: 'tappy.hub.analytics', name: 'Analytics', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.analytics', navigationOrder: 10, lifecycle: 'stable',
}
export const commerceHub: HubDescriptor = {
  id: 'tappy.hub.commerce', name: 'Commerce', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.commerce', navigationOrder: 30, lifecycle: 'stable',
}
export const configurationHub: HubDescriptor = {
  id: 'tappy.hub.configuration', name: 'Configuration', version: '1.0.0', owner: 'platform',
  navigationGroup: 'admin.nav.group.configuration', navigationOrder: 40, lifecycle: 'stable',
}
// securityHub (tappy.hub.security, order 20) is defined in ../modules/securityAuditModule.
// Flatten order: dashboard(0) → analytics(10) → security(20) → commerce(30) → configuration(40).

function mod(
  id: string, name: string, hub: string, route: string, permission: string,
  label: string, icon: string, order: number
): ModuleManifest {
  return {
    id, name, version: '1.0.0', owner: 'platform', hub,
    capabilities: [], permissions: [permission], dependencies: [],
    routes: [route],
    navigation: { label, icon, order, visibilityPermission: permission },
    lifecycle: 'stable', status: 'enabled', compatibility: { controller: '^1' },
  }
}

// ── Real modules (describe the shipped /admin pages) ─────────────────────────
export const homeModule = mod('tappy.hub.dashboard.home', 'Home', dashboardHub.id, '/admin', PERMISSIONS.DASHBOARD_HOME_VIEW, 'admin.nav.dashboard', 'LayoutDashboard', 0)
export const analyticsContentModule = mod('tappy.hub.analytics.content', 'Content Analytics', analyticsHub.id, '/admin/analytics', PERMISSIONS.ANALYTICS_CONTENT_READ, 'admin.nav.analytics', 'BarChart3', 10)
export const analyticsAuthModule = mod('tappy.hub.analytics.auth', 'Auth Analytics', analyticsHub.id, '/admin/analytics/auth', PERMISSIONS.ANALYTICS_AUTH_READ, 'admin.nav.authAnalytics', 'UserCheck', 20)
export const analyticsActivationModule = mod('tappy.hub.analytics.activation', 'Activation Analytics', analyticsHub.id, '/admin/analytics/activation', PERMISSIONS.ANALYTICS_ACTIVATION_READ, 'admin.nav.activationAnalytics', 'Zap', 30)
export const commerceDealsModule = mod('tappy.hub.commerce.deals', 'Deals', commerceHub.id, '/admin/deals', PERMISSIONS.COMMERCE_DEALS_READ, 'admin.nav.deals', 'Tag', 10)
export const securityRolesModule = mod('tappy.hub.security.rbac', 'RBAC', securityHub.id, '/admin/rbac', PERMISSIONS.SECURITY_ROLES_READ, 'admin.nav.roles', 'KeyRound', 30)
export const configurationSettingsModule = mod('tappy.hub.configuration.settings', 'Settings', configurationHub.id, '/admin/settings', PERMISSIONS.SETTINGS_CONFIG_READ, 'admin.nav.settings', 'SettingsIcon', 10)

export const ADMIN_HUBS: readonly HubDescriptor[] = [dashboardHub, securityHub, analyticsHub, commerceHub, configurationHub]
export const ADMIN_MODULES: readonly ModuleManifest[] = [
  homeModule,
  analyticsContentModule, analyticsAuthModule, analyticsActivationModule,
  securityAuditModule, securityRolesModule,
  commerceDealsModule,
  configurationSettingsModule,
]

/**
 * Build a ControllerCore with every real admin hub + module registered.
 * Throws if any registration fails — a registry that half-loads is a defect.
 */
export function buildAdminController(opts: { audit?: AuditSink; events?: EventSink } = {}): ControllerCore {
  const core = new ControllerCore({ controllerVersion: '1.0.0', audit: opts.audit, events: opts.events })
  for (const hub of ADMIN_HUBS) {
    const r = core.registerHub(hub)
    if (!r.ok) throw new Error(`admin hub "${hub.id}" failed to register: ${r.errors.join('; ')}`)
  }
  for (const m of ADMIN_MODULES) {
    const r = core.register(m)
    if (!r.ok) throw new Error(`admin module "${m.id}" failed to register: ${r.errors.join('; ')}`)
  }
  return core
}
