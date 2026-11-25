// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5 (20/11/2026): POST /api/comments/[commentId]/report. Before: no route limiter (only handleReport's in-process cap). Now a shared-store cap per IP in front of it: 60 per 10 minutes.
// The handler is stubbed: a refused request must never reach it.

const h = vi.hoisted(() => ({ ip: '203.0.113.1', handled: 0 }))
vi.mock('@/lib/safety/userReports', () => ({ handleReport: async () => { h.handled++; return new Response('{}', { status: 200 }) } }))

describeSharedLimiterContract({
  label: 'POST /api/comments/[commentId]/report',
  limit: 60,
  windowMs: 600_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { commentId: 'c1' } } as never)) },
  defaultCaller: '203.0.113.1',
  actAs: (ip) => { h.ip = ip },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'x-real-ip': h.ip } }),
  sideEffects: () => h.handled,
  resetSideEffects: () => { h.handled = 0 },
})
