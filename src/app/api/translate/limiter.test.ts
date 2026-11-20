// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 4 (20/11/2026): POST /api/translate. Before: daily per-IP and a global daily ceiling only. Now also a burst cap in front: 10 per minute per caller (shared store).
// An admitted request is stopped by an empty body (400) before the model; the model stub counts any call.

const h = vi.hoisted(() => ({ ip: '203.0.113.1', modelCalls: 0 }))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: async () => { h.modelCalls++; return { text: 'x' } } } }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: null, supabase: {} }) }))
vi.mock('@/lib/ai/consent/aiConsentGuard', () => ({ refuseWithoutAiConsent: async () => null }))

describeSharedLimiterContract({
  label: 'POST /api/translate',
  limit: 10,
  windowMs: 60_000,
  storeCallsPerAdmitted: 3, // burst + the daily per-IP cap + the global daily ceiling
  loadRoute: async () => { const { POST } = await import('./route'); return POST as never },
  defaultCaller: '203.0.113.1',
  actAs: (ip) => { h.ip = ip },
  request: () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': h.ip }, body: JSON.stringify({ text: '' }) }),
  sideEffects: () => h.modelCalls,
  resetSideEffects: () => { h.modelCalls = 0 },
})
