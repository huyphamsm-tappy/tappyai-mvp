// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 (20/11/2026): POST /api/group/[id]/join now pushes to the group leader, so it carries the shared limiter: 20 per 10 minutes per user.
// An admitted request stops at an invalid body (400) before any database call or push; nothing leaves the process.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, dbCalls: 0, pushes: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.user, supabase: { from: () => { h.dbCalls++; throw new Error('not reached') } } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { h.dbCalls++; throw new Error('not reached') } }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: async () => { h.pushes++; return { id: null } } }))

describeSharedLimiterContract({
  label: 'POST /api/group/[id]/join',
  limit: 20,
  windowMs: 600_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { id: 'group-1' } } as never)) },
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' }),
  sideEffects: () => h.dbCalls + h.pushes,
  resetSideEffects: () => { h.dbCalls = 0; h.pushes = 0 },
})
