import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string; is_anonymous?: boolean } | null,
    subRow: null as Record<string, unknown> | null,
    quota: { limit: 10, period: 'day', used: 0, remaining: 10 },
  }
  return { state }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: h.state.subRow, error: null }),
          }),
        }),
      }),
    }
    return Promise.resolve({ user: h.state.user, supabase })
  },
}))

vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return {
    ...actual,
    peekAiQuestionQuota: async () => h.state.quota,
  }
})

import { GET } from './route'

const get = async () => {
  const req = new Request('https://t.test/api/subscription', {
    headers: { 'x-forwarded-for': '203.0.113.5' },
  })
  const res = await GET(req)
  return { status: res.status, body: await res.json().catch(() => null) }
}

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  h.state.user = null
  h.state.subRow = null
  h.state.quota = { limit: 10, period: 'day', used: 0, remaining: 10 }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/subscription — Common Entitlement & Cross-Platform Contract', () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()

  it('returns 401 when request is unauthenticated', async () => {
    h.state.user = null
    const { status, body } = await get()
    expect(status).toBe(401)
    expect(body.error).toBe('unauthorized')
  })

  it('anonymous session receives guest allowance, isPro: false, isAnonymous: true', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    h.state.quota = { limit: 5, period: 'lifetime', used: 2, remaining: 3 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      isPro: false,
      plan: 'free',
      freeDailyLimit: 5,
      quotaPeriod: 'lifetime',
      isAnonymous: true,
      todayMessageCount: 2,
      remaining: 3,
    })
  })

  it('signed-in free account receives isPro: false, plan: free, limit: 10', async () => {
    h.state.user = { id: 'reg-free-1', is_anonymous: false }
    h.state.subRow = null
    h.state.quota = { limit: 10, period: 'day', used: 3, remaining: 7 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      isPro: false,
      plan: 'free',
      status: null,
      source: null,
      currentPeriodEnd: null,
      freeDailyLimit: 10,
      quotaPeriod: 'day',
      isAnonymous: false,
      todayMessageCount: 3,
      remaining: 7,
    })
  })

  it('signed-in account with active Web subscription (Momo) receives isPro: true, source: web_sepay, limit: 30', async () => {
    h.state.user = { id: 'reg-paid-momo', is_anonymous: false }
    h.state.subRow = {
      plan: 'momo',
      status: 'active',
      current_period_end: future,
      source: 'web_sepay',
    }
    h.state.quota = { limit: 30, period: 'day', used: 5, remaining: 25 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      isPro: true,
      plan: 'momo',
      status: 'active',
      // `source` is the store contract of the iOS app (App Review 3.1.3(b): 'apple' | 'external' | null, see source.test.ts); the raw
      // grant is `entitlementSource`.
      source: 'external',
      entitlementSource: 'web_sepay',
      currentPeriodEnd: future,
      freeDailyLimit: 30,
      quotaPeriod: 'day',
      isAnonymous: false,
      todayMessageCount: 5,
      remaining: 25,
    })
  })

  it('iOS and Android entitlement compatibility: web subscriber logging into mobile immediately gets isPro true', async () => {
    h.state.user = { id: 'cross-platform-user', is_anonymous: false }
    h.state.subRow = {
      plan: 'coco',
      status: 'active',
      current_period_end: future,
      source: 'web_sepay',
    }
    h.state.quota = { limit: 30, period: 'day', used: 0, remaining: 30 }

    const { status, body } = await get()
    expect(status).toBe(200)

    // Verification against iOS SubscriptionStatusResponse fields (Core/Payments/EntitlementService.swift):
    // struct SubscriptionStatusResponse: Decodable { isPro, status, currentPeriodEnd, freeDailyLimit, todayMessageCount, remaining }
    expect(typeof body.isPro).toBe('boolean')
    expect(body.isPro).toBe(true)
    expect(body.status).toBe('active')
    expect(body.currentPeriodEnd).toBe(future)
    expect(typeof body.freeDailyLimit).toBe('number')
    expect(body.freeDailyLimit).toBe(30)
    expect(typeof body.todayMessageCount).toBe('number')
    expect(typeof body.remaining).toBe('number')

    // Verification against Android SubscriptionDto (android/.../SubscriptionDto.kt):
    // data class SubscriptionDto(isPro, status, currentPeriodEnd, freeDailyLimit, todayMessageCount, remaining)
    expect(body.isPro).toBe(true)
    expect(body.freeDailyLimit).toBe(30)
  })

  it('expired subscription falls back to isPro: false and free tier limit', async () => {
    h.state.user = { id: 'reg-expired-sub', is_anonymous: false }
    h.state.subRow = {
      plan: 'momo',
      status: 'active',
      current_period_end: past,
      source: 'web_sepay',
    }
    h.state.quota = { limit: 10, period: 'day', used: 1, remaining: 9 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.isPro).toBe(false)
    expect(body.plan).toBe('free')
    expect(body.freeDailyLimit).toBe(10)
  })

  it('cancelled subscription falls back to isPro: false and free tier limit', async () => {
    h.state.user = { id: 'reg-cancelled-sub', is_anonymous: false }
    h.state.subRow = {
      plan: 'momo',
      status: 'canceled',
      current_period_end: future,
      source: 'web_sepay',
    }
    h.state.quota = { limit: 10, period: 'day', used: 2, remaining: 8 }

    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.isPro).toBe(false)
    expect(body.plan).toBe('free')
  })
})
