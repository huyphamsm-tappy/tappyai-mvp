/**
 * Round 37, step 1 — the Tesla turn through the FULL route (POST /api/chat, TAPPY_AGENT=2) with CONSULTATIVE_IN_AGENT = 0 and = 1.
 * placeClaimPopularityScope.test.ts sets `collector.consultative` by hand and calls applyPlaceEnrichmentStreamFilter only; it proves nothing about the env
 * (route.ts:395 `consultativeAgent = agentV2 && consultativeInAgentEnabled()`, route.ts:2932 `enrichment.consultative = true`). This file asks the route itself:
 * does the place_claim guard run on the Tesla turn, and does it cut the biography, with each value of the env?
 * Scripted model (step 1 = a web_search call, then the logged text), faked web search. Each case prints one `CASE {…}` line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>, calls: 0, searches: [] as string[] }
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-agent-test' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined,
  webSearch: async (q: string) => {
    h.state.searches.push(q)
    return { results: [{ title: 'Nikola Tesla - Wikipedia', link: 'https://vi.wikipedia.org/wiki/Nikola_Tesla', snippet: 'Nikola Tesla là nhà phát minh, kỹ sư điện và cơ khí. Ông có nhiều đóng góp cho hệ thống điện xoay chiều hiện đại và động cơ cảm ứng xoay chiều.' }] }
  },
}))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: (opts: Record<string, any>) => {
      h.state.calls++
      const s = h.state.steps.shift() ?? { text: T2_TEXT, toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'
// R42 R3 (LOC-DEFAULT-HCM-01 regression run): no network, ever — a fetch the mocks above do not cover fails at once instead of going online.
beforeEach(() => { vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) }) })
afterEach(() => { vi.unstubAllGlobals() })

const T2_KEPT = 'À, Nikola Tesla chứ gì.'
const T2_CUT = 'Ông nổi tiếng nhất với những đóng góp cho hệ thống điện xoay chiều hiện đại; ông cũng phát triển động cơ cảm ứng xoay chiều [S1].'
const T2_TEXT = `${T2_KEPT} ${T2_CUT}` // read by the hoisted mock factory only at call time
const U = (content: string) => ({ role: 'user', content })
const A = (content: string) => ({ role: 'assistant', content })
const Q1 = 'Biết chứ. Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?'

async function turn(messages: unknown[]) {
  h.state.steps = [{ text: '', toolCalls: [{ toolCallId: 'c1', toolName: 'web_search', args: { query: 'Nikola Tesla nhà phát minh tiểu sử' } }] }, { text: T2_TEXT, toolCalls: [] }]
  h.state.calls = 0; h.state.searches = []
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }), signal: undefined,
  }
  const lines: string[] = []
  const logs = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  const body = await (await POST(req as never)).text()
  logs.mockRestore()
  const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  const js = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const guard = js.find(j => j.guard === 'place_claim') ?? null
  const path = js.find(j => j.type === 'tappyai_turn_path') ?? null
  return { text, guard, path, modelCalls: h.state.calls, searches: h.state.searches.length }
}
const brief = (r: Awaited<ReturnType<typeof turn>>) => ({ path: r.path?.path ?? null, consultative_in_agent: r.path?.consultative_in_agent ?? null, searches: r.searches, guard_ran: !!r.guard, in: r.guard?.chars_in ?? null, kept: r.guard?.chars_kept ?? null, reasons: r.guard ? Object.fromEntries(Object.entries(r.guard.reasons).filter(([, v]) => (v as number) > 0)) : null, final: r.text })
const record = (name: string, r: Awaited<ReturnType<typeof turn>>) => console.log('CASE ' + JSON.stringify({ name, ...brief(r) }))

beforeEach(() => { process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2' })
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k] })

const PLAIN = [U('biết tesla ko'), A(Q1), U('nhà phát minh á')]

// the live chat was a long FOOD conversation (turn_cost domain "food", prior_venues 2) into which the Tesla question was asked
const FOOD = [U('tìm quán phở ngon ở quận 1'), A('Mình chọn **Phở Lệ** (4.5⭐, 300 đánh giá), cách bạn 1,2 km, mở đến 22:00. **Phở Hòa** ở gần đó, 0,8 km.'), U('cảm ơn')]
const FOOD_TESLA = [...FOOD, U('biết tesla ko'), A(Q1), U('nhà phát minh á')]

describe('Tesla turn 2 inside a food conversation, env 0 / 1 (the live shape)', () => {
  for (const v of ['0', '1'] as const) {
    it(`env ${v}`, async () => {
      if (v === '1') process.env.CONSULTATIVE_IN_AGENT = '1'; else delete process.env.CONSULTATIVE_IN_AGENT
      const r = await turn(FOOD_TESLA)
      record(`route_food_context_env_${v}`, r)
      expect(r.path?.path).toBe('agent_v2')
      expect(r.path?.consultative_in_agent).toBe(v === '1')
      // the guard runs and cuts the biography with BOTH values of the env: the defect is not a flag effect
      expect(r.guard).not.toBeNull()
      expect(r.guard?.reasons.popularity).toBe(1)
      expect(r.text).toBe(T2_KEPT)
    }, 60000)
  }
})

describe('Tesla turn 2 through the full route, env CONSULTATIVE_IN_AGENT = 0 / 1', () => {
  for (const v of ['0', '1'] as const) {
    it(`env ${v}: what the route does with the logged text (plain 3-message chat)`, async () => {
      if (v === '1') process.env.CONSULTATIVE_IN_AGENT = '1'; else delete process.env.CONSULTATIVE_IN_AGENT
      const r = await turn(PLAIN)
      record(`route_plain_env_${v}`, r)
      expect(r.path?.path).toBe('agent_v2')
      expect(r.path?.consultative_in_agent).toBe(v === '1')
      expect(r.searches).toBe(1)
      // a chat with no place context: the place_claim guard does not run at all and the biography reaches the user with both values
      expect(r.guard).toBeNull()
      expect(r.text).toContain('đóng góp cho hệ thống điện xoay chiều')
    }, 60000)
  }
})
