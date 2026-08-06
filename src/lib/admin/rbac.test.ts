import { describe, it, expect, vi, beforeEach } from 'vitest'

// Covers the Component 2 identity path: resolveActor is the SINGLE Actor
// construction site. The Owner-Gate-before-authorization ordering it used to
// pin here moved to permissions/apiGuard.test.ts when Component 4 deleted
// `requireAdminRole`.

const h = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  isPlatformOwner: vi.fn(),
  checkOwnerGate: vi.fn(),
  rolesQuery: vi.fn(),
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/admin/owner', () => ({
  isPlatformOwner: h.isPlatformOwner,
  checkOwnerGate: h.checkOwnerGate,
  invalidateOwnerCache: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: h.rolesQuery }) }),
  }),
}))

import { resolveActor, requireOwner, invalidateRoleCache, AdminError } from './rbac'

const USER = { id: 'u1', email: 'a@b.c' }
const req = (headers?: Record<string, string>) =>
  new Request('http://localhost/api/admin/x', { headers })

beforeEach(() => {
  vi.clearAllMocks()
  invalidateRoleCache('u1') // principal cache is module-level; reset between tests
  h.getRequestUser.mockResolvedValue({ user: USER })
  h.isPlatformOwner.mockResolvedValue(false)
  h.checkOwnerGate.mockResolvedValue({ ok: true, enforced: false })
  h.rolesQuery.mockResolvedValue({ data: [{ role: 'admin', expires_at: null }], error: null })
})

describe('resolveActor', () => {
  it('returns null when unauthenticated', async () => {
    h.getRequestUser.mockResolvedValue({ user: null })
    await expect(resolveActor(req())).resolves.toBeNull()
  })

  it('builds an Actor with roles[] and capabilities[]', async () => {
    const r = await resolveActor(req())
    expect(r?.actor).toMatchObject({
      userId: 'u1',
      email: 'a@b.c',
      isOwner: false,
      roles: ['admin'],
      highestRole: 'admin',
      capabilities: [],
      source: 'cookie',
    })
  })

  it('returns ALL active roles, not just the highest', async () => {
    h.rolesQuery.mockResolvedValue({
      data: [
        { role: 'analyst', expires_at: null },
        { role: 'admin', expires_at: null },
      ],
      error: null,
    })
    const r = await resolveActor(req())
    expect(r?.actor.roles).toEqual(['analyst', 'admin'])
    expect(r?.actor.highestRole).toBe('admin')
  })

  it('filters out expired role grants', async () => {
    h.rolesQuery.mockResolvedValue({
      data: [
        { role: 'admin', expires_at: '2000-01-01T00:00:00Z' },
        { role: 'analyst', expires_at: null },
      ],
      error: null,
    })
    const r = await resolveActor(req())
    expect(r?.actor.roles).toEqual(['analyst'])
  })

  // isOwner must never be inferred from a role — it is a separate principal.
  it('reads isOwner from the owner module, not from admin_roles', async () => {
    h.isPlatformOwner.mockResolvedValue(true)
    h.rolesQuery.mockResolvedValue({ data: [], error: null })
    const r = await resolveActor(req())
    expect(r?.actor.isOwner).toBe(true)
    expect(r?.actor.roles).toEqual([])
  })

  it('detects a bearer (native) request', async () => {
    const r = await resolveActor(req({ authorization: 'Bearer tok' }))
    expect(r?.actor.source).toBe('bearer')
  })
})

// Component 4 deleted `requireAdminRole`. Its five tests moved to
// permissions/apiGuard.test.ts, retargeted at `requirePermission` — including
// the two that pin the Owner-Gate-before-authorization ordering.

describe('requireOwner', () => {
  const ctx = (isOwner: boolean) =>
    ({ actor: { isOwner } }) as unknown as Parameters<typeof requireOwner>[0]

  it('throws 403 for a non-owner', () => {
    expect(() => requireOwner(ctx(false), 'grant super_admin')).toThrow(AdminError)
    try {
      requireOwner(ctx(false), 'grant super_admin')
    } catch (e) {
      expect((e as AdminError).status).toBe(403)
    }
  })

  it('passes for the Platform Owner', () => {
    expect(() => requireOwner(ctx(true), 'grant super_admin')).not.toThrow()
  })
})
