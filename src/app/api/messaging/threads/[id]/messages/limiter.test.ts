// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5 (20/11/2026): POST /api/messaging/threads/[id]/messages. Before: an in-process limiter (per instance). Now the shared limiter, 60 per minute per user (same limit and key).
// An admitted request is stopped by an invalid JSON body (400), before any database call.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, dbCalls: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.user, supabase: { from: () => { h.dbCalls++; throw new Error('not reached') } } }),
}))

describeSharedLimiterContract({
  label: 'POST /api/messaging/threads/[id]/messages',
  limit: 60,
  windowMs: 60_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { id: 'thread-1' } } as never)) },
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' }),
  sideEffects: () => h.dbCalls,
  resetSideEffects: () => { h.dbCalls = 0 },
})
