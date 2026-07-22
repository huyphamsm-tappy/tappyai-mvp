import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  requireAdminRole: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  svc: {
    getSummary: vi.fn(),
    getBySource: vi.fn(),
    getByPlatform: vi.fn(),
    getDailyTrend: vi.fn(),
    getActiveRule: vi.fn(),
    getRuleById: vi.fn(),
  },
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireAdminRole: h.requireAdminRole, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: h.rateLimit, clientIp: () => 'ip' }))
vi.mock('@/lib/admin/analytics/activationAnalyticsService', () => ({ activationAnalyticsService: h.svc }))

import { GET } from './route'
import { AdminError } from '@/lib/admin/rbac'

const req = (qs = '') => new Request(`http://localhost/api/admin/analytics/activation${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  h.requireAdminRole.mockResolvedValue({ user: { id: 'admin1' }, role: 'analyst' })
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
})

describe('GET /api/admin/analytics/activation — guards', () => {
  it('401 when unauthenticated', async () => {
    h.requireAdminRole.mockRejectedValue(new AdminError('UNAUTHORIZED', 'Authentication required', 401))
    const res = await GET(req('?view=summary'))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('403 on cross-origin', async () => {
    h.isSameOrigin.mockReturnValue(false)
    expect((await GET(req())).status).toBe(403)
  })

  it('429 when rate limited', async () => {
    h.rateLimit.mockReturnValue({ ok: false, retryAfter: 30 })
    expect((await GET(req())).status).toBe(429)
  })

  it('422 on invalid query', async () => {
    const res = await GET(req('?from=07-13-2026'))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/admin/analytics/activation — dispatch + envelope', () => {
  it('summary → {data} (no page), service called with the filter', async () => {
    h.svc.getSummary.mockResolvedValue({ signups: 10, activation_rate: 0.4 })
    const res = await GET(req('?view=summary&from=2026-07-01&to=2026-07-31&platform=web'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { signups: 10, activation_rate: 0.4 } })
    expect(h.svc.getSummary).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-07-01', to: '2026-07-31', platform: 'web' }))
  })

  it('by_source → paginated {data, meta.page}', async () => {
    h.svc.getBySource.mockResolvedValue([{ signup_source: 'a' }, { signup_source: 'b' }, { signup_source: 'c' }])
    const res = await GET(req('?view=by_source&limit=2&offset=1'))
    const body = await res.json()
    expect(body.data).toEqual([{ signup_source: 'b' }, { signup_source: 'c' }])
    expect(body.meta.page).toEqual({ limit: 2, offset: 1, total: 3, hasMore: false })
  })

  it('by_platform and trend views dispatch to their service methods', async () => {
    h.svc.getByPlatform.mockResolvedValue([{ platform: 'web' }])
    h.svc.getDailyTrend.mockResolvedValue([{ date: '2026-07-14' }])
    expect((await (await GET(req('?view=by_platform'))).json()).data).toEqual([{ platform: 'web' }])
    expect((await (await GET(req('?view=trend'))).json()).data).toEqual([{ date: '2026-07-14' }])
  })

  it('rule (no rule_version) → getActiveRule', async () => {
    h.svc.getActiveRule.mockReturnValue({ id: 'activation-v1', ruleVersion: 'v1' })
    const res = await GET(req('?view=rule'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ id: 'activation-v1', ruleVersion: 'v1' })
    expect(h.svc.getRuleById).not.toHaveBeenCalled()
  })

  it('rule with rule_version → getRuleById', async () => {
    h.svc.getRuleById.mockReturnValue({ id: 'activation-v1', ruleVersion: 'v1' })
    const res = await GET(req('?view=rule&rule_version=v1'))
    expect(res.status).toBe(200)
    expect(h.svc.getRuleById).toHaveBeenCalledWith('v1')
    expect(h.svc.getActiveRule).not.toHaveBeenCalled()
  })

  it('rule → 404 when no matching rule resolves', async () => {
    h.svc.getActiveRule.mockReturnValue(null)
    const res = await GET(req('?view=rule'))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('NOT_FOUND')
  })
})
