// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5 (20/11/2026): POST /api/reviews/[id]/report. Before: no route limiter (every report can alert the moderators). Now the shared limiter, 20 per 10 minutes per reporter.
// An admitted request stops at a stubbed database that answers with an error (never 429); nothing leaves the process.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, dbCalls: 0, alerts: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => {
  const builder: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'stub', code: 'XX000' }, count: 0 }).then(res) : () => builder),
    apply: () => builder,
  })
  return { getRequestUser: async () => ({ user: h.user, supabase: { from: () => { h.dbCalls++; return builder } } }) }
})
vi.mock('@/lib/safety/operatorAlert', () => ({ alertModerators: async () => { h.alerts++ }, isUrgentReason: () => false }))

describeSharedLimiterContract({
  label: 'POST /api/reviews/[id]/report',
  limit: 20,
  windowMs: 600_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { id: 'target-1' } } as never)) },
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'spam' }) }),
  sideEffects: () => h.dbCalls + h.alerts,
  resetSideEffects: () => { h.dbCalls = 0; h.alerts = 0 },
})
