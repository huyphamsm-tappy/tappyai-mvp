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
// deterministic order, that the remaining removed placeholders never appear, and
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

// `/admin/analytics/users` joined 2026-08-20 — Module 04's third surface
// (growth · engagement · subscription funnel). `12_RBAC.md` §3 grants User
// Analytics to all four roles, exactly as `auth` and `activation` already are,
// so it belongs in the ANALYST baseline rather than an admin-only set.
const ANALYST_REAL = [
  '/admin',
  '/admin/analytics',
  '/admin/analytics/auth',
  '/admin/analytics/activation',
  '/admin/analytics/users',
]

// `/admin/users` MOVED OUT of PLACEHOLDERS on 2026-08-20, deliberately.
//
// FOUNDATION-03 removed it as a "COMING SOON" placeholder — a door that opened
// onto nothing, which is exactly what §8 forbids. Module 08's surface now
// exists: schema (#117), consumer enforcement (#118), the Admin Users API
// (#119) and the page. So the route is real, and pinning it as a placeholder
// would now be asserting the opposite of the truth.
//
// This is the FIRST time moderator's navigation differs from analyst's — the
// navigational consequence of ADR-023, where moderator gained `users.list.read`
// and stopped being a copy of analyst. The other three placeholders are
// untouched.
const USERS_REAL = '/admin/users'

// `/admin/moderation` MOVED OUT of PLACEHOLDERS on 2026-08-21, for the same
// reason `/admin/users` did: it is no longer a door onto nothing. Module 09's
// manifest, queue API, resolve API and page all exist, and taxonomy §1 places
// Content Moderation in the already-registered `tappy.hub.user`.
//
// It sits in the SAME role set as `/admin/users` because `12_RBAC` §3 grants
// "Moderation Queue — View" to moderator and up — the same population that
// gained the user surface under ADR-023.
const MODERATION_REAL = '/admin/moderation'

// Pinned from the pre-migration nav.test.ts EXPECTED, minus the removed placeholders.
const EXPECTED: Record<string, string[]> = {
  unauthenticated: [],
  analyst: ANALYST_REAL, // analyst holds no users permission (ADR-023)
  moderator: [...ANALYST_REAL, USERS_REAL, MODERATION_REAL],
  admin: [...ANALYST_REAL, USERS_REAL, MODERATION_REAL, '/admin/audit', '/admin/deals', '/admin/settings'],
  super_admin: [...ANALYST_REAL, USERS_REAL, MODERATION_REAL, '/admin/audit', '/admin/rbac', '/admin/deals', '/admin/settings'],
  owner: [...ANALYST_REAL, USERS_REAL, MODERATION_REAL, '/admin/audit', '/admin/rbac', '/admin/deals', '/admin/settings'],
}

const ACTOR: Record<string, Actor | null> = {
  unauthenticated: null,
  analyst: actor(['analyst']),
  moderator: actor(['moderator']),
  admin: actor(['admin']),
  super_admin: actor(['super_admin']),
  owner: actor([], { isOwner: true }),
}

// TWO, not three: `/admin/moderation` graduated on 2026-08-21 — see
// MODERATION_REAL. Loosening this list instead of moving the entry out of it
// would have turned the guard into a formality.
const PLACEHOLDERS = ['/admin/engagement', '/admin/monitoring']

describe('registry nav — per-role visibility (migrated from nav.test.ts)', () => {
  for (const role of Object.keys(EXPECTED)) {
    it(`${role} sees exactly the expected routes (as a set)`, () => {
      expect([...routesFor(ACTOR[role])].sort()).toEqual([...EXPECTED[role]].sort())
    })
  }

  it('the remaining removed placeholders never appear for any role', () => {
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
  it('groups are hub-ordered founder→user→analytics→security→commerce→configuration', () => {
    // User was inserted at navigationOrder 5, between Founder (0) and Analytics
    // (10), per taxonomy §1. No existing hub was renumbered, so every other
    // hub's position in this list is unchanged.
    const groups = deriveNavigation(buildAdminController(), ACTOR.owner)
    expect(groups.map((g) => g.hubId)).toEqual([
      'tappy.hub.founder', 'tappy.hub.user', 'tappy.hub.analytics', 'tappy.hub.security',
      'tappy.hub.commerce', 'tappy.hub.configuration',
    ])
  })

  it('super_admin flattened order is deterministic', () => {
    expect(routesFor(ACTOR.super_admin)).toEqual([
      '/admin', '/admin/users', '/admin/moderation',
      // Analytics hub, module order 10/20/30/40 — users last, so no existing
      // analytics surface moved when it was added.
      '/admin/analytics', '/admin/analytics/auth', '/admin/analytics/activation', '/admin/analytics/users',
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
