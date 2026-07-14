import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mock fns shared with the module mocks below.
const h = vi.hoisted(() => ({
  requireAdminRole: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  svc: {
    getSummary: vi.fn(),
    getByProvider: vi.fn(),
    getByPlatform: vi.fn(),
    getDailyTrend: vi.fn(),
    getAcquisitionBreakdown: vi.fn(),
  },
}))

// Keep AdminError / adminError / adminErrorResponse real; override the gates.
vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireAdminRole: h.requireAdminRole, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: h.rateLimit, clientIp: () => 'ip' }))
vi.mock('@/lib/admin/analytics/authAnalyticsService', () => ({ authAnalyticsService: h.svc }))

import { GET } from './route'
import { AdminError } from '@/lib/admin/rbac'

const req = (qs = '') => new Request(`http://localhost/api/admin/analytics/auth${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  h.requireAdminRole.mockResolvedValue({ user: { id: 'admin1' }, role: 'analyst' })
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
})

describe('GET /api/admin/analytics/auth — guards', () => {
  it('401 when unauthenticated', async () => {
    h.requireAdminRole.mockRejectedValue(new AdminError('UNAUTHORIZED', 'Authentication required', 401))
    const res = await GET(req('?view=summary'))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('403 when role is insufficient', async () => {
    h.requireAdminRole.mockRejectedValue(new AdminError('FORBIDDEN', 'Insufficient', 403))
    expect((await GET(req())).status).toBe(403)
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

describe('GET /api/admin/analytics/auth — dispatch + envelope', () => {
  it('summary → {data} (no page), service called with the filter', async () => {
    h.svc.getSummary.mockResolvedValue({ signups: 10, login_success_rate: 0.9 })
    const res = await GET(req('?view=summary&from=2026-07-01&to=2026-07-31&platform=web'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ data: { signups: 10, login_success_rate: 0.9 } })
    expect(h.svc.getSummary).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-07-01', to: '2026-07-31', platform: 'web' }))
  })

  it('provider → paginated {data, meta.page}', async () => {
    h.svc.getByProvider.mockResolvedValue([{ method: 'a' }, { method: 'b' }, { method: 'c' }, { method: 'd' }, { method: 'e' }])
    const res = await GET(req('?view=provider&limit=2&offset=1'))
    const body = await res.json()
    expect(body.data).toEqual([{ method: 'b' }, { method: 'c' }])
    expect(body.meta.page).toEqual({ limit: 2, offset: 1, total: 5, hasMore: true })
  })

  it('acquisition → calls getAcquisitionBreakdown with dimension + filters', async () => {
    h.svc.getAcquisitionBreakdown.mockResolvedValue([{ key: 'VN', users: 3 }])
    const res = await GET(req('?view=acquisition&dimension=country&app_version=1.2.0&country=VN&language=vi'))
    expect(res.status).toBe(200)
    expect(h.svc.getAcquisitionBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ app_version: '1.2.0', country: 'VN', language: 'vi' }),
      'country',
    )
    expect((await res.json()).data).toEqual([{ key: 'VN', users: 3 }])
  })

  it('trend and platform views dispatch to their service methods', async () => {
    h.svc.getDailyTrend.mockResolvedValue([{ date: '2026-07-13' }])
    h.svc.getByPlatform.mockResolvedValue([{ platform: 'web' }])
    expect((await (await GET(req('?view=trend'))).json()).data).toEqual([{ date: '2026-07-13' }])
    expect((await (await GET(req('?view=platform'))).json()).data).toEqual([{ platform: 'web' }])
  })
})
