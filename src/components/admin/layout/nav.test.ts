import { describe, it, expect } from 'vitest'
import { NAV, visibleNavItems } from './nav'
import { permissionRegistry, PERMISSIONS } from '@/lib/admin/permissions/registry'
import { buildRolePermissionMap, permissionsForRole } from '@/lib/admin/permissions/roleMap'
import type { AdminRole } from '@/lib/admin/roles'
import type { PermissionId } from '@/lib/admin/permissions/types'

// Controller V2 — Component 3: NAVIGATION VISIBILITY.
//
// The nav is not a security boundary — every page and handler authorizes
// independently. It is still worth locking down, because the PR review found
// that the Component 3 migration had silently dropped the role gate from the
// four `ready:false` placeholders: an analyst could suddenly see `Users`,
// `Engagement` and `Monitoring`, which had been admin-only. 613 tests passed
// through that regression without noticing, because nothing tested the nav.
//
// These tests pin the visible set for every role against the pre-Component-3
// behaviour, entry by entry.

const roleMap = buildRolePermissionMap(permissionRegistry)

/** What the server hands the shell: the actor's resolved permission set. */
const permissionsOf = (roles: AdminRole[]): PermissionId[] => {
  const out = new Set<PermissionId>()
  for (const r of roles) for (const p of permissionsForRole(roleMap, r)) out.add(p)
  return [...out]
}

const visibleFor = (role: AdminRole) =>
  visibleNavItems(NAV, permissionsOf([role]), role, false).map((i) => i.href)

// The exact sidebar each role saw at branch point 35233a4, derived from the
// `minRole` values the migration replaced.
const EXPECTED: Record<AdminRole, string[]> = {
  analyst: ['/admin', '/admin/analytics', '/admin/analytics/auth', '/admin/analytics/activation'],
  moderator: [
    '/admin', '/admin/analytics', '/admin/analytics/auth', '/admin/analytics/activation',
    '/admin/moderation',
  ],
  admin: [
    '/admin', '/admin/analytics', '/admin/analytics/auth', '/admin/analytics/activation',
    '/admin/users', '/admin/moderation', '/admin/engagement', '/admin/audit', '/admin/deals',
    '/admin/monitoring', '/admin/settings',
  ],
  super_admin: NAV.map((i) => i.href),
}

describe('nav visibility — unchanged from the role ladder', () => {
  it.each(Object.keys(EXPECTED) as AdminRole[])('%s sees exactly the entries it saw before', (role) => {
    expect(visibleFor(role)).toEqual(EXPECTED[role])
  })
})

describe('nav visibility — placeholder regression', () => {
  // THE BUG: placeholders carry no `permission`, so `filterByPermission` passes
  // them through unconditionally. Without the role re-gate they are visible to
  // everyone.
  it('REGRESSION: an analyst does NOT see the admin-only placeholders', () => {
    const visible = visibleFor('analyst')

    expect(visible).not.toContain('/admin/users')
    expect(visible).not.toContain('/admin/engagement')
    expect(visible).not.toContain('/admin/monitoring')
    expect(visible).not.toContain('/admin/moderation')
  })

  it('a moderator sees the moderation placeholder but not the admin ones', () => {
    const visible = visibleFor('moderator')

    expect(visible).toContain('/admin/moderation')
    expect(visible).not.toContain('/admin/users')
  })

  it('every placeholder is gated and every ready entry has a permission', () => {
    for (const item of NAV) {
      if (item.ready) {
        expect(item.permission, `${item.href} is ready but has no permission`).toBeDefined()
      } else {
        expect(item.placeholderMinRole, `${item.href} is a placeholder with no role gate`).toBeDefined()
      }
    }
  })
})

describe('nav visibility — Owner isolation', () => {
  it('the Owner sees EVERY entry, including placeholders, holding no role', () => {
    // The Owner holds no role, so a rank comparison alone would hide the
    // placeholders from the one principal who outranks all of them.
    const ownerPermissions = permissionRegistry.all.map((d) => d.id)

    const visible = visibleNavItems(NAV, ownerPermissions, 'analyst', true).map((i) => i.href)

    expect(visible).toEqual(NAV.map((i) => i.href))
  })
})

describe('nav visibility — multiple roles union', () => {
  it('analyst+admin sees the admin sidebar, not the analyst one', () => {
    const visible = visibleNavItems(NAV, permissionsOf(['analyst', 'admin']), 'admin', false)
      .map((i) => i.href)

    expect(visible).toEqual(EXPECTED.admin)
  })

  it('an actor with no roles and no permissions sees nothing', () => {
    expect(visibleNavItems(NAV, [], 'analyst', false)).toEqual([])
  })
})

describe('nav visibility — consistency with the page guards', () => {
  it('every nav permission is a real registry entry', () => {
    for (const item of NAV) {
      if (!item.permission) continue
      expect(permissionRegistry.has(item.permission), `${item.href} → ${item.permission}`).toBe(true)
    }
  })

  it('the analytics entry uses the CONTENT permission its page guards on', () => {
    // The review found this pointing at `analytics.auth.read` — an auth
    // permission gating a content page. Nav and page must agree.
    const analytics = NAV.find((i) => i.href === '/admin/analytics')

    expect(analytics?.permission).toBe(PERMISSIONS.ANALYTICS_CONTENT_READ)
  })
})
