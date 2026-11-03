// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'
import { configureSharedStore, bindFreshGraph, resetLimiterEnv } from '@/lib/security/__tests__/sharedLimiterHarness'

// SEC4 slice 5a: POST /api/group/[id]/avatar (creator-only storage write) had NO limiter. It now has the shared limiter: 10 per hour per user (`group-avatar:<user id>`), checked AFTER
// the creator check (a non-creator gets 403 and spends nothing) and before the body is read. The numbers are a documented proposal (no previous limit existed).

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, bodyReads: 0, creator: 'caller-1' }))
vi.mock('@/lib/auth/getRequestUser', () => {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) b[m] = () => b
  b.single = async () => ({ data: { id: 'g1', creator_id: h.creator }, error: null })
  return { getRequestUser: async () => ({ user: h.user, supabase: { from: () => b } }) }
})

const makeRequest = () => {
  const req = new Request('http://localhost/api/group/g1/avatar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const real = req.formData.bind(req)
  Object.defineProperty(req, 'formData', { value: () => { h.bodyReads++; return real() } })
  return req
}

describeSharedLimiterContract({
  label: 'POST /api/group/[id]/avatar',
  limit: 10,
  windowMs: 3_600_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { id: 'g1' } } as never)) },
  actAs: (id) => { h.user = { id, is_anonymous: false }; h.creator = id }, // every caller is the creator of the group in these cases
  request: makeRequest,
  sideEffects: () => h.bodyReads,
  resetSideEffects: () => { h.bodyReads = 0 },
})

describe('POST /api/group/[id]/avatar — order of checks', () => {
  it('a non-creator gets 403 and spends NO allowance; signed out → 401; anonymous → refused before the limiter', async () => {
    const store = configureSharedStore()
    vi.resetModules(); await bindFreshGraph()
    const { POST } = await import('./route')
    const call = () => POST(makeRequest() as never, { params: { id: 'g1' } } as never)
    h.user = { id: 'caller-1', is_anonymous: false }; h.creator = 'someone-else'
    expect((await call()).status).toBe(403)
    h.user = null
    expect((await call()).status).toBe(401)
    h.user = { id: 'anon', is_anonymous: true }
    expect((await call()).status).toBe(403)
    expect(store.calls()).toBe(0)
    resetLimiterEnv()
  })
})
