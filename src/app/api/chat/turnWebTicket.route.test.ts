/**
 * TURN_WEB_TICKET through the REAL legacy route (POST /api/chat, no TAPPY_AGENT): does the route create ONE ticket per request, and are the
 * tool objects it hands to AI.stream() the ones that run under it? MOCK-ONLY: the model layer is a stub that only records the stream options;
 * Serper and DuckDuckGo are answered by a fetch stub and any other URL throws (no network, ever). The tools are then run by the test, exactly
 * as the SDK would run them (same objects, in parallel).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'

const h = vi.hoisted(() => {
  const state = { opts: null as null | { tools?: Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }> }, sent: { serper: 0, ddg: 0 } }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-ticket-test' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: (o: never) => { h.state.opts = o; return { toDataStreamResponse: () => new Response('0:"ok"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }) } },
    step: () => Promise.resolve({ text: 'ok', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const prevKey = process.env.SERPER_API_KEY
beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'
  delete process.env.TAPPY_AGENT
  h.state.opts = null; h.state.sent = { serper: 0, ddg: 0 }
  __clearToolCache(); __resetAiQuestionQuotaLocal()
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      h.state.sent.serper++
      return new Response(JSON.stringify({ organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }], credits: 1 }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) { h.state.sent.ddg++; return new Response('<html></html>', { status: 200 }) }
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => {
  vi.unstubAllGlobals(); delete process.env.TURN_WEB_TICKET; delete process.env.SEARCH_FALLBACK_GATE
  if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
})

type Tools = NonNullable<NonNullable<typeof h.state.opts>['tools']>
/** One POST /api/chat; returns the tool objects the route handed to AI.stream(). */
async function postTools(text: string): Promise<Tools> {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: text }] }), signal: undefined,
  }
  const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try { await (await POST(req as never)).text() } finally { logs.mockRestore() }
  const tools = h.state.opts?.tools
  if (!tools?.web_search) throw new Error('the route did not hand a web_search tool to AI.stream() — this test cannot say anything')
  return tools
}
const ctx = { toolCallId: 't', messages: [] as unknown[] }
const blocked = (r: unknown) => JSON.stringify(r).includes('search_budget_used')

describe('legacy route: TURN_WEB_TICKET', () => {
  it('[ticket=ON] the web_search tools of ONE request share one ticket: two parallel calls send one Serper request, the other is stopped honestly', async () => {
    process.env.TURN_WEB_TICKET = '1'
    const tools = await postTools('tỷ giá USD hôm nay là bao nhiêu')
    const [a, b] = await Promise.all([tools.web_search.execute({ query: 'ty gia usd vcb' }, ctx), tools.web_search.execute({ query: 'ty gia usd techcombank' }, ctx)])
    expect(h.state.sent.serper).toBe(1)
    expect(h.state.sent.ddg).toBe(0)
    expect([a, b].filter(blocked)).toHaveLength(1)
  })

  it('[ticket=ON] two requests (two POSTs) each get their own ticket', async () => {
    process.env.TURN_WEB_TICKET = '1'
    const t1 = await postTools('tỷ giá USD hôm nay là bao nhiêu')
    const t2 = await postTools('giá vàng SJC hôm nay')
    const [a, b] = await Promise.all([t1.web_search.execute({ query: 'ty gia usd one' }, ctx), t2.web_search.execute({ query: 'gia vang sjc two' }, ctx)])
    expect(h.state.sent.serper).toBe(2)
    expect(blocked(a) || blocked(b)).toBe(false)
  })

  it('[ticket=OFF] legacy: nothing is wrapped or limited — both parallel calls are sent', async () => {
    const tools = await postTools('tỷ giá USD hôm nay là bao nhiêu')
    const [a, b] = await Promise.all([tools.web_search.execute({ query: 'ty gia usd vcb off' }, ctx), tools.web_search.execute({ query: 'ty gia usd techcombank off' }, ctx)])
    expect(h.state.sent.serper).toBe(2)
    expect(blocked(a) || blocked(b)).toBe(false)
  })
})
