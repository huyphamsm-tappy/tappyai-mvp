// @vitest-environment node
import { vi, describe, it, expect } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// Hardening 21/11/2026: GET /api/reviews/feed had no limit, and every unique query string is a CDN miss that reads the database. Now the shared limiter, 120 per minute per caller.
// An admitted request stops at a stubbed database that answers with an error (never 429); nothing leaves the process.

const h = vi.hoisted(() => ({ ip: '203.0.113.1', dbCalls: 0, ranges: [] as unknown[][] }))
vi.mock('@/lib/auth/getRequestUser', () => {
  const builder: any = new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'stub', code: 'XX000' }, count: 0 }).then(res)
      if (prop === 'range') return (...a: unknown[]) => { h.ranges.push(a); return builder }
      return () => builder
    },
    apply: () => builder,
  })
  return { getRequestUser: async () => ({ user: null, supabase: { from: () => { h.dbCalls++; return builder } } }) }
})
vi.mock('@/lib/policy/explore/reviewFeedObservation', () => ({ observePrivacyForFeed: () => undefined }))

describeSharedLimiterContract({
  label: 'GET /api/reviews/feed',
  limit: 120,
  windowMs: 60_000,
  loadRoute: async () => { const { GET } = await import('./route'); return ((req: Request) => GET(req as never)) },
  defaultCaller: '203.0.113.1',
  actAs: (ip) => { h.ip = ip },
  request: () => new Request('http://localhost/api/reviews/feed?page=0&limit=12', { headers: { 'x-real-ip': h.ip } }),
  sideEffects: () => h.dbCalls,
  resetSideEffects: () => { h.dbCalls = 0 },
})

describe('feed paging is clamped before it reaches the database', () => {
  it('a NaN, a negative, a huge page and a huge limit never reach range()', async () => {
    const { GET } = await import('./route')
    for (const q of ['page=abc&limit=xyz', 'page=-5&limit=-1', 'page=999999&limit=99999']) {
      h.ranges.length = 0
      await GET(new Request(`http://localhost/api/reviews/feed?${q}`, { headers: { 'x-forwarded-for': `198.51.100.${q.length}` } }) as never)
      for (const r of h.ranges) for (const n of r) expect(Number.isFinite(n as number) && (n as number) >= 0 && (n as number) <= 50 * 20 + 20).toBe(true)
    }
  })
})
