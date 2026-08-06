import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controller V2 — Component 3: the INVALIDATION WIRE.
//
// The permission cache has two independent defences against stale privilege:
//
//   1. entries are keyed on the role set they were computed from, and
//   2. `invalidateRoleCache()` drops them explicitly on grant/revoke.
//
// Defence 1 is covered in `engine.test.ts`. Defence 2 was NOT covered anywhere
// — the review found `invalidateRoleCache -> permissionCache.invalidate` had no
// assertion behind it, so the wire could have been cut by a refactor and every
// test would still pass. This file covers the wire itself.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/admin/owner', () => ({
  isPlatformOwner: vi.fn(async () => false),
  checkOwnerGate: vi.fn(async () => ({ ok: true })),
}))

import { invalidateRoleCache, type Actor } from '@/lib/admin/rbac'
import { permissionCache } from './cache'
import { permissionEngine } from './engine'
import { PERMISSIONS, REGISTRY_VERSION } from './registry'

const USER = 'u-invalidation'

const actor = (roles: Actor['roles']): Actor => ({
  userId: USER,
  email: 'a@b.c',
  isOwner: false,
  roles,
  highestRole: roles[roles.length - 1] ?? null,
  capabilities: [],
  source: 'cookie',
  resolvedAt: 0,
})

beforeEach(() => {
  permissionCache.clear()
})

describe('invalidateRoleCache — the grant/revoke wire', () => {
  it('populates the permission cache on first resolve', () => {
    expect(permissionCache.get(USER, ['admin'], REGISTRY_VERSION)).toBeUndefined()

    permissionEngine.resolve(actor(['admin']))

    expect(permissionCache.get(USER, ['admin'], REGISTRY_VERSION)).toBeDefined()
  })

  it('REVOKE FLOW: invalidateRoleCache drops the cached permission set', () => {
    permissionEngine.resolve(actor(['admin']))
    expect(permissionCache.get(USER, ['admin'], REGISTRY_VERSION)).toBeDefined()

    // This is the call both /api/admin/rbac/roles handlers make after a
    // successful grant or revoke. If it stopped clearing the permission cache,
    // a revoked admin would keep their permissions until TTL.
    invalidateRoleCache(USER)

    expect(permissionCache.get(USER, ['admin'], REGISTRY_VERSION)).toBeUndefined()
  })

  it('REVOKE FLOW: a demoted actor loses access immediately, not after TTL', () => {
    const wasAdmin = actor(['admin'])
    expect(permissionEngine.can(wasAdmin, PERMISSIONS.COMMERCE_DEALS_DELETE)).toBe(true)

    invalidateRoleCache(USER)
    const nowAnalyst = actor(['analyst'])

    expect(permissionEngine.can(nowAnalyst, PERMISSIONS.COMMERCE_DEALS_DELETE)).toBe(false)
  })

  it('GRANT FLOW: a promoted actor gains access immediately', () => {
    const wasAnalyst = actor(['analyst'])
    expect(permissionEngine.can(wasAnalyst, PERMISSIONS.AUDIT_LOG_READ)).toBe(false)

    invalidateRoleCache(USER)

    expect(permissionEngine.can(actor(['analyst', 'admin']), PERMISSIONS.AUDIT_LOG_READ)).toBe(true)
  })

  it('MULTI-ROLE UPDATE: dropping one of two roles narrows the set', () => {
    const both = actor(['analyst', 'admin'])
    expect(permissionEngine.can(both, PERMISSIONS.COMMERCE_DEALS_DELETE)).toBe(true)

    invalidateRoleCache(USER)

    const onlyAnalyst = actor(['analyst'])
    expect(permissionEngine.can(onlyAnalyst, PERMISSIONS.COMMERCE_DEALS_DELETE)).toBe(false)
    expect(permissionEngine.can(onlyAnalyst, PERMISSIONS.ANALYTICS_AUTH_READ)).toBe(true)
  })

  it('ADVERSARIAL: even with invalidation NEVER called, a revoked role cannot authorize', () => {
    // The failure this system must not have. Defence 2 is deliberately skipped
    // here so defence 1 is tested alone: the cached entry remembers the role
    // set it was computed from, so a narrower set can never hit it.
    permissionEngine.resolve(actor(['admin']))

    const demoted = actor(['analyst'])

    expect(permissionEngine.can(demoted, PERMISSIONS.COMMERCE_DEALS_DELETE)).toBe(false)
    expect(permissionCache.get(USER, ['analyst'], REGISTRY_VERSION)).toBeDefined()
  })

  it('invalidating one user does not disturb another', () => {
    permissionEngine.resolve(actor(['admin']))
    const other = { ...actor(['admin']), userId: 'u-other' }
    permissionEngine.resolve(other)

    invalidateRoleCache(USER)

    expect(permissionCache.get(USER, ['admin'], REGISTRY_VERSION)).toBeUndefined()
    expect(permissionCache.get('u-other', ['admin'], REGISTRY_VERSION)).toBeDefined()
  })
})
