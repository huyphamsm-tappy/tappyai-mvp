// @vitest-environment node
import { vi, beforeAll, afterAll } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5 (20/11/2026): POST /api/users/[id]/block. Before: an in-process limiter (per instance). Now the shared limiter, 30 per minute per user (same limit and key).

const TARGET = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, dbCalls: 0, alerts: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => {
  const builder: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'stub', code: 'XX000' }, count: 0 }).then(res) : () => builder),
    apply: () => builder,
  })
  return { getRequestUser: async () => ({ user: h.user, supabase: { from: () => { h.dbCalls++; return builder } } }) }
})
vi.mock('@/lib/safety/operatorAlert', () => ({ alertModerators: async () => { h.alerts++ } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { h.dbCalls++; throw new Error('not reached') } }))

const prev = process.env.USER_BLOCKS_ENABLED
beforeAll(() => { process.env.USER_BLOCKS_ENABLED = 'true' })
afterAll(() => { if (prev === undefined) delete process.env.USER_BLOCKS_ENABLED; else process.env.USER_BLOCKS_ENABLED = prev })

describeSharedLimiterContract({
  label: 'POST /api/users/[id]/block',
  limit: 30,
  windowMs: 60_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { id: TARGET } } as never)) },
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/x', { method: 'POST' }),
  sideEffects: () => h.dbCalls + h.alerts,
  resetSideEffects: () => { h.dbCalls = 0; h.alerts = 0 },
})
