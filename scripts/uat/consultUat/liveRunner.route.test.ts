// @vitest-environment node
// Round 2c · the REAL chat route (POST /api/chat) driven by the benchmark runner, with a FAKE NETWORK. MOCK-ONLY.
//
// Real: the route's POST, the AI SDK, the OpenAI adapter (createOpenAIProvider / lunaModel / withCost), meteredModel, the spend gate, serperPost, the
// tool modules, the runner (runBench → runUat → routeTransport), the quota code. Simulated (as scripts/consult/replay does): Supabase (server + admin),
// the signed-in user, age eligibility and the rate limiter - the route is NOT run unauthenticated. Fake: `fetch` is stubbed in FULL - only
// api.openai.com/v1/chat/completions and google.serper.dev are answered (with the wire formats the SDK / Serper really send), any other host throws AND fails
// the test. The API keys are fake values set with vi.stubEnv and restored after every test. The file system is in memory (BenchFs). NOT the benchmark: two
// synthetic turns, nothing from questions.ts. What it cannot say: anything about the real Windows file system, the real providers or real cost.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { SERPER_CEILING_KEY, serperPost } from '@/lib/ai/tools/serperClient'
import { incrDailyCounter } from '@/lib/security/kvCounter'
import { __resetBenchProcessGuardForTests, routeTransport, runBench, BENCH_FLAG_NAMES, type BenchOptions, type BenchResult, type ChatTransport } from './liveRunner'
import { declare, finalFile, hasKey, jsonlLines, jsonlStarts, memFs } from './liveRunner.testkit'
import type { UatTurn } from './questions'

const h = vi.hoisted(() => {
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => b, delete: () => b, then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  const evidence = new Map<string, unknown>()
  const rpc = (fn: string, args: { p_id?: string; p_evidence?: unknown }) => {
    if (fn === 'decision_evidence_save' && args?.p_id) { evidence.set(args.p_id, JSON.parse(JSON.stringify(args.p_evidence ?? null))); return Promise.resolve({ data: null, error: null }) }
    if (fn === 'decision_evidence_load' && args?.p_id) return Promise.resolve({ data: evidence.get(args.p_id) ?? null, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  return { client: { from: () => builder(), rpc } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000b0001' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

// ── the fake network ─────────────────────────────────────────────────────────────────────────────────────────────────────────
interface OpenAiReq {
  stream: boolean; tools: string[]; hasToolResult: boolean; responseFormat: string | null; lastUser: string
  /** The body's `stream_options` exactly as sent (null when absent). */
  streamOptions: Record<string, unknown> | null
  /** True only when the request asked for usage in the stream (`stream_options.include_usage === true`), as the real API requires. */
  includeUsage: boolean
}
/** The request being answered. A stream carries a usage block ONLY if this request asked for it - the real API sends none otherwise. */
let currentReq: OpenAiReq | null = null
const streamUsage = (u: Usage | null): Usage | null => {
  // fail CLOSED: a stream built when no request is being answered (stale or missing state) is a bug in the test, not a stream with usage
  if (!currentReq) throw new Error('fake OpenAI: a stream was built outside a request')
  return currentReq.stream && !currentReq.includeUsage ? null : u
}
const net = { openai: [] as OpenAiReq[], serper: [] as Array<{ path: string; body: Record<string, unknown> }>, other: [] as string[] }
type OpenAiPlan = (req: OpenAiReq, n: number) => Response | Promise<Response>
let openaiPlan: OpenAiPlan = () => { throw new Error('no OpenAI plan set') }
let serperPlan: (path: string, body: Record<string, unknown>, n: number) => Response = () => { throw new Error('no Serper plan set') }

const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
// gpt-6-luna list price as the adapter books it: uncached input at the cache-write rate 0.125/M, output 0.50/M (providers/openai.ts PRICES)
const usdOf = (u: Usage) => (u.prompt_tokens * 0.125 + u.completion_tokens * 0.5) / 1e6
const INTENT_USAGE = usage(1000, 200), TOOL_USAGE = usage(500, 50), FINAL_USAGE = usage(2000, 400)
const textStream = (text: string, u: Usage | null) => sse([
  { choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ...(streamUsage(u) ? [{ choices: [], usage: streamUsage(u) }] : []),
])
const toolStream = (name: string, args: object, u: Usage | null) => sse([
  { choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: '' } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  ...(streamUsage(u) ? [{ choices: [], usage: streamUsage(u) }] : []),
])
const jsonCompletion = (content: string, u: Usage | null) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], ...(u ? { usage: u } : {}) }), { status: 200, headers: { 'content-type': 'application/json' } })
const apiError = (status: number) => new Response(JSON.stringify({ error: { message: `fake ${status}`, type: 'fake_error', code: String(status) } }), { status, headers: { 'content-type': 'application/json' } })
/** `credits: null` = the 200 answer does NOT state what it charged (a default parameter would swallow `undefined`, so null is the "absent" value). */
const serperOk = (credits: number | null = 1) => new Response(JSON.stringify({ organic: [{ title: 'Nguồn kiểm thử', link: 'https://example.com/a', snippet: 'đoạn trích kiểm thử' }], ...(credits === null ? {} : { credits }) }), { status: 200 })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })

/** The normal three-call turn: the intent read (generate), a stream that asks for web_search, a stream that answers with the tool result. */
function webSearchPlan(over: { intent?: (n: number) => Response; tool?: (n: number) => Response; final?: (n: number) => Response } = {}): OpenAiPlan {
  return (req, n) => {
    if (req.responseFormat) return over.intent ? over.intent(n) : jsonCompletion(INTENT, INTENT_USAGE)
    if (req.tools.includes('web_search') && !req.hasToolResult) return over.tool ? over.tool(n) : toolStream('web_search', { query: `tra cứu ${req.lastUser.slice(0, 24)}` }, TOOL_USAGE)
    return over.final ? over.final(n) : textStream('Theo nguồn kiểm thử, câu trả lời là 25.000đ.', FINAL_USAGE)
  }
}

const stubFetch = () => vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com' && u.pathname === '/v1/chat/completions') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const msgs: Array<{ role: string; content: unknown }> = body.messages ?? []
    const lastUser = [...msgs].reverse().find(m => m.role === 'user')
    const rec: OpenAiReq = {
      stream: !!body.stream, tools: (body.tools ?? []).map((t: any) => t.function?.name), hasToolResult: msgs.some(m => m.role === 'tool'),
      responseFormat: body.response_format?.type ?? null, lastUser: typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content ?? ''),
      streamOptions: body.stream_options && typeof body.stream_options === 'object' ? body.stream_options : null,
      includeUsage: body.stream_options?.include_usage === true,
    }
    net.openai.push(rec)
    currentReq = rec // the plan builds its streams while this request is the one being answered ...
    try { return await openaiPlan(rec, net.openai.length) } finally { currentReq = null } // ... and no longer afterwards (a stale request must not decide about usage)
  }
  if (u.hostname === 'google.serper.dev') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    net.serper.push({ path: u.pathname, body })
    return serperPlan(u.pathname, body, net.serper.length)
  }
  net.other.push(u.href)
  throw new Error(`UNEXPECTED host (a real request must never be made): ${u.hostname}`)
}))

// ── environment: fake keys and the benchmark flag set, injected with vi.stubEnv (restored after every test) ────────────────────
const BENCH_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.65',
  TURN_WEB_TICKET: '1', SEARCH_FALLBACK_GATE: '1',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const injectEnv = () => {
  // undefined = UNSET (an empty string would be a set, empty value: an empty model id has no price and every model call would be refused)
  for (const k of [...BENCH_FLAG_NAMES, 'OPENAI_API_KEY', 'SERPER_API_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries(BENCH_ENV)) vi.stubEnv(k, v)
}

const TURNS: readonly UatTurn[] = [
  { id: 'S1', conversation: 'S1', turn: 1, text: 'Tỷ giá USD hôm nay là bao nhiêu?' },
  { id: 'S2', conversation: 'S2', turn: 1, text: 'Giá vàng SJC hôm nay thế nào?' },
  { id: 'S3', conversation: 'S3', turn: 1, text: 'Giá xăng RON95 hôm nay là bao nhiêu?' },
]
const OUT_DIR = 'D:/TappyAI-review-artifacts/consultative-round2c-test'
let POST: (req: never) => Promise<Response>
function opts(over: Partial<BenchOptions> = {}): { o: BenchOptions; fs: ReturnType<typeof memFs> } {
  const fs = memFs()
  return {
    fs,
    o: {
      chat: routeTransport(POST as never), turnCapUsd: 0.05, runCapUsd: 0.65, confirmSpend: { capUsd: 0.65 },
      declaredFlags: declare(process.env), env: process.env, outDir: OUT_DIR, repoRoot: 'D:/TappyAI-wt/wt-integration',
      fs, turns: TURNS.slice(0, 2), now: () => 1_000, ...over,
    },
  }
}
/** Runs the benchmark with the route's own console noise silenced. */
async function run(o: BenchOptions): Promise<{ result: BenchResult | null; error: unknown }> {
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')].map(s => s.mockImplementation(() => undefined))
  try { return { result: await runBench(o), error: null } } catch (error) { return { result: null, error } } finally { spies.forEach(s => s.mockRestore()) }
}
const searchBodies = () => net.serper.filter(s => s.path === '/search').map(s => s.body)

beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
// node:http / node:https are tripwires: the app's page reader (safeGetText → https.request) would otherwise open a REAL connection to a place's own website.
// A call is recorded and FAILS the test; nothing is ever sent. (Found in round 2e: an earlier version of the place test gave the fake place a website.)
const savedHttp = { httpsRequest: https.request, httpsGet: https.get, httpRequest: http.request, httpGet: http.get }
const httpCalls: string[] = []
const restoreHttp = () => { https.request = savedHttp.httpsRequest; https.get = savedHttp.httpsGet; http.request = savedHttp.httpRequest; http.get = savedHttp.httpGet }
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal()
  net.openai.length = 0; net.serper.length = 0; net.other.length = 0; currentReq = null
  httpCalls.length = 0
  for (const [name, mod] of [['https', https], ['http', http]] as const) {
    for (const fn of ['request', 'get'] as const) (mod as unknown as Record<string, unknown>)[fn] = (...a: unknown[]) => { httpCalls.push(`${name}.${fn} ${typeof a[0] === 'string' ? a[0] : '(options)'}`); throw new Error(`TRIPWIRE: node:${name}.${fn} used by the route in a mock-only test`) }
  }
  injectEnv(); stubFetch()
  openaiPlan = webSearchPlan()
  serperPlan = () => serperOk(1)
})
afterEach(() => {
  const other = [...net.other]
  const http_ = [...httpCalls]
  restoreHttp()
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests()
  expect(other, 'no host other than OpenAI and Serper may be contacted').toEqual([])
  expect(http_, 'the route must not open a node:http(s) connection in a mock-only test').toEqual([])
})

describe('(a) the gate sees every call the real route makes', () => {
  it('[characterization] 2 turns: the LLM calls (generate AND stream) and the Serper requests the gate booked equal the number of times each stub was called', async () => {
    const { o, fs } = opts()
    const { result, error } = await run(o)
    expect(error).toBeNull()
    expect(result!.records.map(r => r.id)).toEqual(['S1', 'S2'])
    // the route really did the work: per turn one intent read (non-stream), one tool-choosing stream, one answering stream, one Serper search
    expect(net.openai.filter(r => !r.stream)).toHaveLength(2)
    expect(net.openai.filter(r => r.stream)).toHaveLength(4)
    expect(net.openai.filter(r => r.responseFormat === 'json_schema')).toHaveLength(2)
    expect(searchBodies(), JSON.stringify(net.serper)).toEqual([
      { q: 'tra cứu Tỷ giá USD hôm nay là ba', gl: 'vn', hl: 'vi', num: 8 },
      { q: 'tra cứu Giá vàng SJC hôm nay thế', gl: 'vn', hl: 'vi', num: 8 },
    ])
    // ... and the gate booked exactly that: no call escaped it, none was invented
    const llm = result!.records.reduce((n, r) => n + r.llmRequests, 0)
    const serper = result!.records.reduce((n, r) => n + r.serperRequests, 0)
    expect(llm).toBe(net.openai.length)
    expect(serper).toBe(net.serper.length)
    expect(result!.records.every(r => r.llmRequests === 3 && r.serperRequests === 1 && r.refusals === 0 && !r.degraded)).toBe(true)
    expect(result!.records.every(r => r.toolNames.includes('web_search'))).toBe(true)
    expect(result!.records.every(r => r.answer.includes('25.000đ'))).toBe(true)
    // (h) the files went to the in-memory file system, not to the real one
    expect(fs.files.size).toBeGreaterThan(0)
    expect(existsSync(OUT_DIR)).toBe(false)
  })
})

describe('(c-usage) the fake OpenAI behaves like the real one about stream usage, and the real adapter asks for it', () => {
  const callStub = async (body: Record<string, unknown>) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'gpt-6-luna', messages: [{ role: 'user', content: 'hi' }], ...body }) })
    return res.text()
  }
  it('[negative control] a stream request WITHOUT stream_options.include_usage gets NO usage block; with include_usage:true it does; a request with include_usage:false does not', async () => {
    openaiPlan = () => textStream('xin chào', FINAL_USAGE)
    expect(await callStub({ stream: true })).not.toContain('"usage"')
    expect(await callStub({ stream: true, stream_options: { include_usage: false } })).not.toContain('"usage"')
    expect(await callStub({ stream: true, stream_options: { include_usage: true } })).toContain('"usage"')
    // a non-stream completion always carries usage
    openaiPlan = () => jsonCompletion('xin chào', INTENT_USAGE)
    expect(await callStub({ stream: false })).toContain('"usage"')
  })

  it('[review A9] once a request is answered the fake no longer "knows" it: a stream built afterwards is refused, not given the previous request\'s usage', async () => {
    openaiPlan = () => textStream('xin chào', FINAL_USAGE)
    await callStub({ stream: true, stream_options: { include_usage: true } })
    expect(() => textStream('stale', FINAL_USAGE)).toThrow(/outside a request/)
  })

  it('[characterization] every STREAM request the real adapter sends carries stream_options.include_usage === true (compatibility "strict")', async () => {
    const { o } = opts()
    const { result } = await run(o)
    expect(result!.records).toHaveLength(2)
    const streams = net.openai.filter(r => r.stream)
    expect(streams).toHaveLength(4)
    for (const r of streams) expect(r.streamOptions).toEqual({ include_usage: true })
    // non-stream requests do not carry stream_options at all
    for (const r of net.openai.filter(x => !x.stream)) expect(r.streamOptions).toBeNull()
  })
})

describe('(b) the cost reaches the gate through the real adapter, for the stream as well as for generate', () => {
  it('[characterization] a turn costs exactly intent(generate) + tool step(stream) + answer(stream) + 1 Serper credit, each priced from its own usage block', async () => {
    const { o } = opts({ turns: TURNS.slice(0, 1) })
    const { result } = await run(o)
    const r = result!.records[0]
    // the guard books each call's cost rounded UP to whole micro-USD (BudgetGuard / toMicro 'up'), so the expected sum is of the rounded-up parts
    const up = (usd: number) => Math.ceil(Math.round(usd * 1e9) / 1e3) / 1e6
    const expected = up(usdOf(INTENT_USAGE)) + up(usdOf(TOOL_USAGE)) + up(usdOf(FINAL_USAGE)) + up(1 * 0.001)
    expect(r.cost.state).toBe('known')
    expect(r.cost.usd!).toBeCloseTo(expected, 9)
    // the two stream calls carry different usage blocks: a cost that ignored the stream's usage could not add up to this
    expect(r.cost.usd! - up(usdOf(INTENT_USAGE)) - up(0.001)).toBeCloseTo(up(usdOf(TOOL_USAGE)) + up(usdOf(FINAL_USAGE)), 9)
  })
})

describe('(c) two good turns: evidence on disk, and what the final file says', () => {
  it('[characterization] JSONL: started line then record for each turn, in order; the final file has the turns, cost accounted, no error', async () => {
    const { o, fs } = opts()
    const { result } = await run(o)
    const raw = [...fs.files.entries()].find(([p]) => /\.jsonl$/.test(p))![1].split('\n').filter(Boolean).map(l => JSON.parse(l))
    expect(raw.map(l => ('started' in l ? `started:${l.started}` : `record:${l.id}`))).toEqual(['started:S1', 'record:S1', 'started:S2', 'record:S2'])
    expect(jsonlStarts(fs).map(l => l.started)).toEqual(['S1', 'S2'])
    expect(jsonlLines(fs).every(l => l.cost.state === 'known' && l.degraded === false && !l.error && l.streamErrors.length === 0)).toBe(true)
    const f = finalFile(fs)!.json
    expect(f.turns).toHaveLength(2)
    expect(f.report.stopped).toBeNull()
    expect(f.report.cost.costAccounted).toBe(true)
    expect(f.report.cost.unknownTurns).toEqual([])
    // WHY valid is false here (and cannot be true in this test): `valid` needs report.cost.complete, which needs the FIXED 13-turn set. Two synthetic
    // turns can never be "complete". The valid=true branch (with totalUsd) is proven with the fake transport in liveRunner.guard.test.ts, not here.
    expect(f.report.cost.complete).toBe(false)
    expect(f.valid).toBe(false)
    expect(hasKey(f, 'totalUsd')).toBe(false)
    expect(result!.valid).toBe(false)
  })

  it('[characterization] a turn forced invalid (an empty answer): valid=false, the run stops sending, and totalUsd is absent at every level', async () => {
    openaiPlan = webSearchPlan({ final: () => textStream('', FINAL_USAGE) })
    const { o, fs } = opts()
    const { result } = await run(o)
    expect(result!.valid).toBe(false)
    expect(result!.records[0].error).toMatch(/empty answer/)
    expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
  })
})

describe('(d) the provider sends no usage', () => {
  it('[characterization] the answering stream has no usage block → settle(null) → the gate is blocked → the turn is unknown, the run stops, nothing more is sent, no totalUsd', async () => {
    openaiPlan = webSearchPlan({ final: () => textStream('Theo nguồn kiểm thử, câu trả lời là 25.000đ.', null) })
    const { o, fs } = opts()
    const { result } = await run(o)
    const r = result!.records[0]
    expect(r.cost).toEqual({ state: 'unknown', usd: null })
    expect(r.blocked).toBe('invalid-cost')
    expect(r.openReservedUsd).toBeGreaterThan(0) // the reservation of the call whose cost could not be read stays open
    expect(result!.report.stopped?.reason).toBe('invalid-cost')
    expect(result!.records).toHaveLength(1) // S2 never started
    expect(net.openai).toHaveLength(3) // only S1's three calls
    expect(result!.valid).toBe(false)
    const f = finalFile(fs)!.json
    expect(f.valid).toBe(false); expect(f.costState).toBe('unknown')
    expect(hasKey(f, 'totalUsd')).toBe(false)
  })
})

describe('(e) a VALID Serper request is sent, and the answer is a 200 without `credits`', () => {
  // Wave 4 fix (E18, Owner option A, 27/10). Before: the reservation became UNKNOWN, the gate blocked the answering call, the turn had no answer and the run stopped (the
  // measured W4-R3 stop). Now: the SENT request whose charge was not stated is settled at its RESERVED worst case (1 credit × $0.001 for /search), the turn answers and
  // the run goes on. A MODEL call whose cost is not known still blocks and stops the run: (d) and (f) are unchanged.
  it('[characterization] the request is sent once; it is settled at the reserved worst case ($0.001, no credit figure, marked worst_case); nothing is refused; the turn answers; the run goes on', async () => {
    serperPlan = () => serperOk(null)
    const { o, fs } = opts()
    const { result } = await run(o)
    const r = result!.records[0]
    expect(net.serper.filter(x => x.path === '/search').length).toBeGreaterThanOrEqual(1)
    expect(net.serper[0]).toMatchObject({ path: '/search', body: { gl: 'vn', hl: 'vi', num: 8 } })
    expect(r.blocked).toBeNull()
    expect(r.openReservedUsd).toBe(0)                                  // nothing is left open
    expect(r.refusals).toBe(0)
    expect(net.openai.filter(x => x.hasToolResult).length).toBeGreaterThan(0) // the answering call left the process
    expect(r.error ?? null).toBeNull()
    expect(r.answer.length).toBeGreaterThan(0)
    // the cost is KNOWN and counts the Serper request at its worst case: exactly what (b) books for a request whose provider stated 1 credit
    const up = (usd: number) => Math.ceil(Math.round(usd * 1e9) / 1e3) / 1e6
    expect(r.cost.state).toBe('known')
    expect(r.cost.usd!).toBeCloseTo(up(usdOf(INTENT_USAGE)) + up(usdOf(TOOL_USAGE)) + up(usdOf(FINAL_USAGE)) + up(1 * 0.001), 9)
    const s1 = jsonlLines(fs).find(l => l.id === 'S1')!
    expect(s1.serperCalls[0]).toMatchObject({ endpoint: 'search', credits: null, usd: 0.001, state: 'settled', assumed: 'worst_case' })
    expect(s1.requestTotals.serper.unknownCalls).toBe(0)
    expect(result!.report.stopped).toBeNull()
    expect(result!.report.turns.map(t => t.id)).toEqual(['S1', 'S2'])     // the run went on to the next turn
    expect(result!.report.turns.every(t => t.cost === 'known')).toBe(true)
  })
  it('control: a 200 that states its credits carries the provider figure and NO worst_case mark', async () => {
    const { o, fs } = opts()
    await run(o)
    const s1 = jsonlLines(fs).find(l => l.id === 'S1')!
    expect(s1.serperCalls[0]).toMatchObject({ credits: 1, usd: 0.001, state: 'settled' })
    expect(s1.serperCalls[0]).not.toHaveProperty('assumed')
  })
})

describe('(f) the provider answers 429 / 5xx', () => {
  /** Fails ONLY the first call that matches; every later call (a retry) would succeed - so a retry that was sent would show up in net.openai. */
  const failingOnce = (status: number, onCall: (req: OpenAiReq) => boolean): OpenAiPlan => {
    let failed = false
    return (req, n) => { if (!failed && onCall(req)) { failed = true; return apiError(status) } return webSearchPlan()(req, n) }
  }

  for (const status of [429, 500]) {
    it(`[characterization] ${status} on the tool-choosing stream (a retry WOULD succeed): the call is UNKNOWN (never released), the gate is blocked, neither the SDK nor the fallback's retry gets a request through, the run stops`, async () => {
      openaiPlan = failingOnce(status, req => req.stream && !req.hasToolResult)
      const { o, fs } = opts()
      const { result } = await run(o)
      const r = result!.records[0]
      // one request left the process; neither the SDK's own retry nor the fallback model's retry got a second one through the blocked gate
      expect(net.openai.filter(x => x.stream && !x.hasToolResult)).toHaveLength(1)
      expect(r.blocked).toBe('cost-unknown')
      expect(r.openReservedUsd).toBeGreaterThan(0)
      expect(r.cost).toEqual({ state: 'unknown', usd: null })
      expect(r.refusals).toBeGreaterThanOrEqual(1) // the retries were refused by the gate
      // the intent read, then the one failed stream - the retry (which the stub would have answered) never left the process
      expect(net.openai).toHaveLength(2)
      expect(r.llmRequests).toBe(2) // the failed call kept its reservation (unknown); the withFallback retry model's own reservation was refused: refusals = 1
      expect(r.refusals).toBe(1)
      expect(r.streamErrors).toEqual(['An error occurred.']) // the route's stream ended in an error frame
      expect(r.answer).toBe('')
      expect(result!.report.stopped).toMatchObject({ reason: 'invalid-cost', atTurn: 'S1' }) // the runner returned NaN (it did not throw): the run is stopped by runUat
      expect(result!.records).toHaveLength(1)
      expect(net.serper).toHaveLength(0)
      expect(result!.valid).toBe(false)
      expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
    })
  }
})

describe('(g) a request that cannot be bounded is refused before it leaves the process', () => {
  it('[characterization] an unbounded Serper parameter (page): no_bound, the stub is never called, the daily counter is restored, the turn counts a refusal (degraded)', async () => {
    const route = routeTransport(POST as never)
    let counterBefore = -1, counterAfter = -1
    let refusal: unknown = 'not refused'
    const chat: ChatTransport = async req => {
      counterBefore = (await incrDailyCounter(SERPER_CEILING_KEY, 0)).count
      refusal = await serperPost('search', 'serper-test-not-a-real-key', { q: 'unbounded', gl: 'vn', hl: 'vi', page: 2 }, 2000)
      counterAfter = (await incrDailyCounter(SERPER_CEILING_KEY, 0)).count
      return route(req)
    }
    const { o } = opts({ chat, turns: TURNS.slice(0, 1) })
    const { result } = await run(o)
    expect(refusal).toBeNull() // serperPost answers null: not sent
    expect(net.serper.some(s => (s.body as { page?: number }).page === 2)).toBe(false) // no request carrying `page` left the process
    expect(counterAfter).toBe(counterBefore) // the credits added before the reservation were given back
    expect(result!.records[0]).toMatchObject({ refusals: 1, degraded: true, photoSkips: 0 })
    expect(result!.valid).toBe(false)
  })

  it('[characterization] the place photo lookup (/images, credits unverified) in a real place turn: refused as a photoSkip, the stub is never called, the text answer is unchanged and the turn is not degraded', async () => {
    openaiPlan = (req) => {
      if (req.responseFormat) return jsonCompletion(INTENT, INTENT_USAGE)
      if (req.tools.includes('search_places') && !req.hasToolResult) return toolStream('search_places', { query: 'quán cà phê', location: 'Quận 1 Hồ Chí Minh', type: 'cafe' }, TOOL_USAGE)
      return textStream('Mình chọn **Cà phê Kiểm Thử** ở Quận 1 (nguồn: Google Maps).', FINAL_USAGE)
    }
    serperPlan = (path) => path === '/maps'
      ? new Response(JSON.stringify({ places: [{ title: 'Cà phê Kiểm Thử', address: '1 Lê Lợi, Quận 1, Hồ Chí Minh', latitude: 10.77, longitude: 106.70, rating: 4.5, ratingCount: 120, category: 'Quán cà phê', cid: '111', placeId: 'ChIJtest' }], credits: 3 }), { status: 200 }) // NO website: with one, the route's page reader opens a node:https connection (see the tripwire above)
      : serperOk(1)
    const { o } = opts({ turns: TURNS.slice(0, 1) })
    const { result } = await run(o)
    const r = result!.records[0]
    expect(net.serper.map(s => s.path)).not.toContain('/images') // nothing asked Serper for images
    expect(r.photoSkips).toBe(1) // ... because the gate refused it: recorded apart from degraded answers
    expect(r.refusals).toBe(0); expect(r.degraded).toBe(false)
    expect(r.answer).toContain('Cà phê Kiểm Thử')
    expect(r.toolNames).toContain('search_places')
    expect(r.cost.state).toBe('known')
    // the Serper requests that DID go out are all bounded shapes (maps q/gl/hl/ll, search q/gl/hl/num)
    expect(net.serper.every(s => Object.keys(s.body).every(k => ['q', 'gl', 'hl', 'll', 'num'].includes(k)))).toBe(true)
  })
})

describe('after a stop: what runUat does with the runner that refuses (halted)', () => {
  it('[characterization] a bad answer on turn 1 halts the runner; runUat does NOT stop - it asks for the next turns, each is refused with RequestNotSent before any request, recorded as an error with cost "none"', async () => {
    openaiPlan = webSearchPlan({ final: () => textStream('', FINAL_USAGE) }) // empty answer on every turn
    const { o, fs } = opts({ turns: TURNS })
    const { result } = await run(o)
    expect(net.openai).toHaveLength(3) // only S1 was ever sent
    expect(result!.report.stopped).toBeNull() // runUat itself did not stop ...
    expect(result!.report.turns.map(t => [t.id, t.cost])).toEqual([['S1', 'known'], ['S2', 'none'], ['S3', 'none']]) // ... it booked the refused turns as "not sent"
    expect(result!.report.turns[1].error).toMatch(/the run is stopped/)
    expect(result!.report.cost.unknownTurns).toEqual([]) // the books stay clean: nothing is unknown
    expect(result!.report.cost.costAccounted).toBe(true)
    expect(result!.valid).toBe(false)
    expect(jsonlLines(fs).map(l => l.id)).toEqual(['S1']) // only the turn that really ran has a record; the refused ones are in the report
    expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false)
  })
})
