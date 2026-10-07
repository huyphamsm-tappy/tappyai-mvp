/**
 * The 18+ gate in the merged V3 route — ORDER IS THE CONTRACT.
 *
 *   getRequestUser → GUEST (no account / anonymous): device declaration
 *                      none ⇒ 403 `age_declaration_required` · under 18 ⇒ 403 `age_ineligible`
 *                      18+ ⇒ V3's lifetime trial quota (5) ⇒ model; 6th ⇒ 401 `anon_limit_reached`
 *                  → ACCOUNT: getAgeEligibility ≠ eligible ⇒ 403 `age_*` (main #251)
 *                  → (suspension gate) → quota SPEND → context → model
 *
 * Owner decision D1, revised 2026-09-17: guests keep the trial AND the gate. Every
 * refusal is proven to cost nothing (no eligibility read for a guest, no quota
 * spend, no model, no tool), and identity failure fails CLOSED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: null as null | { id: string; is_anonymous?: boolean },
    eligibility: { status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true } as Record<string, unknown>,
    eligibilityThrows: false,
    calls: { eligibility: 0, spend: 0, model: 0, tools: 0 },
    promptContextAgeBand: undefined as unknown,
    /** When true the REAL quota module runs (in-process store) so the lifetime trial can be counted down. */
    realQuota: false,
    identityThrows: false,
    headers: {} as Record<string, string>,
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
  getRequestUser: () => h.state.identityThrows ? Promise.reject(new Error('auth down')) : Promise.resolve({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => {
    h.state.calls.eligibility++
    if (h.state.eligibilityThrows) throw new Error('rpc down')
    return h.state.eligibility
  },
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return {
    ...real,
    consumeAiQuestion: async (identity: Parameters<typeof real.consumeAiQuestion>[0]) => {
      h.state.calls.spend++
      if (h.state.realQuota) return real.consumeAiQuestion(identity)
      return { ok: true, remaining: 10, limit: 15 }
    },
  }
})
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
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { ANON_LIFETIME_LIMIT } from '@/lib/config/product'

const post = async () => {
  const req = {
    url: 'http://localhost/api/chat',
    nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', ...h.state.headers }),
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
  h.state.realQuota = false
  h.state.identityThrows = false
  h.state.headers = {}
  __resetAiQuestionQuotaLocal()
})

describe('GUEST — the trial behind a device self-declaration (D1 revised)', () => {
  it('anonymous session, nothing declared: 403 age_declaration_required — no eligibility read, no spend, no model, no tool', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    const res = await post()
    expect(res.status).toBe(403)
    const b = await body(res)
    expect(b).toMatchObject({ error: 'age_declaration_required', upgradeUrl: '/age-check' })
    expect(typeof b.message).toBe('string')
    expect(h.state.calls).toEqual({ eligibility: 0, spend: 0, model: 0, tools: 0 })
  })
  it('no verified identity at all, nothing declared: the same 403', async () => {
    const res = await post()
    expect(res.status).toBe(403)
    expect((await body(res)).error).toBe('age_declaration_required')
    expect(h.state.calls).toEqual({ eligibility: 0, spend: 0, model: 0, tools: 0 })
  })
  it('declared under 18 (cookie): 403 age_ineligible, nothing spent', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    h.state.headers = { cookie: 'tappy_guest_age=2015-06-01' }
    const res = await post()
    expect(res.status).toBe(403)
    expect((await body(res)).error).toBe('age_ineligible')
    expect(h.state.calls).toEqual({ eligibility: 0, spend: 0, model: 0, tools: 0 })
  })
  it('declared 18+ (cookie): the trial quota is spent once, then the model runs — no account eligibility read, no age band in the prompt', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    h.state.headers = { cookie: 'tappy_guest_age=1990-01-01' }
    const res = await post()
    expect(res.status).toBe(200)
    expect(h.state.calls).toMatchObject({ eligibility: 0, spend: 1, model: 1 })
    expect(h.state.promptContextAgeBand).toBeUndefined()
  })
  it('declared 18+ via the app header (Android): allowed', async () => {
    h.state.user = { id: 'anon-2', is_anonymous: true }
    h.state.headers = { 'x-tappy-age-declared': '18plus' }
    expect((await post()).status).toBe(200)
  })
  it(`18+ guest gets exactly ${ANON_LIFETIME_LIMIT} answers, then the sign-in prompt (401 anon_limit_reached) with no model call`, async () => {
    h.state.user = { id: 'anon-trial', is_anonymous: true }
    h.state.headers = { cookie: 'tappy_guest_age=1990-01-01' }
    h.state.realQuota = true
    for (let i = 1; i <= ANON_LIFETIME_LIMIT; i++) expect((await post()).status, `answer ${i}`).toBe(200)
    expect(h.state.calls.model).toBe(ANON_LIFETIME_LIMIT)
    const res = await post()
    expect(res.status).toBe(401)
    expect(await body(res)).toMatchObject({ error: 'anon_limit_reached', upgradeUrl: '/login' })
    expect(h.state.calls.model).toBe(ANON_LIFETIME_LIMIT)
  })
  it('identity resolution throwing does NOT ungate: no declaration ⇒ 403, a declaration ⇒ treated as a guest', async () => {
    h.state.identityThrows = true
    const refused = await post()
    expect(refused.status).toBe(403)
    expect((await body(refused)).error).toBe('age_declaration_required')
    expect(h.state.calls.model).toBe(0)
    h.state.headers = { cookie: 'tappy_guest_age=18plus' }
    expect((await post()).status).toBe(200)
  })
})

describe('ACCOUNT — 18+ gate before quota and before any model call (main #251)', () => {
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
