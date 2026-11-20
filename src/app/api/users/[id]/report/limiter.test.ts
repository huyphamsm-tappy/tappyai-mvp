// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5 (20/11/2026): POST /api/users/[id]/report. A shared-store cap per IP in front of handleReport: 60 per 10 minutes. The handler is stubbed.

const h = vi.hoisted(() => ({ ip: '203.0.113.1', handled: 0 }))
vi.mock('@/lib/safety/userReports', () => ({ handleReport: async () => { h.handled++; return new Response('{}', { status: 200 }) } }))

describeSharedLimiterContract({
  label: 'POST /api/users/[id]/report',
  limit: 60,
  windowMs: 600_000,
  loadRoute: async () => { const { POST } = await import('./route'); return ((req: Request) => POST(req as never, { params: { id: 'u1' } } as never)) },
  defaultCaller: '203.0.113.1',
  actAs: (ip) => { h.ip = ip },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'x-real-ip': h.ip } }),
  sideEffects: () => h.handled,
  resetSideEffects: () => { h.handled = 0 },
})
