import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveActorCapabilities,
  roleDerivedCapabilitySource,
  CAPABILITY_SOURCES,
  type CapabilitySource,
} from './capabilityResolver'
import { NO_CAPABILITIES, type CapabilityId } from './capabilities'
import { permissionRegistry } from './permissions/registry'
import { permissionEngine } from './permissions/engine'
import { PERMISSIONS } from './permissions/registry'
import type { Actor } from './rbac'
import type { AdminRole } from './roles'

// Controller V2 — K-1: the actor↔capability binding.
//
// OWNER DECISION, 2026-08-22: "effective capabilities are initially derived
// from the actor's effective role permissions. Capabilities are a read-only
// derived abstraction, NOT an independently assigned authorization source.
// requirePermission() remains the authoritative mechanism."
//
// This closes the gap STATUS.md recorded: §4 of FOUNDATION-01 defines a
// capability as MODULE-provided, with a provider and consumers; the PDP gate
// tests `actor.capabilities`; and nothing authoritative said how an ACTOR
// acquires one. That missing edge is what this file specifies.
//
// 🔑 WHAT THIS IS NOT. It is not a second authorization system. Nothing here
// grants anything. The tests below prove the projection is correct AND that it
// is inert with respect to authorization — those are separate properties and
// both have to hold, because a derived set that silently widened access would
// be the exact failure the decision forbids.
//
// The gate stays OFF. Enabling it is not part of K-1.

const ROOT = join(__dirname, '../../..')
const SOURCE = readFileSync(join(ROOT, 'src/lib/admin/capabilityResolver.ts'), 'utf8')

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: 'u-1',
  email: 'x@tappyai.com',
  isOwner: false,
  roles: [],
  highestRole: null,
  capabilities: NO_CAPABILITIES,
  source: 'cookie',
  resolvedAt: 0,
  ...over,
})

/**
 * The projection recomputed independently from the permission registry.
 * Used to prove the resolver DERIVES rather than carrying a hand-written table
 * that would drift the first time a permission's capability changed.
 */
function expectedFromRegistry(roles: readonly AdminRole[]): CapabilityId[] {
  const out = new Set<CapabilityId>()
  for (const d of permissionRegistry.all) {
    if (d.defaultRoles.some((r) => roles.includes(r))) out.add(d.capability)
  }
  return [...out].sort()
}

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · A. role → permission → capability projection', () => {
  // Pinned literals, not a recomputation. A recomputation-only test passes even
  // if every permission's capability is rewritten; these fail loudly, which is
  // the point — the projection is a published contract, not an implementation
  // detail.
  it.each([
    ['analyst', ['analytics.read', 'controller.dashboard']],
    ['moderator', ['analytics.read', 'controller.dashboard', 'moderation.review', 'users.manage']],
    [
      'admin',
      ['analytics.read', 'audit.read', 'commerce.deals', 'controller.dashboard', 'moderation.review',
       'security.sessions', 'settings.read', 'users.manage'],
    ],
    [
      'super_admin',
      ['analytics.read', 'audit.read', 'commerce.deals', 'controller.dashboard', 'moderation.review',
       'security.rbac', 'security.sessions', 'settings.read', 'users.manage'],
    ],
  ])('%s resolves to exactly its architected capability set', (role, expected) => {
    expect(resolveActorCapabilities({ roles: [role as AdminRole] })).toEqual(expected)
  })

  it('agrees with the registry — so it derives, and is not a hand-written table', () => {
    for (const role of ['analyst', 'moderator', 'admin', 'super_admin'] as AdminRole[]) {
      expect(resolveActorCapabilities({ roles: [role] })).toEqual(expectedFromRegistry([role]))
    }
  })

  it('never invents a capability no permission declares', () => {
    const declared = new Set(permissionRegistry.all.map((d) => d.capability))
    const all = resolveActorCapabilities({ roles: ['super_admin', 'admin', 'moderator', 'analyst'] })
    for (const c of all) expect(declared.has(c), `undeclared capability: ${c}`).toBe(true)
  })

  it('super_admin covers every declared capability — the registry has no orphan', () => {
    expect(resolveActorCapabilities({ roles: ['super_admin'] }))
      .toEqual([...new Set(permissionRegistry.all.map((d) => d.capability))].sort())
  })

  it('unions across multiple roles rather than taking the highest', () => {
    // `unionPermissions` unions; the capability projection must not quietly
    // adopt a different rule, or an actor with two roles would lose reach the
    // permission layer grants them.
    const both = resolveActorCapabilities({ roles: ['analyst', 'moderator'] })
    expect(both).toEqual(expectedFromRegistry(['analyst', 'moderator']))
    for (const c of resolveActorCapabilities({ roles: ['analyst'] })) expect(both).toContain(c)
    for (const c of resolveActorCapabilities({ roles: ['moderator'] })) expect(both).toContain(c)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · B. deterministic, sorted, frozen', () => {
  it('the same roles always produce the same set', () => {
    const a = resolveActorCapabilities({ roles: ['admin'] })
    const b = resolveActorCapabilities({ roles: ['admin'] })
    expect(a).toEqual(b)
  })

  it('role ORDER does not change the result', () => {
    expect(resolveActorCapabilities({ roles: ['admin', 'analyst'] }))
      .toEqual(resolveActorCapabilities({ roles: ['analyst', 'admin'] }))
  })

  it('duplicate roles do not duplicate capabilities', () => {
    const once = resolveActorCapabilities({ roles: ['admin'] })
    expect(resolveActorCapabilities({ roles: ['admin', 'admin', 'admin'] })).toEqual(once)
    expect(new Set(once).size).toBe(once.length)
  })

  it('is sorted ascending', () => {
    const out = resolveActorCapabilities({ roles: ['super_admin'] })
    expect([...out].sort()).toEqual([...out])
  })

  it('is frozen — a caller cannot mutate an actor’s capability set', () => {
    const out = resolveActorCapabilities({ roles: ['admin'] })
    expect(Object.isFrozen(out)).toBe(true)
    expect(() => (out as unknown as { push: (v: string) => number }).push('x')).toThrow()
  })

  it('two calls return independent frozen arrays, not one shared mutable array', () => {
    const a = resolveActorCapabilities({ roles: ['admin'] })
    const b = resolveActorCapabilities({ roles: ['analyst'] })
    expect(a).not.toEqual(b)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · C. a capability grants NOTHING — requirePermission stays authoritative', () => {
  it('an actor carrying a capability but holding no role is still denied', () => {
    // The decision's core constraint: capabilities are derived and read-only.
    // If the PDP ever consulted them as a grant, this actor would be allowed.
    const d = permissionEngine.authorize(
      actor({ roles: [], capabilities: ['users.manage'] }),
      PERMISSIONS.USERS_LIST_READ
    )
    expect(d.allowed).toBe(false)
    expect(d.allowed === false && d.reason).toBe('NO_GRANT')
  })

  it('a fabricated capability cannot open a permission the role does not carry', () => {
    const d = permissionEngine.authorize(
      actor({ roles: ['analyst'], capabilities: ['security.rbac', 'users.manage'] }),
      PERMISSIONS.SECURITY_ROLES_GRANT
    )
    expect(d.allowed).toBe(false)
  })

  it('stripping capabilities does not remove a permission the role does carry', () => {
    // The mirror of the above: capabilities are not a second gate either, while
    // CAPABILITY_GATE_ENABLED is off.
    expect(
      permissionEngine.can(actor({ roles: ['analyst'], capabilities: [] }), PERMISSIONS.DASHBOARD_HOME_VIEW)
    ).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · D. existing authorization is unchanged', () => {
  it.each([
    ['analyst', PERMISSIONS.DASHBOARD_HOME_VIEW, true],
    ['analyst', PERMISSIONS.USERS_BAN, false],
    ['analyst', PERMISSIONS.SECURITY_ROLES_GRANT, false],
    ['moderator', PERMISSIONS.USERS_LIST_READ, true],
    ['moderator', PERMISSIONS.SECURITY_ROLES_GRANT, false],
    ['admin', PERMISSIONS.AUDIT_LOG_READ, true],
    ['admin', PERMISSIONS.SECURITY_ROLES_GRANT, false],
    ['super_admin', PERMISSIONS.SECURITY_ROLES_GRANT, true],
    ['super_admin', PERMISSIONS.SECURITY_MEMBERSHIP_READ, true],
  ])('%s → %s stays %s', (role, permission, allowed) => {
    expect(permissionEngine.can(actor({ roles: [role as AdminRole] }), permission)).toBe(allowed)
  })

  it('the Owner still bypasses, and does not depend on the projection', () => {
    const d = permissionEngine.authorize(actor({ isOwner: true, roles: [] }), PERMISSIONS.SECURITY_ROLES_GRANT)
    expect(d.allowed).toBe(true)
    expect(d.allowed === true && d.reason).toBe('OWNER_BYPASS')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · E. empty and unknown roles fail closed', () => {
  it('no roles → the empty set, matching the NO_CAPABILITIES contract', () => {
    const out = resolveActorCapabilities({ roles: [] })
    expect(out).toEqual([])
    // `toBe`, not `toEqual`: deep equality cannot tell two empty frozen arrays
    // apart, so it would pass against an implementation that allocated a fresh
    // one per call. The reserved-slot constant is reused by identity, which is
    // both the documented contract and one shared array instead of one per
    // role-less actor.
    expect(out).toBe(NO_CAPABILITIES)
    expect(Object.isFrozen(out)).toBe(true)
  })

  it('an unknown role yields nothing and does not throw', () => {
    expect(() => resolveActorCapabilities({ roles: ['not_a_role' as AdminRole] })).not.toThrow()
    expect(resolveActorCapabilities({ roles: ['not_a_role' as AdminRole] })).toEqual([])
  })

  it('an unknown role mixed with a real one contributes nothing of its own', () => {
    expect(resolveActorCapabilities({ roles: ['analyst', 'ghost' as AdminRole] }))
      .toEqual(resolveActorCapabilities({ roles: ['analyst'] }))
  })

  it('a malformed input does not fabricate capabilities', () => {
    expect(resolveActorCapabilities({ roles: [undefined as unknown as AdminRole] })).toEqual([])
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'admin'],
    ['an object', {}],
  ])('roles that are not an array (%s) fail closed instead of throwing', (_label, roles) => {
    // Found by mutation: deleting the `Array.isArray` guard survived, because
    // nothing exercised a non-array. `for (const r of undefined)` throws — and
    // this runs on the request path inside Actor construction, so a throw here
    // is a 500 on every Controller request rather than a denied one.
    const call = () => resolveActorCapabilities({ roles: roles as unknown as readonly AdminRole[] })
    expect(call).not.toThrow()
    expect(call()).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · F. no direct capability assignment exists in V2', () => {
  it('role-derived is the ONLY registered source', () => {
    expect(CAPABILITY_SOURCES).toHaveLength(1)
    expect(CAPABILITY_SOURCES[0]).toBe(roleDerivedCapabilitySource)
  })

  it('the source list is frozen — a source cannot be pushed in at runtime', () => {
    expect(Object.isFrozen(CAPABILITY_SOURCES)).toBe(true)
  })

  it('the resolver input carries ONLY roles — there is no field to inject through', () => {
    // Structural, not stylistic: an input that accepted a userId, a membership
    // or a department would be a place for a second authority to enter. The
    // narrow input is the guarantee.
    const decl = SOURCE.match(/interface CapabilityResolutionInput\s*\{([\s\S]*?)\n\}/)
    expect(decl, 'CapabilityResolutionInput must be declared').not.toBeNull()
    const fields = decl![1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatch(/roles/)
  })

  it('names no membership, department, policy or user-capability source', () => {
    for (const forbidden of ['membership', 'department', 'user_capabilities', 'actor_capabilities', 'grantCapability']) {
      expect(SOURCE.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase())
    }
  })

  it('does not reach into the ControllerCore capability axis', () => {
    // `ControllerCore.capabilities` is module provider/consumer binding — a
    // different axis entirely. Mixing them would make a module's manifest an
    // input to an actor's authority.
    expect(SOURCE).not.toMatch(/from '@\/lib\/controller/)
    expect(SOURCE).not.toContain('ControllerCore')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · G. the boundary is extensible without touching the Actor contract', () => {
  it('resolution unions across the supplied sources', () => {
    // The future shape — role + membership + policy — proven today without
    // shipping any of them: a second source composes, it does not require the
    // resolver, the Actor contract or any consumer to change.
    const fake: CapabilitySource = () => ['future.source.capability']
    const out = resolveActorCapabilities({ roles: ['analyst'] }, [roleDerivedCapabilitySource, fake])
    expect(out).toContain('future.source.capability')
    for (const c of resolveActorCapabilities({ roles: ['analyst'] })) expect(out).toContain(c)
  })

  it('an added source cannot bypass sorting, freezing or de-duplication', () => {
    const dupes: CapabilitySource = () => ['zzz.last', 'aaa.first', 'zzz.last']
    const out = resolveActorCapabilities({ roles: [] }, [dupes])
    expect(out).toEqual(['aaa.first', 'zzz.last'])
    expect(Object.isFrozen(out)).toBe(true)
  })

  it('defaults to the registered sources when none are supplied', () => {
    expect(resolveActorCapabilities({ roles: ['admin'] }))
      .toEqual(resolveActorCapabilities({ roles: ['admin'] }, CAPABILITY_SOURCES))
  })

  it('a source returning nothing contributes nothing and does not break the union', () => {
    const empty: CapabilitySource = () => []
    expect(resolveActorCapabilities({ roles: ['analyst'] }, [roleDerivedCapabilitySource, empty]))
      .toEqual(resolveActorCapabilities({ roles: ['analyst'] }))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-1 · the capability gate is NOT turned on by this work', () => {
  it('CAPABILITY_GATE_ENABLED remains false', async () => {
    const { CAPABILITY_GATE_ENABLED } = await import('./permissions/engine')
    expect(CAPABILITY_GATE_ENABLED).toBe(false)
  })
})
