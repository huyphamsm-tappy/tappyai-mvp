// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5a (docs/phase8/SEC4-ROUTE-MATRIX.md): POST /api/profile (avatar or cover upload: storage write + image decode) had NO limiter. It now has the shared limiter:
// 10 per hour per user, avatar and cover together (`profile-photo:<user id>`). The numbers are a documented proposal (there was no previous limit to preserve).
// An admitted request in this test stops at "no file" (400); storage, sharp and the profile row are never reached.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, bodyReads: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))

describeSharedLimiterContract({
  label: 'POST /api/profile (avatar / cover)',
  limit: 10,
  windowMs: 3_600_000,
  loadRoute: async () => (await import('./route')).POST as never,
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => {
    const req = new Request('http://localhost/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    const real = req.formData.bind(req)
    Object.defineProperty(req, 'formData', { value: () => { h.bodyReads++; return real() } })
    return req
  },
  sideEffects: () => h.bodyReads,
  resetSideEffects: () => { h.bodyReads = 0 },
})
