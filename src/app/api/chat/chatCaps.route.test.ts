/**
 * A2 (2026-09-20) — SPEND CAPS ON /api/chat, as behaviour.
 *
 *   per IP        30/min   (was in-process only; now publicRateLimit — shared when KV is configured)
 *   per account   20/min   (new: one account behind many IPs)
 *   Pro per day   300      (new: Pro was unlimited)
 *
 * Every refusal is a 429 with a server-written sentence and costs no model call. Numbers are env
 * overrides (chatCaps.ts). These drive the REAL limiters against the in-process store (no KV in
 * tests), the way `publicRateLimit` runs on a deployment without credentials.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: null as null | { id: string; is_anonymous?: boolean },
    pro: false,
    calls: { model: 0 },
    ip: '10.0.0.1',
  }
  const builder = (table?: string): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve(table === 'subscriptions' && state.pro ? { data: { status: 'active', current_period_end: new Date(Date.now() + 86_400_000).toISOString() }, error: null } : { data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: (t: string) => builder(t), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }) }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()),
  consumeAiQuestion: async () => ({ ok: true, remaining: 10, limit: 15 }),
}))
// The IP is the test's to set; the limiters themselves are REAL.
vi.mock('@/lib/security/rateLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/rateLimit')>()),
  clientIp: () => h.state.ip,
}))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    stream: () => { h.state.calls.model++; return { toDataStreamResponse: () => new Response('0:"ok"\n', { status: 200, headers: { 'content-type': 'text/plain' } }) } },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
  type: {},
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return { ...real, searchPlaces: async () => ({ source: 'test', count: 0, location: '', results: [], place_search_status: 'empty' }) }
})

import { POST } from '@/app/api/chat/route'
import { CHAT_IP_BURST_PER_MINUTE, CHAT_USER_BURST_PER_MINUTE, PRO_DAILY_CHAT_CAP } from '@/lib/security/chatCaps'

const post = async (text = 'Tìm quán bún bò ngon ở Quận 1 cho 2 người, dưới 100k') => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: text }], userLocation: { lat: 10.7769, lng: 106.7009 } }),
    signal: undefined,
  }
  const res = await POST(req as never)
  if (res.status === 200 && res.body) await res.text() // drive a deferred turn so the model call is counted
  return res
}

let n = 0
beforeEach(() => { n++; h.state.user = { id: `u-${n}` }; h.state.pro = false; h.state.calls.model = 0; h.state.ip = `10.0.${n}.1` })

describe('the caps exist and are env-tunable defaults', () => {
  it('30 / 20 / 300', () => {
    expect(CHAT_IP_BURST_PER_MINUTE).toBe(30)
    expect(CHAT_USER_BURST_PER_MINUTE).toBe(20)
    expect(PRO_DAILY_CHAT_CAP).toBe(300)
  })
})

describe('per-account burst', () => {
  it(`the ${CHAT_USER_BURST_PER_MINUTE + 1}th turn in a minute from one account is a 429 with a sentence, and no model call — even from a fresh IP each time`, async () => {
    for (let i = 0; i < CHAT_USER_BURST_PER_MINUTE; i++) {
      h.state.ip = `10.1.${n}.${i}` // a new IP every request: the IP cap never fires
      expect((await post()).status).toBe(200)
    }
    const modelBefore = h.state.calls.model
    h.state.ip = `10.1.${n}.99`
    const res = await post()
    expect(res.status).toBe(429)
    const b = JSON.parse(await res.text()) as { error: string; message: string }
    expect(b.error).toBe('rate_limit')
    expect(b.message.length).toBeGreaterThan(10)
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/)
    expect(h.state.calls.model).toBe(modelBefore)
  })
})

describe('per-IP burst', () => {
  it(`the ${CHAT_IP_BURST_PER_MINUTE + 1}th request in a minute from one IP is a 429 before identity, quota or model`, async () => {
    for (let i = 0; i < CHAT_IP_BURST_PER_MINUTE; i++) {
      h.state.user = { id: `ip-user-${n}-${i}` } // a new account each time: only the IP cap can fire
      expect((await post()).status).toBe(200)
    }
    h.state.user = { id: `ip-user-${n}-x` }
    const modelBefore = h.state.calls.model
    const res = await post()
    expect(res.status).toBe(429)
    expect((JSON.parse(await res.text()) as { error: string }).error).toBe('rate_limit')
    expect(h.state.calls.model).toBe(modelBefore)
  })
})

describe('Pro daily ceiling', () => {
  it(`a Pro account's ${PRO_DAILY_CHAT_CAP + 1}th model turn of the day is a 429 pro_daily_limit_reached with the graceful sentence; canned turns do not count`, async () => {
    h.state.pro = true
    // 300 real turns would trip the 20/min burst first; the day's count is driven to the cap through
    // the same limiter the route consults, then the 301st turn is a real request.
    const { publicDailyRateLimit } = await import('@/lib/security/publicRateLimit')
    for (let i = 0; i < PRO_DAILY_CHAT_CAP; i++) await publicDailyRateLimit(`chat:pro:${h.state.user!.id}`, PRO_DAILY_CHAT_CAP)
    const canned = await post('cảm ơn nhé') // canned chit-chat — $0, exempt from every quota
    expect(canned.status).toBe(200)
    const modelBefore = h.state.calls.model
    const res = await post()
    expect(res.status).toBe(429)
    const b = JSON.parse(await res.text()) as { error: string; message: string }
    expect(b.error).toBe('pro_daily_limit_reached')
    expect(b.message).toContain(String(PRO_DAILY_CHAT_CAP))
    expect(h.state.calls.model).toBe(modelBefore)
  })
  it('a free account is not touched by the Pro ceiling (its pool is the shared 15/day)', async () => {
    h.state.pro = false
    const { publicDailyRateLimit } = await import('@/lib/security/publicRateLimit')
    for (let i = 0; i < PRO_DAILY_CHAT_CAP; i++) await publicDailyRateLimit(`chat:pro:${h.state.user!.id}`, PRO_DAILY_CHAT_CAP)
    expect((await post()).status).toBe(200)
  })
})
