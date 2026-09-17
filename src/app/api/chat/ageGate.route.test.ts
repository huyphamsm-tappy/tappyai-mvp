/**
 * The 18+ gate (main #251) in the merged V3 route — ORDER IS THE CONTRACT.
 *
 *   getRequestUser → no account / anonymous ⇒ 401 `auth_required`
 *                  → getAgeEligibility ≠ eligible ⇒ 403 `age_*`
 *                  → (suspension gate) → V3 quota SPEND → context → model
 *
 * Owner decision D1 (2026-09-17): chat requires an account. The guest quota path in
 * this route is therefore unreachable, and this file is the proof: a guest never
 * spends quota, never reads eligibility, never reaches the model or a tool. Every
 * refusal above is also proven to cost nothing (no spend, no model call).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: null as null | { id: string; is_anonymous?: boolean },
    eligibility: { status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true } as Record<string, unknown>,
    eligibilityThrows: false,
    calls: { eligibility: 0, spend: 0, model: 0, tools: 0 },
    promptContextAgeBand: undefined as unknown,
  }
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
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => {
    h.state.calls.eligibility++
    if (h.state.eligibilityThrows) throw new Error('rpc down')
    return h.state.eligibility
  },
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()),
  consumeAiQuestion: async () => { h.state.calls.spend++; return { ok: true, remaining: 10, limit: 15 } },
}))
vi.mock('@/lib/ai/contextBuilder', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/contextBuilder')>()
  return {
    ...real,
    buildChatPromptContext: async (userId: string, supabase: unknown, ageBand?: unknown) => {
      h.state.promptContextAgeBand = ageBand
      return real.buildChatPromptContext(userId, supabase as never, ageBand as never)
    },
  }
})
vi.mock('@/lib/security/rateLimit', () => ({
  rateLimit: () => ({ ok: true, retryAfter: 0 }),
  dailyRateLimit: () => ({ ok: true }),
  clientIp: () => '127.0.0.1',
}))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    stream: () => { h.state.calls.model++; return { toDataStreamResponse: () => new Response('', { status: 200, headers: { 'content-type': 'text/plain' } }) } },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
  type: {},
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return { ...real, searchPlaces: async () => { h.state.calls.tools++; return { source: 'test', count: 0, location: '', results: [], place_search_status: 'empty' } } }
})

import { POST } from '@/app/api/chat/route'

const post = async () => {
  const req = {
    url: 'http://localhost/api/chat',
    nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: 'Tìm quán bún bò ngon ở Quận 1' }] }),
    signal: undefined,
  }
  return POST(req as never)
}
const body = async (res: Response) => JSON.parse(await res.text()) as Record<string, unknown>

beforeEach(() => {
  h.state.user = null
  h.state.eligibility = { status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }
  h.state.eligibilityThrows = false
  h.state.calls = { eligibility: 0, spend: 0, model: 0, tools: 0 }
  h.state.promptContextAgeBand = undefined
})

describe('18+ gate before quota and before any model call', () => {
  it('guest (no account): 401 auth_required — no eligibility read, no quota spend, no model, no tool', async () => {
    const res = await post()
    expect(res.status).toBe(401)
    expect(await body(res)).toMatchObject({ error: 'auth_required', upgradeUrl: '/login' })
    expect(h.state.calls).toEqual({ eligibility: 0, spend: 0, model: 0, tools: 0 })
  })
  it('anonymous session: the same 401 — the guest quota path is unreachable (D1)', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    const res = await post()
    expect(res.status).toBe(401)
    expect((await body(res)).error).toBe('auth_required')
    expect(h.state.calls).toEqual({ eligibility: 0, spend: 0, model: 0, tools: 0 })
  })
  it('signed in, no date of birth on file: 403 age_verification_required, nothing spent', async () => {
    h.state.user = { id: 'u1' }
    h.state.eligibility = { status: 'unknown', ageBand: null, age: null, canSelfCorrect: true }
    const res = await post()
    expect(res.status).toBe(403)
    const b = await body(res)
    expect(b.error).toBe('age_verification_required')
    expect(typeof b.message).toBe('string')
    expect(h.state.calls).toEqual({ eligibility: 1, spend: 0, model: 0, tools: 0 })
  })
  it('underage: 403 age_ineligible, nothing spent', async () => {
    h.state.user = { id: 'u1' }
    h.state.eligibility = { status: 'ineligible', ageBand: 'under_18', age: 16, canSelfCorrect: true }
    const res = await post()
    expect(res.status).toBe(403)
    expect((await body(res)).error).toBe('age_ineligible')
    expect(h.state.calls).toEqual({ eligibility: 1, spend: 0, model: 0, tools: 0 })
  })
  it('the eligibility read failing closes the gate (403), still nothing spent', async () => {
    h.state.user = { id: 'u1' }
    h.state.eligibilityThrows = true
    const res = await post()
    expect(res.status).toBe(403)
    expect(h.state.calls.spend).toBe(0)
    expect(h.state.calls.model).toBe(0)
  })
  it('verified adult: quota is spent exactly once, then the model runs, and the age band reaches the prompt context', async () => {
    h.state.user = { id: 'u1' }
    const res = await post()
    expect(res.status).toBe(200)
    expect(h.state.calls.eligibility).toBe(1)
    expect(h.state.calls.spend).toBe(1)
    expect(h.state.calls.model).toBe(1)
    expect(h.state.promptContextAgeBand).toBe('25_34')
  })
})
