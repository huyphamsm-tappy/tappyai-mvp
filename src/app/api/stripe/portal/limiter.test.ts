// @vitest-environment node
import { vi } from 'vitest'
import { describeSharedLimiterContract } from '@/lib/security/__tests__/limiterContract'

// SEC4 slice 5 (20/11/2026): POST /api/stripe/portal. Before: no limiter (a Stripe API call, reachable while SUBSCRIPTIONS_ENABLED is off). Now the shared limiter, 10 per minute per user.

const h = vi.hoisted(() => ({ user: { id: 'caller-1', is_anonymous: false } as Record<string, unknown> | null, calls: 0 }))
vi.mock('stripe', () => ({ default: class { billingPortal = { sessions: { create: async () => { h.calls++; throw new Error('stub') } } } } }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { h.calls++; throw new Error('stub') } }))

describeSharedLimiterContract({
  label: 'POST /api/stripe/portal',
  limit: 10,
  windowMs: 60_000,
  loadRoute: async () => { const { POST } = await import('./route'); return POST },
  actAs: (id) => { h.user = { id, is_anonymous: false } },
  request: () => new Request('http://localhost/api/x', { method: 'POST' }),
  sideEffects: () => h.calls,
  resetSideEffects: () => { h.calls = 0 },
})
