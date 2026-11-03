/**
 * The AI-consent gate in the chat route (App Review 5.1.2(i)). It runs before the intent read, the quota spend and the
 * model call, so a refused or unanswered iOS account sends nothing to the provider. Web-only accounts are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1' } as null | { id: string; is_anonymous?: boolean },
    consentRows: [] as Array<Record<string, unknown>>,
    consentError: null as null | { code?: string; message: string },
    calls: { spend: 0, model: 0, intent: 0 },
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
  const consentTable = (): any => ({
    select: () => ({ in: async () => ({ data: state.consentRows, error: state.consentError }) }),
  })
  const admin = {
    from: (table: string) => (table === 'ai_data_consent' ? consentTable() : builder()),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) }, admin }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return {
    ...real,
    consumeAiQuestion: async () => {
      h.state.calls.spend++
      return { ok: true, remaining: 10, limit: 15 }
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
    extract: () => { h.state.calls.intent++; return Promise.resolve({}) },
    stream: () => { h.state.calls.model++; return { toDataStreamResponse: () => new Response('', { status: 200, headers: { 'content-type': 'text/plain' } }) } },
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
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

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

beforeEach(() => {
  h.state.user = { id: 'u1' }
  h.state.consentRows = []
  h.state.consentError = null
  h.state.calls = { spend: 0, model: 0, intent: 0 }
  __resetAiQuestionQuotaLocal()
})

describe('chat — AI consent before any model call', () => {
  it('Web-only account (no iOS record): answers as before', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(h.state.calls.model).toBe(1)
  })

  it('iOS account that has not answered the sheet: 403, no intent read, no spend, no model', async () => {
    h.state.consentRows = [{ user_id: 'u1', ios_used: true, granted: null, decision: null, version: null }]
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'ai_consent_required' })
    expect(h.state.calls).toEqual({ spend: 0, model: 0, intent: 0 })
  })

  it('iOS account that refused: 403, nothing sent', async () => {
    h.state.consentRows = [{ user_id: 'u1', ios_used: true, granted: false, decision: 'refused', version: 2 }]
    expect((await post()).status).toBe(403)
    expect(h.state.calls).toEqual({ spend: 0, model: 0, intent: 0 })
  })

  it('iOS account that withdrew: 403, nothing sent', async () => {
    h.state.consentRows = [{ user_id: 'u1', ios_used: true, granted: false, decision: 'withdrawn', version: 2 }]
    expect((await post()).status).toBe(403)
    expect(h.state.calls.model).toBe(0)
  })

  it('iOS account that agreed to the current disclosure: answers', async () => {
    h.state.consentRows = [{ user_id: 'u1', ios_used: true, granted: true, decision: 'agreed', version: 2 }]
    expect((await post()).status).toBe(200)
    expect(h.state.calls.model).toBe(1)
  })

  it('iOS account that agreed to an older disclosure (stale): 403, nothing sent', async () => {
    h.state.consentRows = [{ user_id: 'u1', ios_used: true, granted: true, decision: 'agreed', version: 1 }]
    expect((await post()).status).toBe(403)
    expect(h.state.calls.model).toBe(0)
  })

  it('consent read error: 403, nothing sent (cannot verify)', async () => {
    h.state.consentError = { code: 'XX000', message: 'boom' }
    expect((await post()).status).toBe(403)
    expect(h.state.calls).toEqual({ spend: 0, model: 0, intent: 0 })
  })
})
