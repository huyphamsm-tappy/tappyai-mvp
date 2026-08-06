import { describe, it, expect, beforeEach } from 'vitest'
import type { Actor } from '@/lib/admin/rbac'
import type { AdminRole } from '@/lib/admin/roles'
import { createRegistry, permissionRegistry, PERMISSIONS } from './registry'
import type { PermissionDefinition } from './types'
import { createPermissionCache, rolesCacheKey } from './cache'
import { buildRolePermissionMap, unionPermissions, permissionsForRole } from './roleMap'
import { createPermissionEngine, permissionEngine } from './engine'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
//
// The engine takes an injectable registry so behaviour like `deprecated` can be
// exercised without inventing a fake entry in the production catalogue. The
// real registry is also tested directly, further down.
// ─────────────────────────────────────────────────────────────────────────────

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: 'u1',
  email: 'a@b.c',
  isOwner: false,
  roles: [],
  highestRole: null,
  capabilities: [],
  source: 'cookie',
  resolvedAt: 0,
  ...over,
})

const perm = (
  id: string,
  defaultRoles: AdminRole[],
  over: Partial<PermissionDefinition> = {}
): PermissionDefinition => ({
  id,
  displayName: id,
  description: `test permission ${id}`,
  module: id.split('.')[0],
  capability: 'test.capability',
  category: 'read',
  riskLevel: 'low',
  defaultRoles,
  ...over,
})

const FIXTURE = [
  perm('test.read.basic', ['analyst', 'moderator', 'admin', 'super_admin']),
  perm('test.write.thing', ['admin', 'super_admin']),
  perm('test.destroy.thing', ['super_admin'], { category: 'destructive', riskLevel: 'critical' }),
  perm('mod.moderate.content', ['moderator']),
  perm('test.legacy.thing', ['admin'], {
    deprecated: { since: '2026-08-04', reason: 'superseded', replacedBy: 'test.write.thing' },
  }),
  perm('cap.gated.thing', ['admin'], { capability: 'cap.available' }),
] as const

function freshEngine(opts: { capabilityGateEnabled?: boolean } = {}) {
  const registry = createRegistry(FIXTURE, 'test-v1')
  const cache = createPermissionCache(1000)
  return { engine: createPermissionEngine(registry, cache, opts), cache, registry }
}

beforeEach(() => {
  permissionEngine.clearCache()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('1. permission inheritance', () => {
  it('a permission declared for several roles is held by each of them', () => {
    const { engine } = freshEngine()
    for (const role of ['analyst', 'moderator', 'admin', 'super_admin'] as AdminRole[]) {
      expect(engine.can(actor({ roles: [role] }), 'test.read.basic')).toBe(true)
    }
  })

  it('a higher-ranked role does NOT inherit a permission it was not declared for', () => {
    // The deliberate break from ROLE_RANK: super_admin outranks moderator, but
    // only moderator declares mod.moderate.content, so super_admin does not
    // hold it. A ladder cannot express this; the registry can.
    const { engine } = freshEngine()
    expect(engine.can(actor({ roles: ['moderator'] }), 'mod.moderate.content')).toBe(true)
    expect(engine.can(actor({ roles: ['super_admin'] }), 'mod.moderate.content')).toBe(false)
  })

  it('a lower role does not receive a higher role’s permission', () => {
    const { engine } = freshEngine()
    expect(engine.can(actor({ roles: ['analyst'] }), 'test.destroy.thing')).toBe(false)
  })
})

describe('2. multiple roles', () => {
  it('permissions are the UNION across all roles, not the maximum', () => {
    const { engine } = freshEngine()
    const multi = actor({ roles: ['moderator', 'admin'] })
    expect(engine.can(multi, 'mod.moderate.content')).toBe(true) // from moderator
    expect(engine.can(multi, 'test.write.thing')).toBe(true) // from admin
  })

  it('role order does not change the resolved set', () => {
    const { engine } = freshEngine()
    const a = engine.resolve(actor({ userId: 'x', roles: ['admin', 'moderator'] })).permissions
    engine.clearCache()
    const b = engine.resolve(actor({ userId: 'x', roles: ['moderator', 'admin'] })).permissions
    expect(a).toEqual(b)
  })

  it('an actor with no roles holds nothing', () => {
    const { engine } = freshEngine()
    expect(engine.resolve(actor({ roles: [] })).permissions).toEqual([])
    expect(engine.can(actor({ roles: [] }), 'test.read.basic')).toBe(false)
  })
})

describe('3. cache invalidation', () => {
  it('a second resolve is served from cache', () => {
    const { engine, cache } = freshEngine()
    const a = actor({ roles: ['admin'] })
    engine.resolve(a)
    engine.resolve(a)
    expect(cache.stats().hits).toBe(1)
  })

  it('explicit invalidation forces recomputation', () => {
    const { engine, cache } = freshEngine()
    const a = actor({ roles: ['admin'] })
    engine.resolve(a)
    engine.invalidate(a.userId)
    engine.resolve(a)
    expect(cache.stats().hits).toBe(0)
    expect(cache.stats().misses).toBe(2)
  })

  // The property that matters most: a revoked role must stop authorizing even
  // if nobody remembered to invalidate, because the entry is keyed on the roles.
  it('NO STALE ESCALATION: changing roles cannot hit a previous entry', () => {
    const { engine } = freshEngine()
    const before = actor({ userId: 'u9', roles: ['admin'] })
    expect(engine.can(before, 'test.write.thing')).toBe(true)

    const afterRevoke = actor({ userId: 'u9', roles: ['analyst'] })
    expect(engine.can(afterRevoke, 'test.write.thing')).toBe(false)
  })

  it('VERSION SAFE: a registry version change discards cached sets', () => {
    const cache = createPermissionCache(60_000)
    const v1 = createPermissionEngine(createRegistry(FIXTURE, 'v1'), cache)
    const a = actor({ roles: ['admin'] })
    v1.resolve(a)

    const widened = [...FIXTURE, perm('test.new.thing', ['admin'])]
    const v2 = createPermissionEngine(createRegistry(widened, 'v2'), cache)
    expect(v2.can(a, 'test.new.thing')).toBe(true)
  })

  it('entries expire on TTL', () => {
    const cache = createPermissionCache(1000)
    const { registry } = freshEngine()
    const engine = createPermissionEngine(registry, cache)
    const a = actor({ roles: ['admin'] })
    engine.resolve(a, 0)
    expect(cache.get(a.userId, a.roles, registry.version, 500)).toBeDefined()
    expect(cache.get(a.userId, a.roles, registry.version, 1001)).toBeUndefined()
  })

  it('DETERMINISTIC: repeated resolution yields identical, sorted output', () => {
    const { engine } = freshEngine()
    const a = actor({ roles: ['admin', 'moderator'] })
    const first = [...engine.resolve(a).permissions]
    engine.clearCache()
    const second = [...engine.resolve(a).permissions]
    expect(first).toEqual(second)
    expect(first).toEqual([...first].sort())
  })

  it('rolesCacheKey is order-insensitive and collision-resistant', () => {
    expect(rolesCacheKey(['admin', 'analyst'])).toBe(rolesCacheKey(['analyst', 'admin']))
    expect(rolesCacheKey(['admin'])).not.toBe(rolesCacheKey(['admin', 'analyst']))
  })
})

describe('4. unknown permission', () => {
  it('denies with UNKNOWN_PERMISSION and does not fail open', () => {
    const { engine } = freshEngine()
    const d = engine.authorize(actor({ roles: ['super_admin'] }), 'does.not.exist')
    expect(d.allowed).toBe(false)
    expect(d.allowed === false && d.reason).toBe('UNKNOWN_PERMISSION')
  })

  it('a super_admin is still denied an undeclared permission', () => {
    const { engine } = freshEngine()
    expect(engine.can(actor({ roles: ['super_admin'] }), 'totally.made.up')).toBe(false)
  })
})

describe('5. deprecated permission', () => {
  it('still authorizes — deprecation is a migration signal, not a revocation', () => {
    const { engine } = freshEngine()
    expect(engine.can(actor({ roles: ['admin'] }), 'test.legacy.thing')).toBe(true)
  })

  it('is reported so holders can be migrated', () => {
    const { engine } = freshEngine()
    const held = engine.deprecatedHeldBy(actor({ roles: ['admin'] }))
    expect(held.map((d) => d.id)).toContain('test.legacy.thing')
    expect(held[0].deprecated?.replacedBy).toBe('test.write.thing')
  })

  it('is not reported for an actor who does not hold it', () => {
    const { engine } = freshEngine()
    expect(engine.deprecatedHeldBy(actor({ roles: ['analyst'] }))).toEqual([])
  })
})

describe('6. permission conflicts', () => {
  it('the same permission from two roles resolves once, with no duplication', () => {
    const { engine } = freshEngine()
    const perms = engine.resolve(actor({ roles: ['admin', 'super_admin'] })).permissions
    expect(perms.filter((p) => p === 'test.write.thing')).toHaveLength(1)
    expect(new Set(perms).size).toBe(perms.length)
  })

  it('a registry with a duplicate id is rejected at construction', () => {
    // Two definitions for one id would make authorization depend on array order.
    expect(() =>
      createRegistry([perm('dup.a.b', ['admin']), perm('dup.a.b', ['analyst'])], 'bad')
    ).toThrow(/duplicate permission id/)
  })

  it('roles never subtract: adding a role can only widen the set', () => {
    const { engine } = freshEngine()
    const one = engine.resolve(actor({ userId: 'p1', roles: ['admin'] })).permissions
    const two = engine.resolve(actor({ userId: 'p2', roles: ['admin', 'analyst'] })).permissions
    for (const p of one) expect(two).toContain(p)
  })
})

describe('7. missing registry entry', () => {
  it('an empty registry denies everything except the Owner', () => {
    const engine = createPermissionEngine(createRegistry([], 'empty'), createPermissionCache())
    expect(engine.can(actor({ roles: ['super_admin'] }), 'test.read.basic')).toBe(false)
    expect(engine.can(actor({ isOwner: true }), 'test.read.basic')).toBe(true)
  })

  it('a role with no declared permissions resolves to an empty set', () => {
    const registry = createRegistry([perm('only.admin.thing', ['admin'])], 'v')
    const map = buildRolePermissionMap(registry)
    expect([...permissionsForRole(map, 'analyst')]).toEqual([])
    expect(unionPermissions(map, ['analyst'])).toEqual([])
  })
})

describe('8. unauthorized access', () => {
  it('denies with NO_GRANT and names the roles that would hold it', () => {
    const { engine } = freshEngine()
    const d = engine.authorize(actor({ roles: ['analyst'] }), 'test.destroy.thing')
    expect(d.allowed).toBe(false)
    expect(d.allowed === false && d.reason).toBe('NO_GRANT')
    expect(d.allowed === false && d.detail).toContain('super_admin')
  })

  it('denies an unauthenticated actor with UNAUTHENTICATED', () => {
    const { engine } = freshEngine()
    const d = engine.authorize(null, 'test.read.basic')
    expect(d.allowed).toBe(false)
    expect(d.allowed === false && d.reason).toBe('UNAUTHENTICATED')
  })
})

describe('9. authorized access', () => {
  it('allows with ROLE_GRANT', () => {
    const { engine } = freshEngine()
    const d = engine.authorize(actor({ roles: ['admin'] }), 'test.write.thing')
    expect(d.allowed).toBe(true)
    expect(d.allowed === true && d.reason).toBe('ROLE_GRANT')
  })
})

describe('10. Owner bypass', () => {
  it('the Owner is allowed even with NO roles', () => {
    const { engine } = freshEngine()
    const d = engine.authorize(actor({ isOwner: true, roles: [] }), 'test.destroy.thing')
    expect(d.allowed).toBe(true)
    expect(d.allowed === true && d.reason).toBe('OWNER_BYPASS')
  })

  it('the Owner bypasses the registry entirely — even an unknown permission', () => {
    // Owner is outside RBAC: it does not depend on the registry being correct.
    const { engine } = freshEngine()
    const d = engine.authorize(actor({ isOwner: true }), 'not.in.registry')
    expect(d.allowed).toBe(true)
    expect(d.allowed === true && d.reason).toBe('OWNER_BYPASS')
  })

  it('Owner bypass does not populate or depend on the cache', () => {
    const { engine, cache } = freshEngine()
    engine.authorize(actor({ isOwner: true, roles: [] }), 'test.read.basic')
    expect(cache.stats().size).toBe(0)
  })

  it('listPermissions reports the full catalogue for the Owner', () => {
    const { engine, registry } = freshEngine()
    expect(engine.listPermissions(actor({ isOwner: true, roles: [] })).length).toBe(
      registry.all.length
    )
  })

  it('OWNER IS NOT A ROLE: no permission may declare an owner role', () => {
    for (const d of permissionRegistry.all) {
      expect(d.defaultRoles as readonly string[]).not.toContain('owner')
    }
  })

  it('OWNER IS NOT A PERMISSION: no registry entry grants ownership', () => {
    for (const d of permissionRegistry.all) {
      expect(d.id).not.toMatch(/(^|\.)owner(\.|$)/)
    }
  })
})

describe('11. capability integration', () => {
  it('capability metadata is recorded on every permission', () => {
    for (const d of permissionRegistry.all) {
      expect(typeof d.capability).toBe('string')
      expect(d.capability.length).toBeGreaterThan(0)
    }
  })

  it('the capability gate is INERT by default — empty capabilities do not deny', () => {
    // Actor.capabilities is NO_CAPABILITIES until Component 5. Gating on it now
    // would deny every actor, so the gate must be off.
    const { engine } = freshEngine()
    expect(engine.can(actor({ roles: ['admin'], capabilities: [] }), 'cap.gated.thing')).toBe(true)
  })

  it('when enabled, a missing capability denies with CAPABILITY_UNAVAILABLE', () => {
    const { engine } = freshEngine({ capabilityGateEnabled: true })
    const d = engine.authorize(actor({ roles: ['admin'], capabilities: [] }), 'cap.gated.thing')
    expect(d.allowed).toBe(false)
    expect(d.allowed === false && d.reason).toBe('CAPABILITY_UNAVAILABLE')
  })

  it('when enabled, a present capability allows', () => {
    const { engine } = freshEngine({ capabilityGateEnabled: true })
    expect(
      engine.can(actor({ roles: ['admin'], capabilities: ['cap.available'] }), 'cap.gated.thing')
    ).toBe(true)
  })

  it('the Owner bypasses the capability gate too', () => {
    const { engine } = freshEngine({ capabilityGateEnabled: true })
    expect(engine.can(actor({ isOwner: true, capabilities: [] }), 'cap.gated.thing')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('production registry integrity', () => {
  it('every permission id matches <module>.<resource>.<action>', () => {
    for (const d of permissionRegistry.all) {
      expect(d.id).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
    }
  })

  it('every permission declares complete metadata', () => {
    for (const d of permissionRegistry.all) {
      expect(d.displayName.length).toBeGreaterThan(0)
      expect(d.description.length).toBeGreaterThan(0)
      expect(d.module.length).toBeGreaterThan(0)
      expect(['read', 'write', 'destructive', 'security']).toContain(d.category)
      expect(['low', 'medium', 'high', 'critical']).toContain(d.riskLevel)
      expect(d.defaultRoles.length).toBeGreaterThan(0)
    }
  })

  it('the id prefix matches the declared module', () => {
    for (const d of permissionRegistry.all) {
      expect(d.id.split('.')[0]).toBe(d.module)
    }
  })

  it('every PERMISSIONS constant resolves to a real registry entry', () => {
    for (const id of Object.values(PERMISSIONS)) {
      expect(permissionRegistry.has(id)).toBe(true)
    }
  })

  it('every registry entry has a PERMISSIONS constant — no unreachable permissions', () => {
    const constants = new Set<string>(Object.values(PERMISSIONS))
    for (const d of permissionRegistry.all) expect(constants.has(d.id)).toBe(true)
  })

  // The meaningful invariant is about the CATEGORY, not the module: a
  // security-category permission mutates who holds power, so it must be
  // critical. Reading role assignments lives in the same module but is only
  // medium — an earlier version of this test conflated the two.
  it('every security-CATEGORY permission is critical risk', () => {
    for (const d of permissionRegistry.all) {
      if (d.category === 'security') expect(d.riskLevel).toBe('critical')
    }
  })

  it('destructive-category permissions are at least high risk', () => {
    for (const d of permissionRegistry.all) {
      if (d.category === 'destructive') expect(['high', 'critical']).toContain(d.riskLevel)
    }
  })

  it('read-category permissions are never critical', () => {
    for (const d of permissionRegistry.all) {
      if (d.category === 'read') expect(d.riskLevel).not.toBe('critical')
    }
  })

  it('analyst holds only read-category permissions', () => {
    const map = buildRolePermissionMap(permissionRegistry)
    for (const id of permissionsForRole(map, 'analyst')) {
      expect(permissionRegistry.get(id)?.category).toBe('read')
    }
  })

  it('no role except super_admin holds a security-category permission', () => {
    const map = buildRolePermissionMap(permissionRegistry)
    for (const role of ['analyst', 'moderator', 'admin'] as AdminRole[]) {
      for (const id of permissionsForRole(map, role)) {
        expect(permissionRegistry.get(id)?.category).not.toBe('security')
      }
    }
  })
})
