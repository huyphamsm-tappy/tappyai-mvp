/**
 * Wave 2J (J1d) — with CONSULT_KNOWLEDGE_TURN_TOOLS on, the web_search the flag adds goes through the REAL Serper request cap. MOCK ONLY: the model is scripted (it calls web_search three times
 * with different queries), Supabase is a stub, the only network is a stub for google.serper.dev (every other URL throws). What is measured: requests that reach the stubbed fetch per turn.
 * Not covered here: the per-RUN cap (CONSULT_REQUEST_CAP_PER_RUN only applies inside a bench run - see liveTrial / serperRequestCap tests) and a real provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap, requestCapTotals } from '@/lib/ai/tools/serperRequestCap'

const h = vi.hoisted(() => {
  const state = { endpoints: [] as string[], toolNames: [] as string[], results: [] as unknown[] }
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-knowledge-cap-route' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.resolve({
      object: { domains: ['food'], turn: 'chat', goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null },
      usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {},
    }),
    stream: (opts: Record<string, any>) => {
      h.state.toolNames = Object.keys(opts.tools ?? {})
      return {
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            for (const [i, q] of ['alpha topic one', 'beta topic two', 'gamma topic three'].entries()) {
              if (!opts.tools?.web_search) break
              const call = { toolCallId: `w${i}`, toolName: 'web_search', args: { query: q } }
              c.enqueue(enc.encode(`9:${JSON.stringify(call)}\n`))
              const result = await opts.tools.web_search.execute(call.args, { toolCallId: call.toolCallId, messages: [] })
              h.state.results.push(result)
              c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: call.toolCallId, result })}\n`))
            }
            c.enqueue(enc.encode('0:"ok"\n'))
            try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop', text: 'ok', steps: [] }) } catch { /* mock */ }
            c.enqueue(enc.encode('d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'))
            c.close()
          },
        }), { status: 200, headers: { 'content-type': 'text/plain' } }),
      }
    },
    step: () => Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const prevKey = process.env.SERPER_API_KEY
beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'
  delete process.env.TAPPY_AGENT
  vi.stubEnv('CONSULTATIVE_V1', '1'); vi.stubEnv('CONSULT_V2', '1')
  h.state.endpoints = []; h.state.toolNames = []; h.state.results = []
  __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      h.state.endpoints.push(new URL(u).pathname)
      return new Response(JSON.stringify({ organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }], places: [], images: [], credits: 1 }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) return new Response('<html></html>', { status: 200 })
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks()
  if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
})

async function turn(): Promise<{ endpoints: string[] }> {
  h.state.endpoints = []
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: 'Tiểu sử ngắn gọn của một nhà phát minh nổi tiếng.' }] }), signal: undefined,
  }
  await (await POST(req as never)).text()
  return { endpoints: [...h.state.endpoints] }
}

describe('web_search added by CONSULT_KNOWLEDGE_TURN_TOOLS goes through the real Serper request cap (mock model, stub network)', () => {
  beforeEach(() => { vi.stubEnv('CONSULT_SEARCH_NOW_INTENT_GATE', '1'); vi.stubEnv('CONSULT_KNOWLEDGE_TURN_TOOLS', '1') })

  it('no cap flag: the three scripted web_search calls all reach the stubbed Serper (so the tool really runs on this turn)', async () => {
    const r = await turn()
    expect(h.state.toolNames).toContain('web_search')
    expect(r.endpoints).toEqual(['/search', '/search', '/search'])
  })

  it('cap armed, 2 per turn: exactly 2 reach Serper; the third is refused for the turn cap and the tool answers without a request', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '2')
    __clearToolCache(); __resetRequestCap()
    const r = await turn()
    expect(r.endpoints).toHaveLength(2)
    const totals = requestCapTotals()
    expect(totals.refused.turn_cap).toBeGreaterThan(0)
    expect(Object.keys(totals.refused)).toEqual(['turn_cap'])
  })

  it('cap armed, 1 per turn: exactly 1 reaches Serper', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '1')
    __clearToolCache(); __resetRequestCap()
    expect((await turn()).endpoints).toHaveLength(1)
  })

  it('flag value missing for the cap (armed but no per-turn value): fail-closed, no request is sent', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1')
    __clearToolCache(); __resetRequestCap()
    expect((await turn()).endpoints).toHaveLength(0)
  })
})
