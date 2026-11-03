import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── GET /api/subscription says where a paid plan comes from (`source`) ─────────────────────────
//
// App Review 3.1.3(b): the iOS app may let a person use a plan bought elsewhere, but it may show a renewal date and
// Apple's «Manage subscription» only for an App Store subscription. The field is ADDITIVE: every older field stays.
//   apple_iap                               → 'apple'
//   any other paid plan (web, sepay, …)     → 'external'
//   no paid plan                            → null

const h = vi.hoisted(() => {
  const state = { user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null, sub: null as Record<string, unknown> | null }
  const builder = (): any => {
    const b: any = {
      select: () => b, eq: () => b, gte: () => b,
      maybeSingle: () => Promise.resolve({ data: state.sub, error: null }),
      single: () => Promise.resolve({ data: state.sub, error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: 0, error: null }) } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return { ...actual, peekAiQuestionQuota: async () => ({ limit: 30, period: 'day', used: 4, remaining: 26 }) }
})

import { GET } from './route'

const FUTURE = new Date(Date.now() + 20 * 86_400_000).toISOString()
const get = async () => {
  const req = { nextUrl: new URL('http://localhost/api/subscription'), headers: new Headers({ 'x-forwarded-for': '203.0.113.9' }) }
  const res = await GET(req as any)
  return res.json()
}

beforeEach(() => {
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.sub = null
})

describe('GET /api/subscription · source', () => {
  it('an App Store subscription reports source "apple"', async () => {
    h.state.sub = { plan: 'momo', status: 'active', current_period_end: FUTURE, source: 'apple_iap' }
    expect(await get()).toMatchObject({ isPro: true, plan: 'momo', source: 'apple' })
  })

  it.each(['web', 'web_sepay', 'manual', 'google_play', null])('a plan from %s reports source "external"', async (source) => {
    h.state.sub = { plan: 'sunny', status: 'active', current_period_end: FUTURE, source }
    expect(await get()).toMatchObject({ isPro: true, source: 'external' })
  })

  it('no paid plan reports source null (an expired Apple row is not a plan)', async () => {
    h.state.sub = { plan: 'momo', status: 'expired', current_period_end: FUTURE, source: 'apple_iap' }
    expect(await get()).toMatchObject({ isPro: false, source: null })
    h.state.sub = null
    expect(await get()).toMatchObject({ isPro: false, source: null })
  })

  it('an anonymous identity never reports a source', async () => {
    h.state.user = { id: 'u1', is_anonymous: true }
    h.state.sub = { plan: 'momo', status: 'active', current_period_end: FUTURE, source: 'apple_iap' }
    expect(await get()).toMatchObject({ isPro: false, source: null })
  })

  it('stays additive: every field the clients already read is still there', async () => {
    h.state.sub = { plan: 'momo', status: 'active', current_period_end: FUTURE, source: 'apple_iap' }
    expect(Object.keys(await get())).toEqual(expect.arrayContaining([
      'isPro', 'plan', 'status', 'currentPeriodEnd', 'freeDailyLimit', 'quotaPeriod', 'isAnonymous', 'todayMessageCount', 'remaining', 'source',
    ]))
  })
})
