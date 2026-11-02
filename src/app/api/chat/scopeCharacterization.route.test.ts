/**
 * Round 3J · characterization (SPEC, not behaviour we want): does a per-turn AsyncLocalStorage budget scope opened AROUND the POST handler
 * reach the point where each Serper request is sent?  MOCK-ONLY, production code unchanged.
 *
 * How it measures (no test-assigned variable stands in for the scope):
 *   · the probe is the real `turnCreditsRemaining()` + `turnCreditsSpent()` read INSIDE the fetch stub, i.e. at the moment serperPost calls fetch.
 *     Outside a scope both are the no-scope values (Infinity / 0); inside, the scope's limit is remaining + spent.
 *   · each turn gets its own limit, so a request can be attributed to the turn whose scope it saw.
 *   · the test records a PHASE label at each step (handler, after_handler, body_read). The label is where the TEST was when the request was
 *     seen at fetch; it is NOT measured as the request's creation context, and no assertion below depends on the timing of the send.
 *   · the response body is read either INSIDE the scope (`readInside: true`) or AFTER the scope has exited (`readInside: false`).
 *   · the probe reports the OUTERMOST scope (serperToolBudget.ts turnCreditsRemaining walks to the root), so nested scopes are not told apart.
 * The stub never reaches the network: every other URL throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { withSerperTurnBudget, turnCreditsRemaining, turnCreditsSpent } from '@/lib/ai/tools/serperToolBudget'

const h = vi.hoisted(() => {
  const state = {
    probes: [] as Array<{ endpoint: string; scopeLimit: number | null; phase: string }>,
    // handler = inside `await POST(req)`; after_handler = POST resolved, the test is still inside the scope; body_read = the test is reading
    // the body OUTSIDE any scope. The label body_read is the test's own position when the probe ran; it does not say when the request was sent.
    phase: 'handler',
  }
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-scope-characterization' }, supabase: h.client }) }))
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
const probeOfThisRequest = (): number | null => {
  // The real ALS state at the call to fetch: remaining + spent is the scope limit; Infinity means no scope at all.
  const remaining = turnCreditsRemaining()
  if (!Number.isFinite(remaining)) return null
  return remaining + turnCreditsSpent()
}

beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'
  delete process.env.TAPPY_AGENT
  vi.stubEnv('CONSULTATIVE_V1', '1')
  vi.stubEnv('CONSULT_V2', '1')
  h.state.probes = []; h.state.phase = 'handler'
  __clearToolCache(); __resetAiQuestionQuotaLocal()
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      h.state.probes.push({ endpoint: new URL(u).pathname, scopeLimit: probeOfThisRequest(), phase: h.state.phase })
      return new Response(JSON.stringify({ organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }], shopping: [{ title: 'Item', link: 'https://example.com/i', price: '1.000.000đ', source: 'Shop' }], credits: 1 }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) return new Response('<html></html>', { status: 200 })
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
  if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey
})

type Msg = { role: 'user' | 'assistant'; content: string }
/**
 * One turn. The POST handler runs inside a scope with `limit` (a per-turn marker); the body is read inside or after that scope.
 * Returns the requests with the scope limit each one saw (null = no scope), and the limit of the scope the handler ran in.
 */
async function turn(messages: Msg[], limit: number, readInside: boolean) {
  h.state.probes = []; h.state.phase = 'handler'
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }), signal: undefined,
  }
  const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  let body: Response | null = null
  let text = ''
  try {
    await withSerperTurnBudget(limit, async () => {
      body = await POST(req as never)
      h.state.phase = 'after_handler'
      if (readInside) text = await (body as Response).text()
    })
    if (!readInside) {
      // The test reads the body OUTSIDE the scope (a test position; whether the production platform does the same is not verified).
      h.state.phase = 'body_read'
      text = await (body as Response | null)!.text()
    }
  } finally { logs.mockRestore() }
  return { probes: [...h.state.probes], bodyLength: text.length }
}

const SPEC = [{ role: 'user' as const, content: 'mua tai nghe bluetooth chụp tai dưới 1 triệu để nghe nhạc ở nhà' }]
const CLARIFY_GOLD: Msg[] = [
  { role: 'user', content: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu' },
  { role: 'assistant', content: 'Để chọn đúng tai nghe cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"line","q":"Loại nào?","options":["Nhét tai","Chụp tai"]}]}[/TAPPY_ASK]' },
  { role: 'user', content: 'giá vàng SJC mua vào, bán ra hôm nay bao nhiêu?' },
]

describe('characterization: the scope around POST reaches the request sites (observed, mock; not a budget proof)', () => {
  // CURRENT behaviour (observed, this mock runtime): the requests this turn sends see the scope the turn ran in (body read inside).
  // Measured: the scope limit at fetch. NOT measured: the exact moment relative to the handler's return.
  it('(a) requests of the turn, body read inside the scope: each sees the scope limit (observed)', async () => {
    const r = await turn(SPEC, 1111, true)
    for (const p of r.probes) expect(p.scopeLimit, p.endpoint).toBe(1111)
    expect(r.probes.length).toBeGreaterThan(0)
  })
  // CURRENT behaviour (observed, this mock runtime): with the body read OUTSIDE the scope, the requests seen at fetch still show the scope limit.
  // The mechanism is NOT measured here. Next.js production runtime NOT verified.
  it('(b) body read after the scope exited: requests seen at fetch still show the scope limit (observed, mock runtime)', async () => {
    const r = await turn(SPEC, 2222, false)
    process.stdout.write('PROBE_B ' + JSON.stringify(r.probes) + '\n')
    expect(r.probes.length).toBeGreaterThan(0)
    for (const p of r.probes) expect(p.scopeLimit, p.endpoint).toBe(2222)
    expect(r.probes.some(p => p.phase === 'body_read')).toBe(true)
  })
  // The clarify-answer turn is the path of the KNOWN DEFECT pinned in routeToolOffer.route.test.ts (current behaviour, not desired).
  // This test only records the scope limit of the requests that turn sends; it does not re-assert the defect.
  it('(g) clarify-answer turn: requests seen at fetch show the scope limit of their turn (observed)', async () => {
    const r = await turn(CLARIFY_GOLD, 3333, true)
    process.stdout.write('PROBE_G ' + JSON.stringify(r.probes) + '\n')
    expect(r.probes.length).toBeGreaterThan(0)
    for (const p of r.probes) expect(p.scopeLimit, p.endpoint).toBe(3333)
  })
})
