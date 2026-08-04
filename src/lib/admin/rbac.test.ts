import { describe, it, expect, vi, beforeEach } from 'vitest'

// Covers the Component 2 identity path: resolveActor is the SINGLE Actor
// construction site and requireAdminRole delegates to it. Also pins the
// Owner-Gate-before-RBAC ordering, which is a security property, not a detail.

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

import { resolveActor, requireAdminRole, requireOwner, invalidateRoleCache, AdminError } from './rbac'

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

describe('requireAdminRole', () => {
  it('401 when unauthenticated', async () => {
    h.getRequestUser.mockResolvedValue({ user: null })
    await expect(requireAdminRole(req(), 'admin')).rejects.toMatchObject({ status: 401 })
  })

  it('403 when the role is insufficient', async () => {
    h.rolesQuery.mockResolvedValue({ data: [{ role: 'analyst', expires_at: null }], error: null })
    await expect(requireAdminRole(req(), 'super_admin')).rejects.toMatchObject({ status: 403 })
  })

  it('returns user, role and actor on success', async () => {
    const ctx = await requireAdminRole(req(), 'admin')
    expect(ctx.user.id).toBe('u1')
    expect(ctx.role).toBe('admin')
    expect(ctx.actor.roles).toEqual(['admin'])
  })

  // SECURITY ORDERING: the ownership assertion must be evaluated before the RBAC
  // decision. Proven by giving a user who would ALSO fail the role check — the
  // error returned must be the gate's, not the role's.
  it('evaluates the Owner Gate BEFORE the RBAC role check', async () => {
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_MISMATCH' })
    h.rolesQuery.mockResolvedValue({ data: [{ role: 'analyst', expires_at: null }], error: null })
    await expect(requireAdminRole(req(), 'super_admin')).rejects.toThrow(/ownership assertion failed/)
  })

  it('denies even a valid super_admin when the gate fails', async () => {
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_SET_BUT_NO_OWNER' })
    h.rolesQuery.mockResolvedValue({ data: [{ role: 'super_admin', expires_at: null }], error: null })
    await expect(requireAdminRole(req(), 'admin')).rejects.toThrow(/ownership assertion failed/)
  })
})

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
