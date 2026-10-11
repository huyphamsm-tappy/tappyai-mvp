// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 2c (docs/phase8/SEC4-ROUTE-MATRIX.md): POST /api/upload/video (each response authorises one direct upload to Cloud Storage) moved from the in-process limiter
// to the SHARED limiter. Same limit (30 per minute) and same key (`upload-video:<user id>`). Storage and the eligibility check are stubs; nothing leaves the process.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, completed: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/account/requireEligibleUser', () => ({ refuseIneligible: async () => null }))
vi.mock('@/lib/observability', () => ({ flushPending: async () => {} }))
vi.mock('@/lib/media', () => ({ getMediaProvider: () => ({}) }))
vi.mock('@/lib/media/uploadCompletion', () => ({
  isCompleteUploadBody: () => true,
  completeUploadResponse: async () => { h.completed++; return { status: 200, body: { ok: true } } },
}))

describeSharedLimiterContract({
  label: 'POST /api/upload/video',
  limit: 30,
  windowMs: 60_000,
  loadRoute: async () => (await import('./route')).POST as never,
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/upload/video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'k', kind: 'video' }) }),
  sideEffects: () => h.completed,
  resetSideEffects: () => { h.completed = 0 },
})
