// SUBSCRIPTIONS_ENABLED OFF leaves the release routes exactly as they were;
// ON closes Stripe checkout/portal and opens the payment routes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create: vi.fn() } }; billingPortal = { sessions: { create: vi.fn() } }; customers = { create: vi.fn() } } }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: null, supabase: {} }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { POST as checkout } from '@/app/api/stripe/checkout/route'
import { POST as portal } from '@/app/api/stripe/portal/route'
import { POST as orders } from '@/app/api/payments/orders/route'
import { POST as sepay } from '@/app/api/payments/sepay/route'
import { subscriptionsEnabled } from '@/lib/payments/flags'

const req = () => new Request('https://t.test/x', { method: 'POST', body: '{}' })
afterEach(() => vi.unstubAllEnvs())

describe('SUBSCRIPTIONS_ENABLED OFF (default)', () => {
  it('Stripe still answers as before (401 for a signed-out caller, not 404)', async () => {
    for (const fn of [checkout, portal]) expect((await fn(req())).status).toBe(401)
  })
  it('the payment routes do not exist', async () => {
    for (const fn of [orders, sepay]) expect((await fn(req())).status).toBe(404)
  })
  it('the flag reads off', () => {
    expect(subscriptionsEnabled({} as NodeJS.ProcessEnv)).toBe(false)
  })
})

describe('SUBSCRIPTIONS_ENABLED ON', () => {
  it('Stripe checkout/portal are closed', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
    for (const fn of [checkout, portal]) expect((await fn(req())).status).toBe(404)
  })
  it('the payment routes exist (a signed-out payer gets 401, the webhook rejects a missing signature)', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
    expect((await orders(req())).status).toBe(401)
    expect([400, 401, 403]).toContain((await sepay(req())).status)
  })
})

describe('Stripe is legacy / unsupported for the P7 subscription flow', () => {
  it('the legacy Stripe webhook (which keeps existing `pro` rows alive) is NOT behind the flag, and the P7 purchase path never touches Stripe', () => {
    expect(readFileSync('src/app/api/webhooks/stripe/route.ts', 'utf8')).not.toMatch(/subscriptionsEnabled/)
    for (const f of ['src/app/api/payments/orders/route.ts', 'src/app/api/payments/sepay/route.ts', 'src/components/subscription/SubscriptionFlow.tsx', 'src/lib/payments/myPlan.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/stripe/i)
    }
  })
})
