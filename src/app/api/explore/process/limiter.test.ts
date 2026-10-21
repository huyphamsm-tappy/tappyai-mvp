// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 2b (docs/phase8/SEC4-ROUTE-MATRIX.md): POST /api/explore/process (LLM content processing) moved from the in-process limiter to the SHARED limiter.
// Same limit (20 per minute) and same key (`explore-process:<user id>`). The model call is a counting stub; nothing leaves the process.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, processed: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/account/requireEligibleUser', () => ({ refuseIneligible: async () => null }))
vi.mock('@/lib/explore/contentProcessor', () => ({ processContent: async () => { h.processed++; return { description: 'd', hashtags: [] } } }))

describeSharedLimiterContract({
  label: 'POST /api/explore/process',
  limit: 20,
  windowMs: 60_000,
  loadRoute: async () => (await import('./route')).POST as never,
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/explore/process', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: 'quán cà phê' }) }),
  sideEffects: () => h.processed,
  resetSideEffects: () => { h.processed = 0 },
})

describe('POST /api/explore/process — order of checks is unchanged', () => {
  it('signed out → the empty answer and an anonymous session → refused, neither of them spends a limiter slot', async () => {
    const { configureSharedStore, resetLimiterEnv } = await import('@/lib/security/__tests__/sharedLimiterHarness')
    const store = configureSharedStore()
    vi.resetModules()
    const { bindFreshGraph } = await import('@/lib/security/__tests__/sharedLimiterHarness')
    await bindFreshGraph()
    const { POST } = await import('./route')
    const req = () => new Request('http://localhost/api/explore/process', { method: 'POST', body: '{}' }) as never
    h.user = null
    expect((await POST(req())).status).toBe(200)
    h.user = { id: 'anon', is_anonymous: true }
    expect((await POST(req())).status).toBe(403)
    expect(store.calls()).toBe(0)
    resetLimiterEnv()
  })
})
