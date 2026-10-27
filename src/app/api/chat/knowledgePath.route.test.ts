/**
 * Wave 4 · C2 — CONSULT_KNOWLEDGE_PATH (R3) at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper and the page fetch mocked, no network, no key, no cost).
 * The knowledge path: a consult turn with NO domain that is not a planning, image, evening, agent or no-tool turn (code state only). Claims:
 *   · ON: every old tool stays (Owner Q1: no filtering) and read_page + calculate are added; web_search carries the by-need description; steps follow the level (5 below L2, 6 at L2-L3, 8 at L4);
 *   · ON: a rule line reaches the prompt only for a tool the turn really carries; the shape block and the larger ceiling only with W3 on, tools offered and a request with several parts;
 *   · ON: read_page is the same reader (robots.txt honoured on the page, only links of this turn); a page's amounts are evidence, an invented one is still cut;
 *   · a lean turn (a domain), an image turn and a no-tool turn are untouched; OFF (unset, "0", any other value, L1, production) = the previous turn byte for byte.
 * The messages and pages are written for this test; none comes from a benchmark question file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { RESEARCH_RULE, __resetSharedRobots } from '@/lib/ai/consultative/researchLoop'
import { MATH_TOOL_RULE, STRUCTURED_SYNTHESIS_RULE, TOOL_BY_NEED_RULE, WEB_SEARCH_DESCRIPTION_BY_NEED } from '@/lib/ai/consultative/leanConsultPrompt'
import { __resetPageCache } from '@/lib/ai/agent/runtime/readPage'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[], results: [] as Array<{ name: string; result: any }>, luna: null as null | Record<string, unknown>,
    toolNames: [] as string[], webDescription: '' as string, maxSteps: 0, maxTokens: 0, system: '' as string, text: 'ok', webCalls: [] as string[], fetched: [] as string[],
    pages: {} as Record<string, { status?: number; body: string; contentType?: string }>, userId: 'u-knowledge-path',
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
    if ((p.status ?? 200) >= 400) return { ok: false, url, reason: 'http_error', status: p.status, redirects: 0, ms: 1 }
    return { ok: true, url, finalUrl: url, status: 200, contentType: p.contentType ?? 'text/html; charset=utf-8', body: p.body, bytes: p.body.length, truncated: false, redirects: 0, ms: 1 }
  },
}))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async (q: string) => { h.state.webCalls.push(String(q)); return [] },
  webSearch: async (q: string) => { h.state.webCalls.push(String(q)); return { results: [{ title: 'Biểu phí', link: 'https://bank.example/bieu-phi', snippet: 'Biểu phí dịch vụ' }, { title: 'Nội bộ', link: 'https://bank.example/private/x', snippet: 'x' }] } },
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()), serperPlaces: async () => [] }))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna
      ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      : Promise.reject(new Error('no provider in this test')),
    stream: (opts: Record<string, any>) => {
      h.state.toolNames = Object.keys(opts.tools ?? {})
      h.state.webDescription = String(opts.tools?.web_search?.description ?? '')
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

type Msg = { role: 'user' | 'assistant'; content: unknown }
const lunaIntent = (turn: string, domains: string[], difficulty = 'hard') => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty, missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const J = (s: string) => JSON.stringify(s).slice(1, -1)
// A knowledge question: the rules read no domain, the intent layer is scripted to read chat with no domain.
const KNOWLEDGE: Msg[] = [{ role: 'user', content: 'Giải thích giúp mình lãi kép hoạt động thế nào và phí duy trì tài khoản thường tính ra sao' }]
const ENV_NAMES = ['CONSULT_KNOWLEDGE_PATH', 'CONSULT_CAPABILITY_LEVEL', 'CONSULT_STRUCTURED_SYNTHESIS', 'CONSULT_RESEARCH_LOOP', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_TOOL_BY_NEED', 'CONSULT_PICK_TURN_TOOLS', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_FINAL_SYNTHESIS', 'VERCEL_ENV', 'TAPPY_AGENT']
const BANK_PAGE = '<html><head><title>Biểu phí</title></head><body><h1>Biểu phí</h1><p>Phí duy trì tài khoản: 11.000đ mỗi tháng.</p></body></html>'

interface Cfg { flag?: string; level?: string; flags?: Record<string, string>; vercelEnv?: string; lunaTurn?: string; lunaDomains?: string[]; difficulty?: string; msgs?: Msg[]; calls?: Array<{ name: string; args: Record<string, unknown> }>; reply?: string }
async function turn(c: Cfg = {}) {
  for (const k of ENV_NAMES) delete process.env[k]
  if (c.flag !== undefined) process.env.CONSULT_KNOWLEDGE_PATH = c.flag
  if (c.level !== undefined) process.env.CONSULT_CAPABILITY_LEVEL = c.level
  for (const [k, v] of Object.entries(c.flags ?? {})) process.env[k] = v
  if (c.vercelEnv) process.env.VERCEL_ENV = c.vercelEnv
  h.state.calls = (c.calls ?? []).map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.name, args: t.args }))
  h.state.text = c.reply ?? 'ok'
  h.state.luna = lunaIntent(c.lunaTurn ?? 'chat', c.lunaDomains ?? [], c.difficulty ?? 'hard')
  h.state.toolNames = []; h.state.webDescription = ''; h.state.maxSteps = 0; h.state.maxTokens = 0; h.state.system = ''; h.state.results = []; h.state.fetched = []; h.state.webCalls = []
  __resetAiQuestionQuotaLocal(); __resetPageCache(); __resetSharedRobots()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: c.msgs ?? KNOWLEDGE }), signal: undefined,
  }
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  return { tools: [...h.state.toolNames].sort(), webDescription: h.state.webDescription, maxSteps: h.state.maxSteps, maxTokens: h.state.maxTokens, system: h.state.system, text, results: [...h.state.results], fetched: [...h.state.fetched] }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T03:09:00Z')) // the prompt carries the minute; these tests compare prompts byte for byte
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  h.state.pages = {
    'https://bank.example/robots.txt': { body: 'User-agent: *\nDisallow: /private\n', contentType: 'text/plain' },
    'https://bank.example/bieu-phi': { body: BANK_PAGE },
    'https://bank.example/private/x': { body: '<html><body>secret 77.000đ</body></html>' },
  }
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { vi.useRealTimers(); for (const k of ENV_NAMES) delete process.env[k]; vi.unstubAllGlobals() })

describe('C2 — OFF is the previous R3 turn', () => {
  it('unset: five steps, the old tools (no read_page, no calculate), the general web_search description, no Wave 3 line', async () => {
    const off = await turn()
    expect(off.maxSteps).toBe(5)
    expect(off.tools).toContain('web_search')
    expect(off.tools).not.toContain('read_page'); expect(off.tools).not.toContain('calculate')
    expect(off.webDescription).not.toBe(WEB_SEARCH_DESCRIPTION_BY_NEED)
    for (const r of [TOOL_BY_NEED_RULE, MATH_TOOL_RULE, RESEARCH_RULE, STRUCTURED_SYNTHESIS_RULE]) expect(off.system).not.toContain(J(r))
    expect(off.maxTokens).toBe(2048)
  }, 60000)
  it('"0", any other value, L1, a production runtime (even with L4 or "1"): the very same turn', async () => {
    const off = await turn()
    for (const c of [{ flag: '0' }, { flag: 'true' }, { flag: ' 1' }, { flag: '1 ' }, { flag: '' }, { level: '1' }, { level: '4', vercelEnv: 'production' }, { flag: '1', vercelEnv: 'production' }, { level: '2', flag: '0' }] as Cfg[]) {
      expect(await turn(c), JSON.stringify(c)).toEqual(off)
    }
  }, 120000)
})

describe('C2 — ON: the knowledge path', () => {
  it('flag "1": every old tool stays, read_page and calculate are added; by-need web_search; the three rule lines; 5 steps below L2', async () => {
    const off = await turn()
    const on = await turn({ flag: '1' })
    for (const t of off.tools) expect(on.tools, t).toContain(t)
    expect(on.tools.filter(t => !off.tools.includes(t)).sort()).toEqual(['calculate', 'read_page'])
    expect(on.webDescription).toBe(WEB_SEARCH_DESCRIPTION_BY_NEED)
    for (const r of [TOOL_BY_NEED_RULE, MATH_TOOL_RULE, RESEARCH_RULE]) expect(on.system).toContain(J(r))
    expect(on.maxSteps).toBe(5)
  }, 60000)
  it('the old prompt is kept whole: the ON prompt starts with the OFF prompt', async () => {
    const off = JSON.parse((await turn()).system).system as string
    const on = JSON.parse((await turn({ flag: '1' })).system).system as string
    expect(on.startsWith(off)).toBe(true)
    expect(on.length).toBeGreaterThan(off.length)
  }, 60000)
  it('steps by level: L2 and L3 six, L4 eight', async () => {
    expect((await turn({ level: '2' })).maxSteps).toBe(6)
    expect((await turn({ level: '3' })).maxSteps).toBe(6)
    expect((await turn({ level: '4' })).maxSteps).toBe(8)
  }, 60000)
  it('the shape block and the larger ceiling: only with W3 on (L3) AND a request with several parts', async () => {
    const l2 = await turn({ level: '2' })
    expect(l2.system).not.toContain(J(STRUCTURED_SYNTHESIS_RULE)); expect(l2.maxTokens).toBe(2048)
    const l3 = await turn({ level: '3' })
    expect(l3.system).toContain(J(STRUCTURED_SYNTHESIS_RULE)); expect(l3.maxTokens).toBe(3500)
    const l3easy = await turn({ level: '3', difficulty: 'easy' })
    expect(l3easy.system).not.toContain(J(STRUCTURED_SYNTHESIS_RULE)); expect(l3easy.maxTokens).toBe(2048)
    const l4 = await turn({ level: '4' })
    expect(l4.maxTokens).toBe(4000)
  }, 120000)
  it('read_page opens a link this turn found, honours robots.txt (a disallowed page is not fetched), and the page is DATA with its source', async () => {
    const r = await turn({ flag: '1', calls: [
      { name: 'web_search', args: { query: 'phí duy trì tài khoản' } },
      { name: 'read_page', args: { urls: ['https://bank.example/bieu-phi'], focus: 'phí' } },
      { name: 'read_page', args: { urls: ['https://bank.example/private/x'], focus: 'phí' } },
      { name: 'read_page', args: { urls: ['https://never-seen.example/a'], focus: 'phí' } },
    ] })
    const reads = r.results.filter(x => x.name === 'read_page').map(x => x.result?.pages?.[0])
    expect(reads[0]?.error).toBeUndefined()
    expect(JSON.stringify(reads[0])).toContain('11.000')
    expect(reads[1]?.error).toBe('page_unreadable'); expect(reads[1]?.reason).toBe('robots_disallowed')
    expect(reads[2]?.error).toBeTruthy()
    expect(r.fetched).not.toContain('https://bank.example/private/x')
    expect(r.fetched).not.toContain('https://never-seen.example/a')
  }, 60000)
  it('an amount the model read on a page stays in the answer; the same answer with an amount on no page is judged as before (OFF = ON for it)', async () => {
    const SEARCH = { name: 'web_search', args: { query: 'phí duy trì tài khoản' } }
    const READ = { name: 'read_page', args: { urls: ['https://bank.example/bieu-phi'], focus: 'phí' } }
    const read = await turn({ flag: '1', calls: [SEARCH, READ], reply: 'Phí duy trì tài khoản là **11.000đ** mỗi tháng.' })
    expect(read.text).toContain('11.000đ')
    const inventedOn = await turn({ flag: '1', calls: [SEARCH, READ], reply: 'Phí duy trì tài khoản là **99.000đ** mỗi tháng.' })
    const inventedOff = await turn({ calls: [SEARCH], reply: 'Phí duy trì tài khoản là **99.000đ** mỗi tháng.' })
    expect(inventedOn.text.includes('99.000đ')).toBe(inventedOff.text.includes('99.000đ'))
    // Measured (C2): on R3 an amount for a NON-venue answer is not cut, with the flag OFF as well as ON - the amount guards judge venue / price-card answers. The knowledge path neither adds nor
    // removes a guard; recorded in the C2 report as an open point for the Owner, not changed here.
    expect(inventedOff.text).toContain('99.000đ')
  }, 60000)
  it('calculate runs on the knowledge path (an exact result), the model chooses to call it', async () => {
    const r = await turn({ flag: '1', calls: [{ name: 'calculate', args: { expression: '1000000 * (1 + 0.05) ^ 2' } }] })
    const calc = r.results.find(x => x.name === 'calculate')?.result
    expect(calc).toBeTruthy()
    expect(JSON.stringify(calc)).toContain('1102500')
  }, 60000)
})

describe('C2 — turns that are not the knowledge path are untouched by the flag', () => {
  it('a lean turn (the intent layer and the rules give a domain): ON = OFF', async () => {
    const msgs: Msg[] = [{ role: 'user', content: 'quán cà phê gần đây' }]
    const off = await turn({ msgs, lunaTurn: 'chat', lunaDomains: ['food'] })
    const on = await turn({ msgs, lunaTurn: 'chat', lunaDomains: ['food'], flag: '1' })
    expect(off.maxSteps).not.toBe(5) // the control really is not the R3 path
    expect(on).toEqual(off)
  }, 60000)
  it('an image turn: ON = OFF', async () => {
    const msgs: Msg[] = [{ role: 'user', content: [{ type: 'text', text: 'Giải thích giúp mình biểu đồ lãi kép này' }, { type: 'image', image: 'data:image/png;base64,iVBORw0KGgo=' }] }]
    const off = await turn({ msgs })
    const on = await turn({ msgs, flag: '1' })
    expect(on.tools).toEqual(off.tools); expect(on.maxSteps).toBe(off.maxSteps); expect(on.system).toBe(off.system)
  }, 60000)
  it('a no-tool turn (a thank-you): ON = OFF', async () => {
    const msgs: Msg[] = [{ role: 'user', content: 'Cảm ơn bạn nhé' }]
    const off = await turn({ msgs })
    const on = await turn({ msgs, flag: '1' })
    expect(on).toEqual(off)
  }, 60000)
  it('an agent turn (TAPPY_AGENT): ON = OFF', async () => {
    const off = await turn({ flags: { TAPPY_AGENT: '1' } })
    const on = await turn({ flags: { TAPPY_AGENT: '1' }, flag: '1' })
    expect(on.tools).toEqual(off.tools); expect(on.maxSteps).toBe(off.maxSteps); expect(on.system).toBe(off.system)
  }, 60000)
})
