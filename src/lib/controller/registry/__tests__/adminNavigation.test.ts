import { describe, it, expect } from 'vitest'
import { buildAdminController, ADMIN_MODULES } from '../adminModules'
import { deriveNavigation } from '../../navigationProvider'
import { resolveAdminNavigation } from '../../adminNavigation'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { permissionRegistry, PERMISSIONS } from '@/lib/admin/permissions/registry'
import { NO_CAPABILITIES } from '@/lib/admin/capabilities'
import type { Actor, AdminRole } from '@/lib/admin/rbac'

// FOUNDATION-03 — the registry is the SINGLE navigation authority. This test
// MIGRATES the intent of the deleted nav.test.ts (permission-aware per-role
// visibility, owner-sees-all, multi-role union, unauthenticated-empty, registry
// consistency) onto the new authority, and additionally proves hub grouping,
// deterministic order, that the four removed placeholders never appear, and
// direct-route security. Authorization flows through the REAL permissionEngine.

function actor(roles: AdminRole[], opts: { isOwner?: boolean } = {}): Actor {
  return {
    userId: `u-${roles.join('-') || 'none'}-${opts.isOwner ? 'own' : ''}`,
    email: 'x@example.com',
    isOwner: opts.isOwner ?? false,
    roles,
    highestRole: roles.length ? roles[roles.length - 1] : null,
    capabilities: NO_CAPABILITIES,
    source: 'cookie',
    resolvedAt: 0,
  }
}

const routesFor = (a: Actor | null): string[] =>
  deriveNavigation(buildAdminController(), a).flatMap((g) => g.items.map((i) => i.route))

const ANALYST_REAL = ['/admin', '/admin/analytics', '/admin/analytics/auth', '/admin/analytics/activation']
// Pinned from the pre-migration nav.test.ts EXPECTED, minus the removed placeholders.
const EXPECTED: Record<string, string[]> = {
  unauthenticated: [],
  analyst: ANALYST_REAL,
  moderator: ANALYST_REAL, // moderator's only extra was the /admin/moderation placeholder (removed)
  admin: [...ANALYST_REAL, '/admin/audit', '/admin/deals', '/admin/settings'],
  super_admin: [...ANALYST_REAL, '/admin/audit', '/admin/rbac', '/admin/deals', '/admin/settings'],
  owner: [...ANALYST_REAL, '/admin/audit', '/admin/rbac', '/admin/deals', '/admin/settings'],
}

const ACTOR: Record<string, Actor | null> = {
  unauthenticated: null,
  analyst: actor(['analyst']),
  moderator: actor(['moderator']),
  admin: actor(['admin']),
  super_admin: actor(['super_admin']),
  owner: actor([], { isOwner: true }),
}

const PLACEHOLDERS = ['/admin/users', '/admin/moderation', '/admin/engagement', '/admin/monitoring']

describe('registry nav — per-role visibility (migrated from nav.test.ts)', () => {
  for (const role of Object.keys(EXPECTED)) {
    it(`${role} sees exactly the expected routes (as a set)`, () => {
      expect([...routesFor(ACTOR[role])].sort()).toEqual([...EXPECTED[role]].sort())
    })
  }

  it('the four removed placeholders never appear for any role', () => {
    for (const role of Object.keys(ACTOR)) {
      for (const p of PLACEHOLDERS) expect(routesFor(ACTOR[role])).not.toContain(p)
    }
  })

  it('multi-role union: analyst+admin sees the admin set', () => {
    expect([...routesFor(actor(['analyst', 'admin']))].sort()).toEqual([...EXPECTED.admin].sort())
  })

  it('unauthenticated sees nothing', () => {
    expect(routesFor(null)).toEqual([])
  })
})

describe('registry nav — hub grouping + deterministic order', () => {
  it('groups are hub-ordered dashboard→analytics→security→commerce→configuration', () => {
    const groups = deriveNavigation(buildAdminController(), ACTOR.owner)
    expect(groups.map((g) => g.hubId)).toEqual([
      'tappy.hub.dashboard', 'tappy.hub.analytics', 'tappy.hub.security', 'tappy.hub.commerce', 'tappy.hub.configuration',
    ])
  })

  it('super_admin flattened order is deterministic', () => {
    expect(routesFor(ACTOR.super_admin)).toEqual([
      '/admin', '/admin/analytics', '/admin/analytics/auth', '/admin/analytics/activation',
      '/admin/audit', '/admin/rbac', '/admin/deals', '/admin/settings',
    ])
  })

  it('resolveAdminNavigation (the layout entrypoint) returns the same routes', () => {
    const viaResolver = resolveAdminNavigation(ACTOR.admin).flatMap((g) => g.items.map((i) => i.route))
    expect([...viaResolver].sort()).toEqual([...EXPECTED.admin].sort())
  })
})

describe('registry nav — consistency + direct-route security', () => {
  it('every module visibility permission is a real registry entry', () => {
    for (const m of ADMIN_MODULES) {
      const perm = m.navigation.visibilityPermission
      if (!perm) continue
      expect(permissionRegistry.has(perm), `${m.routes[0]} → ${perm}`).toBe(true)
    }
  })

  it('the content-analytics module gates on ANALYTICS_CONTENT_READ (nav ≡ page guard)', () => {
    const m = ADMIN_MODULES.find((x) => x.routes[0] === '/admin/analytics')
    expect(m?.navigation.visibilityPermission).toBe(PERMISSIONS.ANALYTICS_CONTENT_READ)
  })

  it('direct-route access converges on the PDP', () => {
    const core = buildAdminController()
    expect(core.isModuleAccessible('tappy.hub.security.rbac', ACTOR.analyst)).toBe(false)  // hidden AND denied
    expect(core.isModuleAccessible('tappy.hub.security.rbac', ACTOR.super_admin)).toBe(true)
    expect(core.isModuleAccessible('tappy.hub.security.audit', null)).toBe(false)           // unauthenticated denied
    // and it matches the raw PDP for the underlying permission
    expect(core.authorize(ACTOR.analyst, PERMISSIONS.SECURITY_ROLES_READ))
      .toEqual(permissionEngine.authorize(ACTOR.analyst, PERMISSIONS.SECURITY_ROLES_READ))
  })
})
