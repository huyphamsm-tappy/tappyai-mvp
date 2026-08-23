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

// FOUNDATION-10C: a VERIFIED CORPORATE identity. The previous fixture was
// `a@b.c`, which the corporate boundary now (correctly) refuses — the identity
// an Actor is built from must be a Supabase-confirmed @tappyai.com mailbox.
const USER = {
  id: 'u1',
  email: 'a@tappyai.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  is_anonymous: false,
}
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

  // UPDATED for K-1 (Owner Decision D-K1, 2026-08-22). This asserted
  // `capabilities: []`, which encoded the pre-K-1 contract — "the Capability
  // Registry is not installed". Capabilities are now DERIVED from the actor's
  // effective role permissions, so an `admin` projects a real set.
  //
  // The expectation is pinned to the exact eight rather than loosened to
  // "an array": the old assertion was strong, and replacing a strong wrong
  // expectation with a weak right one would trade a caught regression for an
  // uncaught one. `capabilityResolver.test.ts` owns the projection contract;
  // this test owns the fact that `resolveActor` actually applies it.
  it('builds an Actor with roles[] and derived capabilities[]', async () => {
    const r = await resolveActor(req())
    expect(r?.actor).toMatchObject({
      userId: 'u1',
      email: 'a@tappyai.com',
      isOwner: false,
      roles: ['admin'],
      highestRole: 'admin',
      capabilities: [
        'analytics.read', 'audit.read', 'commerce.deals', 'controller.dashboard',
        'moderation.review', 'security.sessions', 'settings.read', 'users.manage',
      ],
      source: 'cookie',
    })
  })

  it('an Actor with no roles still carries the empty capability set', async () => {
    // The reserved-slot contract survives K-1 for the case it was written for.
    h.rolesQuery.mockResolvedValue({ data: [], error: null })
    const r = await resolveActor(req())
    expect(r?.actor.roles).toEqual([])
    expect(r?.actor.capabilities).toEqual([])
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

// FOUNDATION-10C — the trusted corporate identity boundary, at the API identity
// path. `resolveActor` is what every `/api/admin/*` handler reaches through
// `requirePermission`, so these prove the boundary applies to direct API calls
// exactly as it does to the UI. The exhaustive policy matrix (domain confusion,
// homoglyphs, punycode, aliases, …) lives in
// `lib/controller/auth/__tests__/corporateIdentity.test.ts`; this file pins the
// INTEGRATION — that the Actor is genuinely unreachable without it.
describe('resolveActor — corporate identity boundary', () => {
  const denied = async (user: Record<string, unknown>) => {
    h.getRequestUser.mockResolvedValue({ user })
    return resolveActor(req()).then(
      () => null,
      (e: unknown) => e as AdminError
    )
  }

  it('denies a verified NON-corporate identity with 403', async () => {
    const err = await denied({ ...USER, email: 'someone@gmail.com' })
    expect(err).toBeInstanceOf(AdminError)
    expect(err?.status).toBe(403)
    expect(err?.code).toBe('FORBIDDEN')
  })

  it('denies BEFORE any role is read — the identity never becomes a principal', async () => {
    await denied({ ...USER, email: 'someone@gmail.com' })
    // The boundary is upstream of the Actor, so the principal lookup that feeds
    // the PDP must not have run at all.
    expect(h.rolesQuery).not.toHaveBeenCalled()
    expect(h.isPlatformOwner).not.toHaveBeenCalled()
  })

  it('denies the PLATFORM OWNER when their identity is not corporate', async () => {
    // Ownership is a constitutional principal, but it is an AUTHORIZATION fact.
    // It cannot admit an identity that failed AUTHENTICATION — otherwise the
    // boundary would have an exception exactly where it matters most.
    h.isPlatformOwner.mockResolvedValue(true)
    const err = await denied({ ...USER, email: 'owner@gmail.com' })
    expect(err?.status).toBe(403)
  })

  it('denies an anonymous (consumer) sign-in', async () => {
    const err = await denied({ id: 'anon-1', email: undefined, is_anonymous: true })
    expect(err?.status).toBe(403)
  })

  it('denies a corporate address Supabase has NOT confirmed', async () => {
    const err = await denied({ ...USER, email_confirmed_at: null })
    expect(err?.status).toBe(403)
  })

  it('a forged request body/header email cannot reach the decision', async () => {
    // The attack: authenticate as a consumer, then claim a corporate address in
    // the request. `resolveActor` reads ONLY the object `getRequestUser`
    // returned from `auth.getUser()` — there is no parameter through which a
    // request-supplied email could enter, so the forgery is inert by
    // construction. This test pins that: the verified identity loses.
    h.getRequestUser.mockResolvedValue({ user: { ...USER, email: 'consumer@gmail.com' } })
    const forged = new Request('http://localhost/api/admin/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-email': 'boss@tappyai.com' },
      body: JSON.stringify({ email: 'boss@tappyai.com', user: { email: 'boss@tappyai.com' } }),
    })
    await expect(resolveActor(forged)).rejects.toBeInstanceOf(AdminError)
  })

  it('admits a verified corporate identity (the boundary is not a blanket deny)', async () => {
    const r = await resolveActor(req())
    expect(r?.actor.email).toBe('a@tappyai.com')
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
