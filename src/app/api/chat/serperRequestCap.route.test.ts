/**
 * CONSULT_REQUEST_CAP · through the REAL chat route (POST). MOCK ONLY: the model is a fake `AI` (it never calls a tool by itself), Supabase is a stub,
 * and the only network is a stub for google.serper.dev (every other URL throws). So these turns exercise the route's own Serper paths — the
 * pre-search (finishTurn → presearch tool call → vendor links → the empty-result second search) and what runs around them — and prove that the turn
 * object the route creates reaches every request they send. They do NOT run Luna, the real AI SDK tool loop through the route (see
 * serperRequestCap.sdkToolLoop.test.ts for the loop), Next.js, Vercel or the production network.
 * What is measured: calls that reach the stubbed fetch, counted per turn; and the cap's own refusal counters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap, requestCapTotals } from '@/lib/ai/tools/serperRequestCap'

const h = vi.hoisted(() => {
  const state = { endpoints: [] as string[] }
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-request-cap-route' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"ok"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: () => Promise.resolve({ text: 'ok', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const prevKey = process.env.SERPER_API_KEY
let logs: string[]

beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'
  delete process.env.TAPPY_AGENT
  vi.stubEnv('CONSULTATIVE_V1', '1')
  vi.stubEnv('CONSULT_V2', '1')
  h.state.endpoints = []; logs = []
  __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      h.state.endpoints.push(new URL(u).pathname)
      return new Response(JSON.stringify({
        organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }],
        shopping: [{ title: 'Item', link: 'https://example.com/i', price: '1.000.000đ', source: 'Shop' }],
        places: [], images: [], credits: 1,
      }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) return new Response('<html></html>', { status: 200 })
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks()
  if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
})

type Msg = { role: 'user' | 'assistant'; content: string }
async function turn(messages: Msg[]): Promise<{ endpoints: string[]; bodyLength: number }> {
  h.state.endpoints = []
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }), signal: undefined,
  }
  const res = await POST(req as never)
  const text = await res.text()
  return { endpoints: [...h.state.endpoints], bodyLength: text.length }
}

const SHOP: Msg[] = [{ role: 'user', content: 'mua tai nghe bluetooth chụp tai dưới 1 triệu để nghe nhạc ở nhà' }]
const PLACE: Msg[] = [{ role: 'user', content: 'quán phở ngon ở quận 1 gần chợ Bến Thành' }]
const capLines = () => logs.filter(l => l.includes('"tappyai_serper_request_cap"')).map(l => JSON.parse(l) as { reason: string })
const turnLines = () => logs.filter(l => l.includes('"tappyai_serper_request_cap_turn"')).map(l => JSON.parse(l) as { limit: number; sent: number; refused: number })

describe('the chat route with CONSULT_REQUEST_CAP (mock model, stub network)', () => {
  it('flag OFF (the default): the shopping turn sends its usual number of requests, more than the cap used below, and the cap code does nothing', async () => {
    const r = await turn(SHOP)
    process.stdout.write('ROUTE_OFF_SHOP ' + JSON.stringify(r.endpoints) + '\n')
    expect(r.endpoints.length).toBeGreaterThan(3)
    expect(requestCapTotals()).toEqual({ reserved: 0, refused: {} })
    expect(turnLines()).toEqual([])
  })

  it('flag ON, cap 3: the same turn reaches fetch EXACTLY 3 times; every refusal is turn_cap (no request ran without the turn object)', async () => {
    const off = (await turn(SHOP)).endpoints.length
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '3')
    __clearToolCache(); __resetRequestCap()
    const r = await turn(SHOP)
    process.stdout.write('ROUTE_ON3_SHOP ' + JSON.stringify({ off, on: r.endpoints }) + '\n')
    expect(r.endpoints).toHaveLength(3)
    expect(off).toBeGreaterThan(3)
    const totals = requestCapTotals()
    expect(totals.refused.no_turn_scope).toBeUndefined()
    expect(totals.refused.config_invalid).toBeUndefined()
    expect(totals.refused.turn_cap).toBeGreaterThan(0) // the turn wanted more than 3 (the flag-OFF run sent `off` > 3), so something was refused
    expect(Object.keys(totals.refused)).toEqual(['turn_cap']) // and for no other reason
    expect(r.bodyLength).toBeGreaterThan(0) // the turn still answered
  })

  it('flag ON, cap 3: the route closes the turn when the stream ends (one summary line: limit, sent, refused)', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '3')
    await turn(SHOP)
    const lines = turnLines()
    expect(lines).toHaveLength(1)
    expect(lines[0].limit).toBe(3)
    expect(lines[0].sent).toBe(3)
  })

  it('flag ON, a cap larger than the turn needs: nothing is refused and the request count equals the flag-OFF count', async () => {
    const off = (await turn(SHOP)).endpoints.length
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '100')
    __clearToolCache(); __resetRequestCap()
    const r = await turn(SHOP)
    expect(r.endpoints).toHaveLength(off)
    expect(requestCapTotals().refused).toEqual({})
  })

  it('flag ON with the value missing: the route still answers, and NO request is sent (fail-closed), visibly (config_invalid)', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1')
    const r = await turn(SHOP)
    expect(r.endpoints).toHaveLength(0)
    expect(r.bodyLength).toBeGreaterThan(0)
    expect(requestCapTotals().refused.config_invalid).toBeGreaterThan(0)
    expect(capLines().every(l => l.reason === 'config_invalid')).toBe(true)
  })

  it('flag ON, a place turn that wants 2 requests with cap 1: one is sent, the other refused for the cap (never for a missing turn object)', async () => {
    const off = (await turn(PLACE)).endpoints
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '1')
    __clearToolCache(); __resetRequestCap()
    const r = await turn(PLACE)
    process.stdout.write('ROUTE_PLACE ' + JSON.stringify({ off, on: r.endpoints }) + '\n')
    expect(off.length).toBeGreaterThan(1)
    expect(r.endpoints).toHaveLength(1)
    expect(Object.keys(requestCapTotals().refused)).toEqual(['turn_cap'])
  })

  it('flag ON, cap = what the shopping turn wanted minus one: the LAST request of the turn is the one refused (nothing escapes at the tail)', async () => {
    const off = (await turn(SHOP)).endpoints
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', String(off.length - 1))
    __clearToolCache(); __resetRequestCap()
    const r = await turn(SHOP)
    expect(r.endpoints).toHaveLength(off.length - 1)
    // The refused request is the LAST one of the turn, and in this turn that is /images: its only caller is resolvePlacePhotos, which the route runs inside
    // afterLoopSerper (route.ts). It was refused for the TURN cap (it had the turn object) — not for a missing one.
    expect(off[off.length - 1]).toBe('/images')
    expect(r.endpoints).toEqual(off.slice(0, -1))
    expect(Object.keys(requestCapTotals().refused)).toEqual(['turn_cap'])
    expect(requestCapTotals().refused.turn_cap).toBe(1)
  })

  it('a second turn gets its own count (the first turn being spent does not starve it); L2 is not applied outside a bench run', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '3'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '1')
    const a = await turn(SHOP)
    __clearToolCache()
    const b = await turn(SHOP)
    expect(a.endpoints).toHaveLength(3)
    expect(b.endpoints).toHaveLength(3)
  })
})
