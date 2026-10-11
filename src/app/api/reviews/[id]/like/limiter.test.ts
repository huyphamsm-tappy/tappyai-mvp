// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5b (docs/phase8/SEC4-ROUTE-MATRIX.md): POST /api/reviews/[id]/like. Before: no limiter (toggle + push to the review owner). Now the shared limiter, 60 per minute per user (a documented proposal).
// An admitted request stops at a stubbed database that answers with an error (never 429); nothing leaves the process.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, dbCalls: 0, pushes: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => {
  const builder: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'stub', code: 'XX000' }, count: 0 }).then(res) : () => builder),
    apply: () => builder,
  })
  return { getRequestUser: async () => ({ user: h.user, supabase: { from: () => { h.dbCalls++; return builder }, rpc: () => { h.dbCalls++; return builder } } }) }
})
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: async () => { h.pushes++; return { id: null } } }))
vi.mock('@/lib/account/accountStatus', () => ({
  getAccountRestriction: async () => ({ blocked: false }),
  accountRestrictionMessage: () => '', accountRestrictionCode: () => '', accountRestrictionStatus: () => 403,
}))

describeSharedLimiterContract({
  label: 'POST /api/reviews/[id]/like',
  limit: 60,
  windowMs: 60_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { id: 'target-1' } } as never)) },
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'xin chào' }) }),
  sideEffects: () => h.dbCalls + h.pushes,
  resetSideEffects: () => { h.dbCalls = 0; h.pushes = 0 },
})

import { describe, it, expect } from 'vitest'
import { bindFreshGraph, configureSharedStore, resetLimiterEnv } from '@/lib/security/__tests__/sharedLimiterHarness'

describe('POST /api/reviews/[id]/like — order of checks is unchanged', () => {
  it('signed out → 401 and an anonymous session → refused, and neither spends any allowance', async () => {
    const store = configureSharedStore()
    vi.resetModules(); await bindFreshGraph()
    const { POST } = await import('./route')
    const call = (id = 'target-1') => POST(new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }) as never, { params: { id } } as never)
    h.user = null
    expect((await call()).status).toBe(401)
    h.user = { id: 'anon', is_anonymous: true }
    expect((await call()).status).toBe(403)
    expect(store.calls()).toBe(0)
    resetLimiterEnv()
  })
})
