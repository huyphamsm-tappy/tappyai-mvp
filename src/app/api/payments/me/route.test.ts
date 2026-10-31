import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string; is_anonymous?: boolean } | null,
    subRow: null as Record<string, unknown> | null,
    pendingOrders: [] as Record<string, unknown>[],
    paidPipOrders: [] as Record<string, unknown>[],
    pipUsedRpc: false,
    quota: { limit: 10, period: 'day', used: 2, remaining: 8 },
  }
  return { state }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'subscriptions') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: h.state.subRow, error: null }),
              }),
            }),
          }
        }
        if (table === 'payment_orders') {
          return {
            select: () => ({
              eq: (_col: string, val: unknown) => {
                const chain: any = {
                  eq: (_col2: string, val2: unknown) => {
                    const chain2: any = {
                      eq: (_col3: string, val3: unknown) => ({
                        limit: async () => ({ data: h.state.paidPipOrders, error: null }),
                      }),
                      gt: () => ({
                        limit: async () => ({ data: h.state.pendingOrders, error: null }),
                      }),
                    }
                    if (val2 === 'pip') return chain2
                    return chain2
                  },
                  gt: () => ({
                    limit: async () => ({ data: h.state.pendingOrders, error: null }),
                  }),
                }
                return chain
              },
            }),
          }
        }
        return { select: () => ({}) }
      },
    }
    return Promise.resolve({ user: h.state.user, supabase })
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string) => {
      if (fn === 'p7_pip_used') return { data: h.state.pipUsedRpc, error: null }
      return { data: null, error: null }
    },
  }),
}))

vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return {
    ...actual,
    peekAiQuestionQuota: async () => h.state.quota,
  }
})

import { GET } from './route'

const get = async (ip = '203.0.113.10') => {
  const req = new Request('https://t.test/api/payments/me', {
    headers: { 'x-forwarded-for': ip },
  })
  const res = await GET(req)
  return { status: res.status, body: await res.json().catch(() => null) }
}

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  h.state.user = null
  h.state.subRow = null
  h.state.pendingOrders = []
  h.state.paidPipOrders = []
  h.state.pipUsedRpc = false
  h.state.quota = { limit: 10, period: 'day', used: 2, remaining: 8 }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/payments/me — Flag and Authentication', () => {
  it('returns 404 when SUBSCRIPTIONS_ENABLED is off', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    const { status } = await get()
    expect(status).toBe(404)
  })

  it('unauthenticated caller receives guest allowance and state NONE', async () => {
    h.state.user = null
    h.state.quota = { limit: 5, period: 'lifetime', used: 1, remaining: 4 }
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body).toEqual({
      signedIn: false,
      subscription: {
        state: 'NONE',
        plan: null,
        periodEnd: null,
        channel: null,
        autoRenew: false,
        canBuy: true,
        manage: null,
      },
      pipUsed: false,
      quota: { limit: 5, used: 1, remaining: 4, period: 'lifetime' },
    })
  })

  it('anonymous session (is_anonymous: true) receives guest allowance and signedIn: false', async () => {
    h.state.user = { id: 'anon-user-uuid', is_anonymous: true }
    h.state.quota = { limit: 5, period: 'lifetime', used: 3, remaining: 2 }
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.signedIn).toBe(false)
    expect(body.subscription.state).toBe('NONE')
    expect(body.quota.period).toBe('lifetime')
  })
})

describe('GET /api/payments/me — Signed-in User State', () => {
  const future = new Date(Date.now() + 20 * 86_400_000).toISOString()

  it('signed-in user with no active plan has state NONE and daily quota 10', async () => {
    h.state.user = { id: 'user-free-1', is_anonymous: false }
    h.state.subRow = null
    h.state.quota = { limit: 10, period: 'day', used: 4, remaining: 6 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      signedIn: true,
      subscription: {
        state: 'NONE',
        plan: null,
        periodEnd: null,
        channel: null,
        autoRenew: false,
        canBuy: true,
        manage: null,
      },
      pipUsed: false,
      quota: { limit: 10, used: 4, remaining: 6, period: 'day' },
    })
  })

  it('signed-in user with active Web subscription (Momo) has state ACTIVE, channel web, no auto-renew', async () => {
    h.state.user = { id: 'user-paid-1', is_anonymous: false }
    h.state.subRow = {
      plan: 'momo',
      status: 'active',
      current_period_end: future,
      cancel_at_period_end: false,
      source: 'web_sepay',
    }
    h.state.quota = { limit: 30, period: 'day', used: 5, remaining: 25 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.signedIn).toBe(true)
    expect(body.subscription).toEqual({
      state: 'ACTIVE',
      // Owner 01/11/2026: new plan catalog (plan `momo` is shown as Coco)
      plan: { id: 'momo', name: 'Coco' },
      periodEnd: future,
      channel: 'web',
      autoRenew: false,
      canBuy: false,
      manage: null,
    })
    expect(body.quota.limit).toBe(30)
  })

  it('signed-in user with active Apple IAP subscription has channel app_store, autoRenew true, manage app_store', async () => {
    h.state.user = { id: 'user-ios-1', is_anonymous: false }
    h.state.subRow = {
      plan: 'coco',
      status: 'active',
      current_period_end: future,
      cancel_at_period_end: false,
      source: 'apple_iap',
    }
    h.state.quota = { limit: 30, period: 'day', used: 0, remaining: 30 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.subscription).toEqual({
      state: 'ACTIVE',
      plan: { id: 'coco', name: 'Coco' },
      periodEnd: future,
      channel: 'app_store',
      autoRenew: true,
      canBuy: false,
      manage: 'app_store',
    })
  })

  it('signed-in user with pending order has state PENDING', async () => {
    h.state.user = { id: 'user-pending-1', is_anonymous: false }
    h.state.subRow = null
    h.state.pendingOrders = [{ id: 'order-pending-id' }]

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.subscription.state).toBe('PENDING')
    expect(body.subscription.canBuy).toBe(true)
  })

  it('reflects pipUsed true when database reports Pip has been used', async () => {
    h.state.user = { id: 'user-pip-used', is_anonymous: false }
    h.state.pipUsedRpc = true

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.pipUsed).toBe(true)
  })
})
