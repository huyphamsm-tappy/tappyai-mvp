// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// 21/11/2026: POST /api/comments/[commentId]/hide. Shared limiter, 60 per 10 minutes per signed-in user. An admitted request stops at a stubbed database that finds nothing (404, never 429).

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, dbCalls: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      h.dbCalls++
      const b: Record<string, unknown> = {}
      b.select = () => b; b.eq = () => b; b.is = () => b; b.update = () => b
      b.maybeSingle = async () => ({ data: null, error: null })
      return b
    },
  }),
}))

describeSharedLimiterContract({
  label: 'POST /api/comments/[commentId]/hide',
  limit: 60,
  windowMs: 600_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { commentId: '44444444-4444-4444-8444-444444444444' } } as never)) },
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hidden: true }) }),
  sideEffects: () => h.dbCalls,
  resetSideEffects: () => { h.dbCalls = 0 },
})
