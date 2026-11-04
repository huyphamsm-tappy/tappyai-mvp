// Security audit 04/11 (W-13): a replayed or late Stripe event cannot put an old subscription state back; the row follows Stripe's current state.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  event: null as unknown,
  current: null as unknown,
  retrieveFails: false,
  upserts: [] as Array<Record<string, unknown>>,
}))

vi.mock('stripe', () => {
  class Stripe {
    webhooks = { constructEvent: () => state.event }
    subscriptions = {
      retrieve: async () => { if (state.retrieveFails) throw new Error('resource_missing'); return state.current },
    }
  }
  return { default: Stripe }
})
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ upsert: async (row: Record<string, unknown>) => { state.upserts.push(row); return { error: null } } }),
  }),
}))

const sub = (status: string, end: number) => ({ id: 'sub_1', customer: 'cus_1', status, current_period_end: end, metadata: { supabase_user_id: 'u1' } })
const call = async () => {
  const { POST } = await import('./route')
  const req = new Request('https://x.test/api/webhooks/stripe', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' } })
  return POST(req as never)
}

describe('POST /api/webhooks/stripe - customer.subscription.updated', () => {
  beforeEach(() => { state.upserts = []; state.retrieveFails = false; process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x' })

  it('an old "active" event replayed after the subscription was canceled writes the canceled state', async () => {
    state.event = { type: 'customer.subscription.updated', data: { object: sub('active', 2_000_000_000) } }
    state.current = sub('canceled', 1_900_000_000)
    const res = await call()
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0]).toMatchObject({ user_id: 'u1', status: 'canceled', stripe_sub_id: 'sub_1' })
    expect(state.upserts[0].current_period_end).toBe(new Date(1_900_000_000 * 1000).toISOString())
  })

  it('the same event twice writes the same row twice (replay is harmless)', async () => {
    state.event = { type: 'customer.subscription.updated', data: { object: sub('past_due', 1_950_000_000) } }
    state.current = sub('active', 2_000_000_000)
    await call(); await call()
    expect(state.upserts).toHaveLength(2)
    expect(state.upserts[0]).toEqual(state.upserts[1])
    expect(state.upserts[0]).toMatchObject({ status: 'active' })
  })

  it('when Stripe cannot be asked, the event\'s own copy is used as before', async () => {
    state.event = { type: 'customer.subscription.deleted', data: { object: sub('canceled', 1_800_000_000) } }
    state.retrieveFails = true
    const res = await call()
    expect(res.status).toBe(200)
    expect(state.upserts[0]).toMatchObject({ status: 'canceled' })
  })

  it('an event without our user id writes nothing', async () => {
    state.event = { type: 'customer.subscription.updated', data: { object: { ...sub('active', 2_000_000_000), metadata: {} } } }
    state.current = sub('active', 2_000_000_000)
    await call()
    expect(state.upserts).toHaveLength(0)
  })
})
