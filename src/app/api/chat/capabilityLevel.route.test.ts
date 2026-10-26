/**
 * Wave 3 · W6 — CONSULT_CAPABILITY_LEVEL at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper and the page fetch mocked, no network, no key, no cost).
 * Claims: L0 / unset / an invalid value / a production runtime = the previous behaviour byte for byte; L1 = W2 (with the search-now gate) + W4; L2 = + W1 (read_page, six steps); L3 = + W3 (shape block, 3.500-token ceiling);
 * L4 = L3 with eight steps, six pages and the full 4.000-token ceiling (never above the hard 4.000); a Wave 3 flag that is set decides for itself; W2 stays inert without the gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { MATH_TOOL_RULE, STRUCTURED_SYNTHESIS_RULE, TOOL_BY_NEED_RULE } from '@/lib/ai/consultative/leanConsultPrompt'
import { RESEARCH_RULE, __resetSharedRobots } from '@/lib/ai/consultative/researchLoop'
import { __resetPageCache } from '@/lib/ai/agent/runtime/readPage'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[], results: [] as Array<{ name: string; result: any }>, luna: null as null | Record<string, unknown>,
    toolNames: [] as string[], maxSteps: 0, maxTokens: 0, system: '' as string, text: 'ok', fetched: [] as string[],
    pages: {} as Record<string, { status?: number; body: string; contentType?: string }>, userId: 'u-capability-level',
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: h.state.userId }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/security/safePageFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/safePageFetch')>()),
  fetchPublicPage: async (url: string) => {
    h.state.fetched.push(url)
    const p = h.state.pages[url]
    if (!p) return { ok: false, url, reason: 'http_error', status: 404, redirects: 0, ms: 1 }
    return { ok: true, url, finalUrl: url, status: 200, contentType: p.contentType ?? 'text/html; charset=utf-8', body: p.body, bytes: p.body.length, truncated: false, redirects: 0, ms: 1 }
  },
}))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async () => [], webSearch: async () => ({ results: [] }),
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()),
  serperPlaces: async (_q: string, ll?: { lat: number; lng: number } | null) => (ll ? [{ title: 'Cà phê Mây', address: 'Cà phê Mây', rating: 4.5, ratingCount: 300, placeId: 'p1', latitude: ll.lat + 0.001, longitude: ll.lng + 0.001 }] : []),
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna
      ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      : Promise.reject(new Error('no provider in this test')),
    stream: (opts: Record<string, any>) => {
      h.state.toolNames = Object.keys(opts.tools ?? {})
      h.state.maxSteps = Number(opts.maxSteps ?? 0)
      h.state.maxTokens = Number(opts.maxTokens ?? 0)
      try { h.state.system = JSON.stringify({ system: opts.system }) } catch { h.state.system = '' }
      return {
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            for (const call of h.state.calls) {
              if (!opts.tools?.[call.toolName]) continue
              c.enqueue(enc.encode(`9:${JSON.stringify(call)}\n`))
              const result = await opts.tools[call.toolName].execute(call.args, { toolCallId: call.toolCallId, messages: [] })
              h.state.results.push({ name: call.toolName, result })
              c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: call.toolCallId, result })}\n`))
            }
            if (h.state.text) c.enqueue(enc.encode(`0:${JSON.stringify(h.state.text)}\n`))
            try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop', text: h.state.text, steps: [] }) } catch { /* the mock must not fail a turn */ }
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

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[]) => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const MORE: Msg[] = [{ role: 'user', content: 'quán cà phê' }, { role: 'assistant', content: 'Mình chọn: Cà phê Mây.' }, { role: 'user', content: 'còn quán nào nữa' }]
const J = (s: string) => JSON.stringify(s).slice(1, -1)
const ENV_NAMES = ['CONSULT_CAPABILITY_LEVEL', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_TOOL_BY_NEED', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_RESEARCH_LOOP', 'CONSULT_STRUCTURED_SYNTHESIS', 'VERCEL_ENV', 'TAPPY_AGENT']
interface Cfg { level?: string; gate?: boolean; flags?: Record<string, string>; vercelEnv?: string; user?: string; area?: string[]; msgs?: Msg[]; calls?: Array<{ name: string; args: Record<string, unknown> }> }

async function turn(c: Cfg = {}) {
  for (const k of ENV_NAMES) delete process.env[k]
  if (c.level !== undefined) process.env.CONSULT_CAPABILITY_LEVEL = c.level
  if (c.gate) process.env.CONSULT_SEARCH_NOW_INTENT_GATE = '1'
  for (const [k, v] of Object.entries(c.flags ?? {})) process.env[k] = v
  if (c.vercelEnv) process.env.VERCEL_ENV = c.vercelEnv
  h.state.calls = (c.calls ?? []).map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.name, args: t.args }))
  h.state.luna = lunaIntent('more', c.area ?? ['food'])
  h.state.toolNames = []; h.state.maxSteps = 0; h.state.maxTokens = 0; h.state.system = ''; h.state.results = []; h.state.fetched = []
  __resetAiQuestionQuotaLocal(); __resetPageCache(); __resetSharedRobots()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: c.msgs ?? MORE, userLocation: GPS_HN }), signal: undefined,
  }
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try { await (await POST(req as never)).text() } finally { spy.mockRestore() }
  return { tools: [...h.state.toolNames].sort(), maxSteps: h.state.maxSteps, maxTokens: h.state.maxTokens, system: h.state.system, results: [...h.state.results], fetched: [...h.state.fetched] }
}

beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  h.state.pages = { 'https://caphemay.example/robots.txt': { body: '', contentType: 'text/plain' } }
  for (let k = 1; k <= 8; k++) h.state.pages[`https://caphemay.example/p${k}`] = { body: `<html><body><p>Trang ${k} giá ${k}0.000đ</p></body></html>` }
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ENV_NAMES) delete process.env[k]; vi.unstubAllGlobals() })

describe('W6 — the previous behaviour is kept at level 0, unset, invalid, and in production', () => {
  it('L0, unset, "5", "01", "L3", " 3" and a production L4 all equal the unset turn (tools, steps, ceiling, prompt)', async () => {
    const base = await turn({ gate: true })
    expect(base.tools).toEqual(['search_places'])
    expect(base.maxSteps).toBe(3)
    for (const c of [{ level: '0' }, { level: '5' }, { level: '01' }, { level: 'L3' }, { level: ' 3' }, { level: '3 ' }, { level: '4', vercelEnv: 'production' }] as Cfg[]) {
      const x = await turn({ ...c, gate: true })
      expect(x, JSON.stringify(c)).toEqual(base)
    }
  }, 120000)
})

describe('W6 — the levels', () => {
  const PREVIOUS = ['search_places']
  it('L1 (with the gate): web_search (W2) and calculate (W4); still 3 steps, the old ceiling, no read_page, no shape block', async () => {
    const r = await turn({ level: '1', gate: true })
    expect(r.tools).toEqual([...PREVIOUS, 'calculate', 'web_search'].sort())
    expect(r.maxSteps).toBe(3)
    expect(r.system).toContain(J(TOOL_BY_NEED_RULE))
    expect(r.system).toContain(J(MATH_TOOL_RULE))
    expect(r.system).not.toContain(J(RESEARCH_RULE))
    expect(r.system).not.toContain(J(STRUCTURED_SYNTHESIS_RULE))
    expect(r.maxTokens).toBe((await turn({ gate: true })).maxTokens)
  }, 60000)
  it('L1 WITHOUT the gate: W2 is inert (no web_search from it), W4 is on', async () => {
    const r = await turn({ level: '1' })
    expect(r.tools).toEqual([...PREVIOUS, 'calculate'].sort())
    expect(r.system).not.toContain(J(TOOL_BY_NEED_RULE))
    expect(r.system).toContain(J(MATH_TOOL_RULE))
  }, 60000)
  it('L2: + read_page, six steps, the research rule', async () => {
    const r = await turn({ level: '2', gate: true })
    expect(r.tools).toEqual([...PREVIOUS, 'calculate', 'read_page', 'web_search'].sort())
    expect(r.maxSteps).toBe(6)
    expect(r.system).toContain(J(RESEARCH_RULE))
    expect(r.system).not.toContain(J(STRUCTURED_SYNTHESIS_RULE))
  }, 60000)
  it('L3: + the shape block and the 3.500-token ceiling', async () => {
    const r = await turn({ level: '3', gate: true })
    expect(r.tools).toEqual([...PREVIOUS, 'calculate', 'read_page', 'web_search'].sort())
    expect(r.maxSteps).toBe(6)
    expect(r.system).toContain(J(STRUCTURED_SYNTHESIS_RULE))
    expect(r.maxTokens).toBe(3500)
  }, 60000)
  it('L4: eight steps and the full 4.000-token ceiling (never above the hard ceiling); the same tools as L3', async () => {
    const r3 = await turn({ level: '3', gate: true })
    const r = await turn({ level: '4', gate: true })
    expect(r.tools).toEqual(r3.tools)
    expect(r.maxSteps).toBe(8)
    expect(r.maxTokens).toBe(4000)
    expect(r.maxTokens).toBeLessThanOrEqual(4000)
  }, 60000)
  it('L4: six pages may be read in a turn, the seventh is refused; at L3 the fifth is', async () => {
    const urls = [1, 2, 3, 4, 5, 6, 7].map(k => `https://caphemay.example/p${k}`)
    const msgs: Msg[] = [{ role: 'user', content: `Đọc giúp ${urls.join(' ')}` }]
    const calls = urls.map(u => ({ name: 'read_page', args: { urls: [u], focus: 'giá' } }))
    const errs = (rs: Array<{ name: string; result: any }>) => rs.filter(x => x.name === 'read_page').map(x => x.result?.pages?.[0]?.error as string | undefined)
    const l4 = errs((await turn({ level: '4', gate: true, msgs, calls })).results)
    expect(l4.slice(0, 6)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    expect(l4[6]).toBe('page_budget_exhausted')
    const l3 = errs((await turn({ level: '3', gate: true, msgs, calls })).results)
    expect(l3.slice(0, 4)).toEqual([undefined, undefined, undefined, undefined])
    expect(l3[4]).toBe('page_budget_exhausted')
  }, 120000)
})

describe('W6 — a flag that is set decides for itself', () => {
  it('L4 with CONSULT_RESEARCH_LOOP=0: no read_page, three steps; the other levels\' capabilities stay', async () => {
    const r = await turn({ level: '4', gate: true, flags: { CONSULT_RESEARCH_LOOP: '0' } })
    expect(r.tools).not.toContain('read_page')
    expect(r.maxSteps).toBe(3)
    expect(r.tools).toContain('calculate')
    expect(r.system).toContain(J(STRUCTURED_SYNTHESIS_RULE))
  }, 60000)
  it('L4 with CONSULT_STRUCTURED_SYNTHESIS=true (not "1"): the block is off; L0 with CONSULT_RESEARCH_LOOP=1: read_page and six steps, nothing else', async () => {
    const a = await turn({ level: '4', gate: true, flags: { CONSULT_STRUCTURED_SYNTHESIS: 'true' } })
    expect(a.system).not.toContain(J(STRUCTURED_SYNTHESIS_RULE))
    const b = await turn({ level: '0', flags: { CONSULT_RESEARCH_LOOP: '1' } })
    expect(b.tools).toEqual([...PREVIOUS_TOOLS, 'read_page', 'web_search'].sort())
    expect(b.maxSteps).toBe(6)
    expect(b.system).not.toContain(J(MATH_TOOL_RULE))
  }, 60000)
})
const PREVIOUS_TOOLS = ['search_places']
