import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// GET /api/admin/org/memberships — the roster route (Owner Decision D6).
//
// `membershipRoster.test.ts` covers the service: who is refused, what is
// audited, and that suspended rows are excluded. This covers the ROUTE: the
// feature gate, which permission it asks for, the same-origin and rate limits,
// and — the one that matters — that the payload carries no field the row does
// not hold.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(),
  roster: vi.fn(),
  deps: vi.fn(() => ({ repo: {} })),
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requirePermission: h.requirePermission }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/controller/org/membershipService', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, listDepartmentRoster: h.roster }
})
vi.mock('@/lib/controller/org/server', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, productionMembershipDeps: h.deps }
})

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { GET } from './route'

const ACTOR = { userId: 'u-1', roles: ['super_admin'], isOwner: true }
const ORIGINAL_FLAG = process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED

const req = () => new Request('https://www.tappyai.com/api/admin/org/memberships')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = 'true'
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockResolvedValue({ ok: true })
  h.requirePermission.mockResolvedValue({ user: { id: 'u-1', email: 'x@tappyai.com' }, actor: ACTOR })
  h.roster.mockResolvedValue({ ok: true, memberships: [] })
})
afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED
  else process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = ORIGINAL_FLAG
})

describe('D6 · the feature gate', () => {
  it('404s while F-10 is off — the endpoint does not exist', async () => {
    // Same behaviour the three mutating verbs already have. A read that stayed
    // open while the feature was off would make the flag a half-gate.
    delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED
    expect((await GET(req())).status).toBe(404)
  })

  it('does not even resolve a permission when the feature is off', async () => {
    delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED
    await GET(req())
    expect(h.requirePermission).not.toHaveBeenCalled()
  })

  it('a typo in the flag does not open the endpoint', async () => {
    process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = 'TRUE'
    expect((await GET(req())).status).toBe(404)
  })
})

describe('D6 · which permission the read asks for', () => {
  it('asks for security.membership.read', async () => {
    await GET(req())
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.SECURITY_MEMBERSHIP_READ)
  })

  it('does NOT ask for the critical-risk manage permission', async () => {
    // `.manage` is riskLevel: critical and exists to CHANGE what this displays.
    // Both are super_admin today, so wiring the read to the write permission
    // would widen nothing now — and would make a future widening of one
    // silently widen the other.
    await GET(req())
    expect(h.requirePermission.mock.calls[0][1]).not.toBe(PERMISSIONS.SECURITY_MEMBERSHIP_MANAGE)
  })
})

describe('D6 · the guards, in order', () => {
  it('refuses a cross-origin read', async () => {
    h.isSameOrigin.mockReturnValue(false)
    expect((await GET(req())).status).toBe(403)
  })

  it('rate limits', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const res = await GET(req())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('maps a service denial to 403 and an unauthenticated one to 401', async () => {
    h.roster.mockResolvedValue({ ok: false, reason: 'PERMISSION_DENIED' })
    expect((await GET(req())).status).toBe(403)
    h.roster.mockResolvedValue({ ok: false, reason: 'UNAUTHENTICATED' })
    expect((await GET(req())).status).toBe(401)
  })

  it('passes the resolved ACTOR to the service, not the raw user', async () => {
    // The service runs the canonical PDP on an Actor. Handing it a user object
    // would put the second authorization decision on a shape that carries no
    // roles — it would deny everyone, or worse, be "fixed" by loosening it.
    await GET(req())
    expect(h.roster.mock.calls[0][0]).toBe(ACTOR)
  })
})

describe('D6 · the payload', () => {
  it('returns the memberships under `data`', async () => {
    h.roster.mockResolvedValue({
      ok: true,
      memberships: [{ userId: 'u-9', departmentId: 'ai_data', orgRole: 'DEPARTMENT_HEAD', scope: 'ai_data', status: 'active' }],
    })
    const body = await (await GET(req())).json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].departmentId).toBe('ai_data')
  })

  it('carries no email, name or avatar — the row holds none, and the route adds none', async () => {
    // A roster is org structure. Joining it to `profiles` to make the screen
    // friendlier would put consumer-app identity on a Controller surface that
    // never asked for it, and would do it inside a UI change.
    h.roster.mockResolvedValue({
      ok: true,
      memberships: [{ userId: 'u-9', departmentId: 'ai_data', orgRole: 'DEPARTMENT_HEAD', scope: 'ai_data', status: 'active' }],
    })
    const raw = await (await GET(req())).text()
    for (const forbidden of ['email', 'avatar', 'full_name', 'display_name', 'phone']) {
      expect(raw, forbidden).not.toContain(forbidden)
    }
  })

  it('an empty roster is an empty list, never an error', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual([])
  })
})
