/**
 * R13 cost gate (10/11/2026) on /api/chat, as behaviour: a signed-in account's DAY of money is reserved before the model runs.
 * Off by default (AI_COST_GATE); with it on, a turn that does not fit is a 429 `daily_cost_limit_reached` before any model call, a
 * canned turn costs nothing and is never refused, and accounts are metered separately. The counter is the REAL one, in-process (no KV in tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = { user: null as null | { id: string; is_anonymous?: boolean }, calls: { model: 0 }, ip: '10.0.0.1' }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
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
  consumeAiQuestion: async () => ({ ok: true, remaining: 10, limit: 15, refund: null }),
}))
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
import { __resetKvCounters, incrDailyCounter } from '@/lib/security/kvCounter'
import { dayCostMicros, toMicros } from '@/lib/ai/cost/costGate'

beforeEach(() => { vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) }) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// Fixtures as escapes: the i18n ratchet (webHardcodedUiStrings) scans src/app for Vietnamese code points.
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
const uid = (k: number) => `00000000-0000-4000-8000-${String(n * 100 + k).padStart(12, '0')}`
beforeEach(() => { n++; __resetKvCounters(); h.state.user = { id: uid(1) }; h.state.calls.model = 0; h.state.ip = `10.0.${n}.1` })

describe('the gate is off by default', () => {
  it('turns are never refused for money when AI_COST_GATE is not "1", however many', async () => {
    vi.stubEnv('AI_COST_DAILY_CAP_USD_FREE', '0.01')
    for (let i = 0; i < 4; i++) expect((await post()).status).toBe(200)
  })
})

// The mocked model reports a cost of 0, and a turn is SETTLED to its real cost, so the day total would never grow here. The money already spent
// today is therefore put on the account's counter directly (the same key the gate uses), exactly as earlier real turns would have.
const spendToday = (userId: string, usd: number) => incrDailyCounter(`ai:cost:u:${userId}`, toMicros(usd))

describe('the gate is on', () => {
  beforeEach(() => { vi.stubEnv('AI_COST_GATE', '1'); vi.stubEnv('AI_COST_DAILY_CAP_USD_FREE', '0.10') }) // a chat turn reserves 0.05

  it('admits a turn that fits, and settles it down to its real cost', async () => {
    await spendToday(h.state.user!.id, 0.04) // 0.04 + 0.05 = 0.09 <= 0.10
    expect((await post()).status).toBe(200)
    expect(h.state.calls.model).toBeGreaterThan(0)
    // The mocked turn really cost nothing: the 0.05 reservation is replaced by 0, so only the earlier 0.04 remains.
    expect(await dayCostMicros(h.state.user!.id)).toBe(toMicros(0.04))
  })

  it('refuses a turn that does not fit: 429 daily_cost_limit_reached with a sentence, NO model call, nothing left reserved', async () => {
    await spendToday(h.state.user!.id, 0.08) // 0.08 + 0.05 = 0.13 > 0.10
    const modelBefore = h.state.calls.model
    const res = await post()
    expect(res.status).toBe(429)
    const b = JSON.parse(await res.text()) as { error: string; message: string }
    expect(b.error).toBe('daily_cost_limit_reached')
    expect(b.message.length).toBeGreaterThan(10)
    expect(b.message).not.toMatch(/\d/) // the person is never told a figure
    expect(h.state.calls.model).toBe(modelBefore)
    expect(await dayCostMicros(h.state.user!.id)).toBe(toMicros(0.08))
  })

  it('a canned turn costs nothing: it is answered even when the ceiling is reached', async () => {
    await spendToday(h.state.user!.id, 0.10)
    expect((await post()).status).toBe(429)
    expect((await post('cảm ơn nhé')).status).toBe(200)
  })

  it('accounts are metered separately', async () => {
    await spendToday(h.state.user!.id, 0.10)
    expect((await post()).status).toBe(429)
    h.state.user = { id: uid(2) }
    expect((await post()).status).toBe(200)
  })
})
