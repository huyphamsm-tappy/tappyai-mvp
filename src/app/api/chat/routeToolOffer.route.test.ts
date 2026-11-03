/**
 * Round 3h-4 · Việc 1: which turns make the ROUTE itself call search_products before the model, with ROUTE_TOOL_OFFER_GUARD on and off.
 * MOCK-ONLY through the real POST /api/chat (legacy path). The model layer is a stub that records the stream options and never calls a model.
 * Serper is answered by a fetch stub that RECORDS each request (endpoint + query); any other URL throws (no network, ever).
 * The evidence is the Serper endpoint and query the route sent before the model: /shopping = search_products, /search = other tools.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'

const h = vi.hoisted(() => {
  const state = { serper: [] as Array<{ endpoint: string; q: string }>, streamed: 0 }
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-tool-offer-test' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => { h.state.streamed++; return { toDataStreamResponse: () => new Response('0:"ok"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }) } },
    step: () => Promise.resolve({ text: 'ok', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

// VERCEL_ENV / NODE_ENV are not set or deleted here: the route test never sets them, so it leaves the process values alone.
const LOCK = ['ROUTE_TOOL_OFFER_GUARD', 'BENCH_SPEND_GATE', 'BENCH_SPEND_RUN_CAP_USD', 'BENCH_CONFIRM_SPEND']
const prevKey = process.env.SERPER_API_KEY
beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'
  delete process.env.TAPPY_AGENT
  // The consultative path the shopping pre-search belongs to (the vitest setup pins both OFF unless a suite turns them on).
  vi.stubEnv('CONSULTATIVE_V1', '1')
  vi.stubEnv('CONSULT_V2', '1')
  for (const k of LOCK) delete process.env[k]
  h.state.serper = []; h.state.streamed = 0
  __clearToolCache(); __resetAiQuestionQuotaLocal()
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      const endpoint = new URL(u).pathname
      let q = ''
      try { q = String((JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? '') } catch { q = '' }
      h.state.serper.push({ endpoint, q })
      return new Response(JSON.stringify({ organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }], shopping: [{ title: 'Item', link: 'https://example.com/i', price: '1.000.000đ', source: 'Shop' }], credits: 1 }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) return new Response('<html></html>', { status: 200 })
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const k of LOCK) delete process.env[k]
  if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
})

type Msg = { role: 'user' | 'assistant'; content: string }
/** One POST /api/chat over a message list; returns the Serper requests the route sent BEFORE the model (the model is a stub). */
async function routeSearches(messages: Msg[]): Promise<{ serper: Array<{ endpoint: string; q: string }>; presearch: string[] }> {
  h.state.serper = []
  // Each run starts with an empty tool cache: otherwise the second run of a pair is answered from cache and sends no request (observed).
  __clearToolCache(); __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }), signal: undefined,
  }
  const logs = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { if (DEBUG) process.stdout.write('LOG ' + String(a[0]).slice(0, 220) + '\n') })
  let body = ''
  try { body = await (await POST(req as never)).text() } finally { logs.mockRestore() }
  // The pre-call the route ran before the model shows in the stream as a `presearch_` tool event (its tool name is the evidence, even when
  // the spend gate refuses the request under the bench gate, which it does outside a bench run).
  const presearch = [...body.matchAll(/presearch_[0-9a-f]+","toolName":"([a-z_]+)"/g)].map(m => m[1])
  if (DEBUG) process.stdout.write('PRESEARCH ' + JSON.stringify(presearch) + ' STREAMED=' + h.state.streamed + '\n')
  return { serper: [...h.state.serper], presearch }
}

const DEBUG = process.env.TOOL_OFFER_PROBE === '1'
const SCENARIOS: Array<[string, Msg[]]> = [
  ['first purchase, known family', [{ role: 'user', content: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu' }]],
  ['first purchase, outside the families', [{ role: 'user', content: 'tôi muốn mua máy sấy tóc Philips' }]],
  ['first buy-verb question', [{ role: 'user', content: 'nên mua laptop nào cho sinh viên?' }]],
  ['specified purchase, known family', [{ role: 'user', content: 'mua tai nghe bluetooth chụp tai dưới 1 triệu để nghe nhạc ở nhà' }]],
  ['specified purchase, outside the families', [{ role: 'user', content: 'mua máy sấy tóc Philips dưới 1 triệu cho tóc dày ở nhà' }]],
  ['clarify, then a gold price question [KNOWN DEFECT: current behaviour]', [
    { role: 'user', content: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu' },
    { role: 'assistant', content: 'Để chọn đúng tai nghe cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"line","q":"Loại nào?","options":["Nhét tai","Chụp tai"]}]}[/TAPPY_ASK]' },
    { role: 'user', content: 'giá vàng SJC mua vào, bán ra hôm nay bao nhiêu?' },
  ]],
  ['clarify, then the real answer', [
    { role: 'user', content: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu' },
    { role: 'assistant', content: 'Để chọn đúng tai nghe cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"line","q":"Loại nào?","options":["Nhét tai","Chụp tai"]}]}[/TAPPY_ASK]' },
    { role: 'user', content: 'chụp tai' },
  ]],
  ['D8 price question (verbatim)', [{ role: 'user', content: 'Hiện nay giá vàng SJC mua vào, bán ra khoảng bao nhiêu? Nêu thời điểm của số liệu và nguồn.' }]],
  ['D2 knowledge question (verbatim)', [{ role: 'user', content: 'Giải thích ngắn gọn khác biệt giữa pin lithium-ion và pin LiFePO4 cho xe máy điện.' }]],
  ['pick after a shopping list', [
    { role: 'user', content: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu' },
    { role: 'assistant', content: 'Mình tìm được: 1. Tai nghe A 2. Tai nghe B 3. Tai nghe C' },
    { role: 'user', content: 'mình chọn cái thứ 2' },
  ]],
  ['unrelated price question after a shopping list', [
    { role: 'user', content: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu' },
    { role: 'assistant', content: 'Mình tìm được: 1. Tai nghe A 2. Tai nghe B 3. Tai nghe C' },
    { role: 'user', content: 'giá vàng SJC mua vào, bán ra hôm nay bao nhiêu?' },
  ]],
  ['reject after a shopping list', [
    { role: 'user', content: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu' },
    { role: 'assistant', content: 'Mình tìm được: 1. Tai nghe A 2. Tai nghe B 3. Tai nghe C' },
    { role: 'user', content: 'cái đó không hợp, bác đổi cái khác' },
  ]],
]

// What the route pre-calls before the model, observed through the stream (presearch_ event). Recorded on the mock run of round 3h-4.
// The Serper requests themselves are not asserted: with the bench gate set, the spend gate refuses them outside a bench runner ("no_gate").
// KNOWN DEFECT (baseline, not caused by the flag): the "[KNOWN DEFECT: current behaviour]" row pre-calls search_products with the product
// the clarify was about. This row records CURRENT behaviour, not desired behaviour (Owner options A/B/C still open). consultRouter turns any answer to a shopping clarify into pick + the earlier query (consultRouter.ts:1024-1039).
// It is pinned here so that a change shows up; it is NOT a decision about behaviour (Owner decision pending, see round 3h4 report).
const EXPECTED: Record<string, string[]> = {
  'first purchase, known family': [],
  'first purchase, outside the families': [],
  'first buy-verb question': [],
  'specified purchase, known family': ['search_products'],
  'specified purchase, outside the families': [],
  'clarify, then a gold price question [KNOWN DEFECT: current behaviour]': ['search_products'],
  'clarify, then the real answer': ['search_products'],
  'D8 price question (verbatim)': [],
  'D2 knowledge question (verbatim)': [],
  'pick after a shopping list': [],
  'unrelated price question after a shopping list': [],
  'reject after a shopping list': [],
}

describe('route pre-call before the model: the same with the flag OFF and ON (observed; flag must not change these rows)', () => {
  it('has an expectation for every scenario', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(SCENARIOS.map(([n]) => n).sort())
  })
  for (const [name, msgs] of SCENARIOS) {
    it(`${name}: OFF and ON give the same pre-call, as recorded`, async () => {
      const off = await routeSearches(msgs)
      for (const k of LOCK) delete process.env[k]
      // ON = the flag AND the bench spend gate with both caps.
      process.env.ROUTE_TOOL_OFFER_GUARD = '1'; process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.10'; process.env.BENCH_CONFIRM_SPEND = '0.10'
      const on = await routeSearches(msgs)
      for (const k of LOCK) delete process.env[k]
      expect(off.presearch).toEqual(EXPECTED[name])
      expect(on.presearch).toEqual(EXPECTED[name])
    })
  }
})
