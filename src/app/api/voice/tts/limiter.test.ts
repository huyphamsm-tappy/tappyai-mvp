// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 2d (docs/phase8/SEC4-ROUTE-MATRIX.md): POST /api/voice/tts (Google TTS, billed per character, <= 2000 characters per call) moved from the in-process limiter to
// the SHARED limiter. Same limit (30 per minute) and same key (`voice-tts:<user id>`). NOT added here: a daily character ceiling — that number is the owner's.
// The synthesis provider is a counting stub; nothing leaves the process.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, synthesized: 0 }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/observability', () => ({ flushPending: async () => {}, recordEvent: () => {}, recordTtsMetricsDelta: () => {} }))
vi.mock('@/lib/voice/tts/service', () => ({
  ttsMetricsSnapshot: () => ({}),
  getTtsProvider: () => ({ synthesize: async () => { h.synthesized++; return { audioBase64: 'AA==', mimeType: 'audio/mpeg', voiceName: 'v', cacheHit: false } } }),
}))

describeSharedLimiterContract({
  label: 'POST /api/voice/tts',
  limit: 30,
  windowMs: 60_000,
  loadRoute: async () => (await import('./route')).POST as never,
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/voice/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'xin chào các bạn', language: 'vi' }) }),
  sideEffects: () => h.synthesized,
  resetSideEffects: () => { h.synthesized = 0 },
})
