// @vitest-environment node
// Round 2e · DRY REHEARSAL of the live trial. It runs the SAME core (`runLiveTrial`) that liveTrial.test.ts runs, with the REAL chat route in this process
// and a FAKE network: `fetchImpl` answers only api.openai.com/v1/chat/completions and google.serper.dev; any other host that reaches it FAILS the test.
// Supabase / the signed-in user / the age check / the rate limiter are simulated exactly as in liveRunner.route.test.ts (the route is not run without a user).
// Keys are recognisable FAKE values set with vi.stubEnv. The order is the real one: the route is imported FIRST, the fetch wrapper is installed AFTER.
// BENCH_LIVE_TRIAL is never set here. The cost figures are the ledger's ESTIMATES, not invoices.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests, runBench } from './liveRunner'
import { formatSummary, isAllowedRequest, isBenchmarkEligible, normalizeQuestion, runLiveTrial, type LiveTrialInput, type TrialOutcome } from './liveTrial'
import { safeLookup } from '@/lib/security/safeFetch'
import { UAT_TURNS } from './questions'
import { finalFile, hasKey, jsonlLines, memFs, options as benchOptions, turnTransport } from './liveRunner.testkit'

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
  return { client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000d0001' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

// ── the fake network (what `fetchImpl` is) ───────────────────────────────────────────────────────────────────────────────────
interface OpenAiReq { stream: boolean; tools: string[]; hasToolResult: boolean; responseFormat: string | null; lastUser: string; includeUsage: boolean }
const net = { openai: [] as OpenAiReq[], serper: [] as Array<{ path: string; body: Record<string, unknown> }>, other: [] as string[], redirectModes: [] as unknown[], tripwire: 0 }
let openaiPlan: (req: OpenAiReq, n: number) => Response = () => { throw new Error('no OpenAI plan') }
let serperPlan: (path: string, body: Record<string, unknown>) => Response = () => { throw new Error('no Serper plan') }
let currentReq: OpenAiReq | null = null

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT_USAGE = usage(1000, 200), TOOL_USAGE = usage(500, 50), FINAL_USAGE = usage(2000, 400)
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
/** A stream carries usage ONLY when the request asked for it (stream_options.include_usage === true), as the real API does. */
const streamUsage = (u: Usage | null): Usage | null => { if (!currentReq) throw new Error('fake OpenAI: stream built outside a request'); return currentReq.stream && !currentReq.includeUsage ? null : u }
const textStream = (text: string, u: Usage | null) => sse([
  { choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
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
const serperOk = (credits: number | null = 1, organic = true) => new Response(JSON.stringify({ organic: organic ? [{ title: 'Nguồn kiểm thử', link: 'https://example.com/a', snippet: 'đoạn trích kiểm thử' }] : [], ...(credits === null ? {} : { credits }) }), { status: 200 })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })

function webPlan(over: { tool?: () => Response; final?: () => Response } = {}) {
  return (req: OpenAiReq): Response => {
    if (req.responseFormat) return jsonCompletion(INTENT, INTENT_USAGE)
    if (req.tools.includes('web_search') && !req.hasToolResult) return over.tool ? over.tool() : toolStream('web_search', { query: `tra cứu ${req.lastUser.slice(0, 24)}` }, TOOL_USAGE)
    return over.final ? over.final() : textStream('Theo nguồn kiểm thử, câu trả lời là 25.000đ.', FINAL_USAGE)
  }
}

/** The network the core forwards to. Anything that is not OpenAI chat completions or Serper FAILS the test (it must have been blocked before). */
const fetchImpl: typeof fetch = (async (input: unknown, init?: { body?: unknown; redirect?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  net.redirectModes.push(init?.redirect)
  if (u.hostname === 'api.openai.com' && u.pathname === '/v1/chat/completions') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const msgs: Array<{ role: string; content: unknown }> = body.messages ?? []
    const lastUser = [...msgs].reverse().find(m => m.role === 'user')
    const rec: OpenAiReq = {
      stream: !!body.stream, tools: (body.tools ?? []).map((t: any) => t.function?.name), hasToolResult: msgs.some(m => m.role === 'tool'),
      responseFormat: body.response_format?.type ?? null, lastUser: typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content ?? ''),
      includeUsage: body.stream_options?.include_usage === true,
    }
    net.openai.push(rec); currentReq = rec
    try { return openaiPlan(rec, net.openai.length) } finally { currentReq = null }
  }
  if (u.hostname === 'google.serper.dev') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    net.serper.push({ path: u.pathname, body })
    return serperPlan(u.pathname, body)
  }
  net.other.push(u.href)
  throw new Error(`UNEXPECTED host reached the network (it must be blocked by the wrapper): ${u.hostname}`)
}) as typeof fetch

// ── environment ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const KEY_OPENAI = 'sk-test-SECRET-123', KEY_SERPER = 'serper-SECRET-456'
const QUESTION = 'Giá xăng RON95 hôm nay là bao nhiêu?'
const OUT_DIR = 'D:/TappyAI-review-artifacts/consultative-round2e-rehearsal'
const BASE_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.05', BENCH_CONFIRM_SPEND: '0.05',
  // the Serper request cap must be armed for a paid run (liveTrial.ts requestCapReasons); values far above what these rehearsals send, so they never bind here
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '40', CONSULT_REQUEST_CAP_PER_RUN: '500',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/question.txt', BENCH_TRIAL_OUT_DIR: OUT_DIR,
  OPENAI_API_KEY: KEY_OPENAI, SERPER_API_KEY: KEY_SERPER,
  // The REAL trial file runs under the app project's vitest setup (src/test/consultativeFlag.setup.ts), which pins these two to '0' when they are not set.
  // The rehearsal must run in the same environment, or it rehearses a different route branch (the production default of both is ON).
  CONSULTATIVE_V1: '0', CONSULT_V2: '0',
  // Round 2f: the Owner's own statement of the two values (copied from Vercel production). Not behaviour flags; the trial is refused unless they match what the route will see.
  BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
}
/** The environment of the "consultative ON" variant: what an Owner who copies production (both ON, ticket and fallback gate ON) would set. */
const CONSULTATIVE_ON = { CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1', TURN_WEB_TICKET: '1', SEARCH_FALLBACK_GATE: '1' }
// (the proxy and TLS names are unset too: the host's own session may have them, and the preflight refuses them)
const PROXY_NAMES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NODE_USE_ENV_PROXY', 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']
const ALL_NAMES = [...BENCH_FLAG_NAMES, ...PROXY_NAMES,'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'BENCH_LIVE_TRIAL', 'CI', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
const stubEnv = (over: Record<string, string | undefined> = {}) => {
  for (const k of ALL_NAMES) vi.stubEnv(k, undefined) // undefined = UNSET
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...over })) vi.stubEnv(k, v)
}

let POST: (req: never) => Promise<Response>
let tripwireFetch: typeof fetch
let reads: string[]
let fs: ReturnType<typeof memFs>
let logged: string[]

// node:http / node:https are tripwires too: the app's page reader (safeGetText) uses https.request, not fetch. If the core does not wrap them, a place's own website
// would be requested for real. Here a call is recorded and FAILS the test; nothing is ever sent.
const savedHttp = { httpsRequest: https.request, httpsGet: https.get, httpRequest: http.request, httpGet: http.get }
const httpCalls: string[] = []
const installHttpTripwires = () => {
  for (const [name, mod] of [['https', https], ['http', http]] as const) {
    for (const fn of ['request', 'get'] as const) (mod as unknown as Record<string, unknown>)[fn] = (...a: unknown[]) => { httpCalls.push(`${name}.${fn} ${typeof a[0] === 'string' ? a[0] : JSON.stringify(a[0] instanceof URL ? a[0].href : (a[0] as { hostname?: string; host?: string })?.hostname ?? (a[0] as { host?: string })?.host ?? '?')}`); throw new Error(`TRIPWIRE: node:${name}.${fn} used outside the wrapper`) }
  }
}
const restoreHttp = () => { https.request = savedHttp.httpsRequest; https.get = savedHttp.httpsGet; http.request = savedHttp.httpRequest; http.get = savedHttp.httpGet }
const originalFetch = globalThis.fetch
beforeAll(async () => {
  // The tripwire for the GLOBAL fetch is in place BEFORE the route is imported, so a fetch captured at import time would hit it.
  tripwireFetch = (async () => { net.tripwire++; throw new Error('TRIPWIRE: the global fetch was used outside the wrapper') }) as typeof fetch
  globalThis.fetch = tripwireFetch
  ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) // the route FIRST ...
}, 120_000)
afterAll(() => { globalThis.fetch = originalFetch; restoreHttp() })
beforeEach(() => {
  httpCalls.length = 0; installHttpTripwires()
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal()
  net.openai.length = 0; net.serper.length = 0; net.other.length = 0; net.redirectModes.length = 0; net.tripwire = 0; currentReq = null
  reads = []; fs = memFs(); logged = []
  stubEnv()
  openaiPlan = webPlan()
  serperPlan = () => serperOk(1)
  // The GLOBAL fetch is a tripwire: during the run the core replaces it with its wrapper; if anything captured the original and uses it, this fires.
  vi.stubGlobal('fetch', tripwireFetch)
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'dir', 'table', 'group', 'groupCollapsed', 'trace'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(x => (typeof x === 'string' ? x : x instanceof Error ? `${x.name}: ${x.message}\n${x.stack}` : (() => { try { return JSON.stringify(x) } catch { return String(x) } })())).join(' ')) })
  }
})
afterEach(() => {
  const other = [...net.other]
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests()
  const http = [...httpCalls]
  restoreHttp()
  expect(other, 'no host other than OpenAI and Serper may reach the network').toEqual([])
  expect(net.tripwire, 'nothing may use the global fetch outside the wrapper').toBe(0)
  expect(http, 'nothing may use node:http / node:https outside the wrapper').toEqual([])
})

const input = (over: Partial<LiveTrialInput> = {}): LiveTrialInput => ({
  env: process.env, post: POST, fetchImpl, fs, readTextFile: p => { reads.push(p); return QUESTION }, repoRoot: process.cwd(), now: () => 1_000, ...over,
})
const ran = (o: TrialOutcome) => { if (o.kind !== 'ran') throw new Error(`expected a run, got: ${JSON.stringify(o)}`); return o }
const nothingHappened = () => { expect(net.openai).toHaveLength(0); expect(net.serper).toHaveLength(0); expect(fs.ops).toEqual([]); expect(globalThis.fetch).toBe(tripwireFetch) }

describe('(a) a good trial turn: the three counts agree (wrapper, fake network, spend ledger)', () => {
  it('turnOk and trialClean are true; runValid and benchmarkEligible are false for one turn; every request is counted three ways and the files go to the fake file system', async () => {
    const out = ran(await runLiveTrial(input()))
    const s = out.summary
    expect(s).toMatchObject({ turnOk: true, runValid: false, benchmarkEligible: false, trialClean: true, costState: 'known', hostsBlocked: [], redirects: [], warnings: [], problems: [] })
    expect(s.tools).toContain('web_search')
    // THREE-WAY tally: wrapper (by host) == fake network == spend ledger
    expect(s.hostRequests).toEqual({ 'api.openai.com': net.openai.length, 'google.serper.dev': net.serper.length })
    // (the run is in the environment the real file sees: CONSULTATIVE_V1 and CONSULT_V2 pinned to "0" by the vitest setup → no separate intent read: 2 model calls)
    expect(net.openai).toHaveLength(2); expect(net.serper).toHaveLength(1)
    expect(s.llmRequests).toBe(net.openai.length); expect(s.serperRequests).toBe(net.serper.length)
    // every request went through the wrapper: it forbids automatic redirects
    expect(net.redirectModes).toEqual(Array(3).fill('manual'))
    // round 3a, item 4: the per-request detail in the record is what the fake network really received (the REAL route and the REAL serperPost produced it)
    const rec = jsonlLines(fs)[0] as { serperCalls: Array<{ endpoint: string; num: number | null; q: string | null; credits: number | null; purpose: string | null }>; llmCalls: Array<{ role: string; tokensIn: number | null; tokensOut: number | null }> }
    expect(rec.serperCalls.map(c => [c.endpoint, c.num])).toEqual(net.serper.map(s => [s.path.replace(/^\//, ''), (s.body as { num?: number }).num ?? null]))
    expect(rec.serperCalls.map(c => c.q)).toEqual(net.serper.map(s => String((s.body as { q?: string }).q ?? '').slice(0, 200)))
    expect(rec.serperCalls.every(c => c.credits === 1 && c.purpose !== null)).toBe(true)
    expect(rec.llmCalls).toHaveLength(net.openai.length)
    expect(rec.llmCalls.some(c => (c.tokensIn ?? 0) > 0 && (c.tokensOut ?? 0) > 0)).toBe(true)
    expect(net.tripwire).toBe(0)
    expect(globalThis.fetch).toBe(tripwireFetch) // restored
    // files: in memory, one JSONL (started + record) and one result
    expect(jsonlLines(fs)).toHaveLength(1)
    expect(finalFile(fs)!.json.turns).toHaveLength(1)
    expect(existsSync(OUT_DIR)).toBe(false)
    expect(reads).toEqual(['D:/fake/question.txt'])
    expect(s.usd).toBeGreaterThan(0)
    expect(formatSummary(s)).toMatch(/ESTIMATE/i)
    expect(formatSummary(s)).not.toMatch(/NOT CLEAN/)
  })
})

describe('(b) PREFLIGHT refusals: no request, no file-system call, no question file read (and the global fetch is untouched)', () => {
  const cases: Array<[string, Record<string, string | undefined>]> = [
    ['CI has a value', { CI: 'true' }],
    ['turn cap above 0.10', { BENCH_SPEND_TURN_CAP_USD: '0.11', BENCH_SPEND_RUN_CAP_USD: '0.65', BENCH_CONFIRM_SPEND: '0.65' }],
    ['turn cap "0.10000001"', { BENCH_SPEND_TURN_CAP_USD: '0.10000001', BENCH_SPEND_RUN_CAP_USD: '0.65', BENCH_CONFIRM_SPEND: '0.65' }],
    ['run cap above 0.65', { BENCH_SPEND_RUN_CAP_USD: '0.7', BENCH_CONFIRM_SPEND: '0.7' }],
    ['run cap "0.650001"', { BENCH_SPEND_RUN_CAP_USD: '0.650001', BENCH_CONFIRM_SPEND: '0.650001' }],
    ['cap in exponent form', { BENCH_SPEND_TURN_CAP_USD: '5e-2' }],
    ['a flag set but empty', { TURN_WEB_TICKET: '' }],
    ['a flag set but blank', { LLM_LUNA_MODEL: '   ' }],
    ['a flag that must be OFF is ON', { RETRIEVAL_V5: '1' }],
    ['the audit dry-run switch is ON', { AUDIT_DRY_RUN: '1' }],
    ['a model id that is not an exact priced id', { LLM_CONSULT_MODEL: 'gpt-6-luna-pro' }],
    ['BENCH_CONFIRM_SPEND missing', { BENCH_CONFIRM_SPEND: undefined }],
    ['BENCH_CONFIRM_SPEND is not the run cap', { BENCH_CONFIRM_SPEND: '0.04' }],
    ['BENCH_CONFIRM_SPEND blank', { BENCH_CONFIRM_SPEND: ' ' }],
    ['the gate is OFF', { BENCH_SPEND_GATE: undefined }],
    ['the output folder is on drive C', { BENCH_TRIAL_OUT_DIR: 'C:/Users/Admin/out' }],
    ['the output folder is relative', { BENCH_TRIAL_OUT_DIR: 'out/trial' }],
    ['the output folder is missing', { BENCH_TRIAL_OUT_DIR: undefined }],
    ['the question file variable is missing', { BENCH_TRIAL_QUESTION_FILE: undefined }],
  ]
  for (const [label, over] of cases) {
    it(`${label}`, async () => {
      stubEnv(over)
      const out = await runLiveTrial(input())
      expect(out.kind).toBe('refused')
      expect((out as { reasons: string[] }).reasons.length).toBeGreaterThan(0)
      nothingHappened()
      expect(reads).toEqual([]) // the question file is not even opened
    })
  }
  it('the refusal names variables, never their values', async () => {
    stubEnv({ CI: 'true', TURN_WEB_TICKET: '', BENCH_SPEND_TURN_CAP_USD: '0.06' })
    const out = await runLiveTrial(input())
    const text = JSON.stringify(out)
    expect(text).toMatch(/TURN_WEB_TICKET/)
    expect(text).not.toContain(KEY_OPENAI); expect(text).not.toContain(KEY_SERPER)
  })
})

/** The combining marks block U+0300-U+036F, built from code points (no escape sequence is typed in this file). */
const MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

describe('(b2) QUESTION refusals: the file is read once, but nothing is requested and no BenchFs operation happens', () => {
  const cases: Array<[string, string]> = [
    ['empty', ''],
    ['only whitespace', ' \n\t '],
    ['one of the 12, verbatim', UAT_TURNS[2].text],
    ['one of the 12, other case and extra spaces', `  ${UAT_TURNS[0].text.toUpperCase().replace(/ /g, '   ')}  `],
    ['one of the 12, without Vietnamese marks', UAT_TURNS[7].text.normalize('NFD').replace(MARKS, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')],
    ['the follow-up turn Q11.2', UAT_TURNS[11].text],
    ['one of the 12 behind a byte-order mark', String.fromCharCode(0xfeff) + UAT_TURNS[4].text],
  ]
  for (const [label, text] of cases) {
    it(label, async () => {
      const out = await runLiveTrial(input({ readTextFile: p => { reads.push(p); return text } }))
      expect(out.kind).toBe('refused')
      nothingHappened()
      expect(reads).toEqual(['D:/fake/question.txt'])
    })
  }
  it('a question that is not one of the 12 passes, with or without a byte-order mark', async () => {
    const out = ran(await runLiveTrial(input({ readTextFile: p => { reads.push(p); return String.fromCharCode(0xfeff) + QUESTION + '\r\n' } })))
    expect(out.summary.turnOk).toBe(true)
  })
  it('normalizeQuestion: trim, collapse spaces, lower case, drop Vietnamese marks', () => {
    expect(normalizeQuestion('  Giá   XĂNG  RON95\n hôm nay ')).toBe('gia xang ron95 hom nay')
    expect(normalizeQuestion('Đường Đi')).toBe('duong di')
  })
})

describe('(c) a host outside the list is BLOCKED before it is sent, counted, and the trial is NOT CLEAN', () => {
  it('Serper answers with no result → the app falls back to DuckDuckGo → the wrapper blocks it: the fake network never sees it', async () => {
    serperPlan = () => serperOk(1, false)
    const out = ran(await runLiveTrial(input()))
    const s = out.summary
    expect(s.hostsBlocked).toContain('html.duckduckgo.com')
    expect(net.other).toEqual([]) // never reached the network
    expect(s.trialClean).toBe(false)
    expect(s.hostRequests['html.duckduckgo.com']).toBeUndefined() // blocked requests are not "sent"
    expect(formatSummary(s)).toMatch(/NOT CLEAN/)
    expect(formatSummary(s)).toMatch(/html\.duckduckgo\.com/)
    // the blocked request is also not a request the ledger paid for: the ledger counts still match the wrapper's sent counts
    expect(s.llmRequests).toBe(s.hostRequests['api.openai.com']); expect(s.serperRequests).toBe(s.hostRequests['google.serper.dev'])
  })
})

describe('(d) an HTTP redirect is never followed, and makes the trial NOT CLEAN', () => {
  it('Serper answers 302 to another host: the wrapper asked for redirect:"manual", nothing went to the other host, trialClean is false', async () => {
    serperPlan = () => new Response('', { status: 302, headers: { location: 'https://elsewhere.example/steal' } })
    const out = ran(await runLiveTrial(input()))
    expect(net.redirectModes.length).toBeGreaterThan(0)
    expect(net.redirectModes.every(m => m === 'manual')).toBe(true)
    expect(out.summary.redirects).toEqual([{ host: 'google.serper.dev', status: 302 }])
    expect(out.summary.trialClean).toBe(false)
    expect(net.other).toEqual([])
    expect(formatSummary(out.summary)).toMatch(/NOT CLEAN/)
  })
})

describe('(e) the keys never leak', () => {
  it('neither fake key appears in the summary, the formatted summary, the result files, the JSONL, a refusal, or anything the run printed', async () => {
    const out = ran(await runLiveTrial(input()))
    const everything = [JSON.stringify(out), formatSummary(out.summary), ...[...fs.files.values()], ...fs.ops, ...logged].join('\n')
    expect(everything).not.toContain('SECRET')
    expect(everything).not.toContain(KEY_OPENAI); expect(everything).not.toContain(KEY_SERPER)
    stubEnv({ CI: 'true' })
    const refused = await runLiveTrial(input())
    expect(JSON.stringify(refused) + logged.join('\n')).not.toContain('SECRET')
  })
  it('the keys are taken from the environment passed in, never from a file: the question reader is the only file read', async () => {
    await runLiveTrial(input())
    expect(reads).toEqual(['D:/fake/question.txt'])
  })
})

describe('(f) incidents: the turn is not OK, the run stops, there is no total, and the summary says why', () => {
  const noTotal = (out: ReturnType<typeof ran>) => { expect(hasKey(finalFile(fs)!.json, 'totalUsd')).toBe(false); expect(out.summary.runValid).toBe(false) }
  it('usage missing on the answering stream (the provider sends none)', async () => {
    openaiPlan = webPlan({ final: () => textStream('Theo nguồn kiểm thử, câu trả lời là 25.000đ.', null) })
    const out = ran(await runLiveTrial(input()))
    expect(out.summary).toMatchObject({ turnOk: false, trialClean: false, costState: 'unknown' })
    expect(out.summary.problems.join(' ')).toMatch(/cost/i)
    noTotal(out)
  })
  // Wave 4 fix (E18, Owner option A, 27/10): this was an incident (turn not OK, cost unknown, the run stopped). A SENT Serper request whose charge was not stated is now
  // settled at its reserved worst case, so the turn answers and its cost is known. The next test (a MODEL call failing) is still an incident: model costs are unchanged.
  it('Serper answers 200 without credits: no longer an incident - the request is counted at its reserved worst case and the turn answers', async () => {
    serperPlan = () => serperOk(null)
    const out = ran(await runLiveTrial(input()))
    expect(out.summary).toMatchObject({ turnOk: true, trialClean: true, costState: 'known' })
    expect(out.summary.problems).toEqual([])
  })
  it('the provider answers 429 on the tool-choosing stream', async () => {
    let failed = false
    openaiPlan = req => { if (!failed && req.stream && !req.hasToolResult) { failed = true; return apiError(429) } return webPlan()(req) }
    const out = ran(await runLiveTrial(input()))
    expect(out.summary).toMatchObject({ turnOk: false, trialClean: false })
    expect(out.summary.problems.length).toBeGreaterThan(0)
    expect(net.openai.filter(r => r.stream && !r.hasToolResult)).toHaveLength(1) // no retry got through the blocked gate
    noTotal(out)
  })
  it('a 5xx on the tool-choosing stream', async () => {
    let failed = false
    openaiPlan = req => { if (!failed && req.stream && !req.hasToolResult) { failed = true; return apiError(500) } return webPlan()(req) }
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(false)
    noTotal(out)
  })
})

describe('(g) isBenchmarkEligible: only the exact 13 turns, in order, with a valid run', () => {
  it('false for one turn, for 12, for the right turns in the wrong order, for an altered text; false when the run is not valid; true only for the exact set with a valid run', () => {
    const trial = [{ id: 'TRIAL', conversation: 'TRIAL', turn: 1, text: QUESTION }]
    expect(isBenchmarkEligible(trial, true)).toBe(false)
    expect(isBenchmarkEligible(trial, false)).toBe(false)
    expect(isBenchmarkEligible(UAT_TURNS.slice(0, 12), true)).toBe(false)
    expect(isBenchmarkEligible([...UAT_TURNS].reverse(), true)).toBe(false)
    expect(isBenchmarkEligible(UAT_TURNS.map((t, i) => (i === 3 ? { ...t, text: `${t.text} ` } : t)), true)).toBe(false)
    expect(isBenchmarkEligible(UAT_TURNS, false)).toBe(false)
    expect(isBenchmarkEligible(UAT_TURNS, true)).toBe(true)
  })
  it('with the 13 fixed turns through the runner (fake transport): a valid run is eligible; an invalid one is not', async () => {
    stubEnv({ BENCH_SPEND_RUN_CAP_USD: '0.65', BENCH_CONFIRM_SPEND: '0.65' })
    const good = benchOptions({ turns: UAT_TURNS, chat: turnTransport().chat }, process.env)
    const r1 = await runBench(good.opts)
    expect(r1.valid).toBe(true)
    expect(isBenchmarkEligible(UAT_TURNS, r1.valid)).toBe(true)
    __resetBenchProcessGuardForTests()
    let n = 0
    const base = turnTransport()
    const bad = benchOptions({ turns: UAT_TURNS, chat: async req => { n++; return n === 13 ? { raw: '', status: 500 } : base.chat(req) } }, process.env)
    const r2 = await runBench(bad.opts)
    expect(r2.valid).toBe(false)
    expect(isBenchmarkEligible(UAT_TURNS, r2.valid)).toBe(false)
  })
})

// ── round 2e review findings ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('(i) review B1: node:http and node:https are wrapped too (the page reader uses them, not fetch)', () => {
  it('a place whose own website is "https://evil.example/site" is BLOCKED before any connection: hostsBlocked names it, the trial is NOT CLEAN, the http tripwires never fire', async () => {
    openaiPlan = req => {
      if (req.responseFormat) return jsonCompletion(INTENT, INTENT_USAGE)
      if (req.tools.includes('search_places') && !req.hasToolResult) return toolStream('search_places', { query: 'quán cà phê', location: 'Quận 1 Hồ Chí Minh', type: 'cafe' }, TOOL_USAGE)
      return textStream('Mình chọn **Cà phê Kiểm Thử** ở Quận 1 (nguồn: Google Maps).', FINAL_USAGE)
    }
    serperPlan = path => path === '/maps'
      ? new Response(JSON.stringify({ places: [{ title: 'Cà phê Kiểm Thử', address: '1 Lê Lợi, Quận 1, Hồ Chí Minh', latitude: 10.77, longitude: 106.70, rating: 4.5, ratingCount: 120, category: 'Quán cà phê', cid: '111', placeId: 'ChIJtest', website: 'https://evil.example/site' }], credits: 3 }), { status: 200 })
      : serperOk(1)
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.hostsBlocked).toContain('evil.example')
    expect(out.summary.trialClean).toBe(false)
    expect(formatSummary(out.summary)).toMatch(/NOT CLEAN.*evil\.example/)
    expect(httpCalls).toEqual([]) // the original (tripwire) node:https was never reached
  })
  it('re-review: https.request("https://api.openai.com/v1/chat/completions", { hostname: "evil.example" }) - options that override the URL - is BLOCKED (Node would connect to evil.example)', async () => {
    const post = (async () => { https.request('https://api.openai.com/v1/chat/completions', { hostname: 'evil.example' }); return new Response('x') }) as unknown as typeof POST
    const out = await runLiveTrial(input({ post }))
    expect(out.kind).toBe('ran')
    if (out.kind === 'ran') { expect(out.summary.hostsBlocked.length).toBeGreaterThan(0); expect(out.summary.trialClean).toBe(false) }
    expect(httpCalls).toEqual([]) // the original (tripwire) was never reached
  })
  it('node:http(s) are put back after the run (also after a refusal)', async () => {
    const before = [https.request, https.get, http.request, http.get]
    await runLiveTrial(input())
    expect([https.request, https.get, http.request, http.get]).toEqual(before)
    stubEnv({ CI: 'true' })
    await runLiveTrial(input())
    expect([https.request, https.get, http.request, http.get]).toEqual(before)
  })
})

describe('(j) review M2: only https, no port, and only the paths the gate accounts for', () => {
  const cases: Array<[string, boolean]> = [
    ['https://api.openai.com/v1/chat/completions', true], ['https://google.serper.dev/search', true], ['https://google.serper.dev/maps', true], ['https://google.serper.dev/shopping', true],
    ['http://api.openai.com/v1/chat/completions', false], ['https://api.openai.com:8443/v1/chat/completions', false], ['https://api.openai.com/v1/images/generations', false],
    ['https://api.openai.com/v1/responses', false], ['https://google.serper.dev/images', false], ['https://google.serper.dev/', false],
    ['https://api.openai.com.evil.com/v1/chat/completions', false], ['https://api.openai.com@evil.com/v1/chat/completions', false],
    ['https://API.OPENAI.COM./v1/chat/completions', false], ['https://[::1]/v1/chat/completions', false], ['not a url', false], ['/v1/chat/completions', false], ['', false],
  ]
  for (const [url, ok] of cases) it(`${ok ? 'allowed' : 'blocked'}: ${JSON.stringify(url)}`, () => { expect(isAllowedRequest(url).ok).toBe(ok) })
  it('a blocked reason names the host (or "unparseable") and never a credential', () => {
    expect(isAllowedRequest('https://api.openai.com@evil.com/x')).toMatchObject({ ok: false, label: 'evil.com' })
    expect(isAllowedRequest('not a url')).toMatchObject({ ok: false, label: '(unparseable)' })
    expect(isAllowedRequest('https://api.openai.com/v1/images/generations')).toMatchObject({ ok: false, label: 'api.openai.com/v1/images/generations' })
  })
})

describe('(k) review M1: late work after the answer is still inside the wrapper', () => {
  it('a free request started 20 ms after the answer (background work) is blocked and counted', async () => {
    const out = ran(await runLiveTrial(input({ post: async req => { const res = await POST(req); setTimeout(() => { void fetch('https://late.example/x').catch(() => undefined) }, 20); return res } })))
    expect(out.summary.hostsBlocked).toContain('late.example')
    expect(out.summary.trialClean).toBe(false)
  })
})

describe('(l) review M4: an echoed key never reaches the summary or the files', () => {
  it('a provider error that quotes the key is redacted in the summary, the formatted summary, the JSONL and the result', async () => {
    openaiPlan = req => {
      if (!req.responseFormat && req.stream && !req.hasToolResult) return new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY_OPENAI}.`, type: 'invalid_request_error', code: 'invalid_api_key' } }), { status: 401, headers: { 'content-type': 'application/json' } })
      return webPlan()(req)
    }
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(false)
    const everything = [JSON.stringify(out), formatSummary(out.summary), ...[...fs.files.values()]].join('\n')
    expect(everything).not.toContain('SECRET')
  })
})

describe('(m) review M5/I1: the 12-question check ignores punctuation; the environment the real run sees is rehearsed', () => {
  it('a benchmark question without its punctuation is still one of the 12', async () => {
    const stripped = UAT_TURNS[4].text.replace(/[.,?!:;"()]/g, '').replace(new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']', 'g'), ' ')
    const out = await runLiveTrial(input({ readTextFile: p => { reads.push(p); return stripped } }))
    expect(out.kind).toBe('refused')
    nothingHappened()
  })
  it('the summary says which consultative flags were in effect (the vitest setup pins them to "0" when they are unset)', async () => {
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.flagsInEffect).toMatchObject({ CONSULTATIVE_V1: '0', CONSULT_V2: '0', TURN_WEB_TICKET: null, SEARCH_FALLBACK_GATE: null })
    expect(formatSummary(out.summary)).toMatch(/CONSULTATIVE_V1=0/)
  })
  it('the "consultative ON" variant (what copying production would set) also runs clean, and its counts agree three ways', async () => {
    stubEnv(CONSULTATIVE_ON)
    const out = ran(await runLiveTrial(input()))
    expect(out.summary).toMatchObject({ turnOk: true, trialClean: true })
    expect(out.summary.flagsInEffect).toMatchObject({ CONSULTATIVE_V1: '1', CONSULT_V2: '1', TURN_WEB_TICKET: '1', SEARCH_FALLBACK_GATE: '1' })
    expect(out.summary.hostRequests).toEqual({ 'api.openai.com': net.openai.length, 'google.serper.dev': net.serper.length })
    expect(out.summary.llmRequests).toBe(net.openai.length); expect(out.summary.serperRequests).toBe(net.serper.length)
  })
})

describe('(h) the real trial file is skipped by default and no CI or script sets its confirmation', () => {
  const root = join(__dirname, '..', '..', '..')
  it('liveTrial.test.ts is wrapped in describe.skipIf on the exact confirmation text', () => {
    const src = readFileSync(join(__dirname, 'liveTrial.test.ts'), 'utf8')
    expect(src).toMatch(/describe\.skipIf\(\s*process\.env\.BENCH_LIVE_TRIAL\s*!==\s*'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY'\s*\)/)
    expect(src).not.toMatch(/process\.env\.BENCH_LIVE_TRIAL\s*=/)
  })
  it('package.json, the vitest config and every CI file never set BENCH_LIVE_TRIAL', () => {
    const files = ['package.json', 'vitest.config.ts', 'vercel.json', '_deploy.sh', 'push-fix.bat', '_fix_and_push.bat']
    const ci = join(root, '.github')
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
    const all = [...files.map(f => join(root, f)).filter(existsSync), ...(existsSync(ci) ? walk(ci) : [])]
    expect(all.length).toBeGreaterThan(0)
    for (const p of all) expect(readFileSync(p, 'utf8'), p).not.toContain('BENCH_LIVE_TRIAL')
  })
  it('round 2g · the real file refuses unless the launcher started it (BENCH_TRIAL_ISOLATED), runs the core with afterTrial "deny", and prints the summary between the launcher\'s markers', () => {
    const src = readFileSync(join(__dirname, 'liveTrial.test.ts'), 'utf8')
    const guard = src.indexOf('if (!isolated) throw')
    const routeImport = src.indexOf("import('@/app/api/chat/route')")
    const call = src.indexOf('runLiveTrial({')
    expect(guard).toBeGreaterThan(0)
    expect(routeImport).toBeGreaterThan(guard) // the refusal comes BEFORE the route is imported ...
    expect(call).toBeGreaterThan(routeImport) // ... and so before the core is called
    expect(src).toMatch(/\[0-9a-f\]\{32\}/) // a hand-typed "1" is not a nonce
    expect(src).toMatch(/runLiveTrial\(\{[^}]*afterTrial: 'deny'/)
    expect(src).toMatch(/marker\(SUMMARY_BEGIN, nonce\)[\s\S]*marker\(SUMMARY_END, nonce\)/)
  })
  it('round 2g · the launcher sets the confirmation text itself, only for the child; the text is the one the real file waits for', () => {
    const launcher = readFileSync(join(__dirname, 'liveTrialLauncher.mjs'), 'utf8')
    expect(launcher).toContain("out.BENCH_LIVE_TRIAL = 'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY'")
    expect(readFileSync(join(__dirname, 'liveTrial.test.ts'), 'utf8')).toContain("'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY'")
  })
  it('the rehearsal itself never sets it', () => {
    expect(process.env.BENCH_LIVE_TRIAL).toBeUndefined()
  })
})

// ── round 2f ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A refusal that happened before ANYTHING: no request, no BenchFs operation, no question file read, the global fetch untouched. Returns the reasons as one text. */
const refusedBeforeAnything = async (over: Record<string, string | undefined>, inputOver: Partial<LiveTrialInput> = {}): Promise<string> => {
  stubEnv(over)
  const out = await runLiveTrial(input(inputOver))
  expect(out.kind).toBe('refused')
  nothingHappened()
  expect(reads).toEqual([])
  return (out as { reasons: string[] }).reasons.join(' | ')
}

describe('(n) round 2f · the two consultative flags are CONFIRMED by their own variables (the vitest setup overwrites the flags, so the flags alone prove nothing)', () => {
  it('the premise: the project setup file pins both flags to "0" when they are unset (so "unset" and "set to 0" look the same to the trial)', () => {
    const setup = readFileSync(join(__dirname, '..', '..', '..', 'src', 'test', 'consultativeFlag.setup.ts'), 'utf8')
    expect(setup).toMatch(/if \(process\.env\.CONSULTATIVE_V1 === undefined\) process\.env\.CONSULTATIVE_V1 = '0'/)
    expect(setup).toMatch(/if \(process\.env\.CONSULT_V2 === undefined\) process\.env\.CONSULT_V2 = '0'/)
  })
  it('(a) the confirmation of CONSULTATIVE_V1 is missing', async () => {
    const t = await refusedBeforeAnything({ BENCH_EXPECT_CONSULTATIVE_V1: undefined })
    expect(t).toMatch(/BENCH_EXPECT_CONSULTATIVE_V1/)
  })
  it('(b) the confirmation of CONSULT_V2 is missing', async () => {
    const t = await refusedBeforeAnything({ BENCH_EXPECT_CONSULT_V2: undefined })
    expect(t).toMatch(/BENCH_EXPECT_CONSULT_V2/)
  })
  for (const name of ['BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2']) {
    for (const bad of ['2', '', ' ', '01', ' 1', '1 ', 'true', 'on', 'yes']) {
      it(`(c) ${name} = ${JSON.stringify(bad)} is not exactly "0" or "1": refused by name, the value is not echoed`, async () => {
        const t = await refusedBeforeAnything({ [name]: bad })
        expect(t).toContain(name)
        if (bad.trim().length > 1) expect(t).not.toContain(bad.trim()) // (a one-character value such as "2" is also a digit in the variable names: only longer values can be told apart)
      })
    }
  }
  it('(d) MAIN CASE: the Owner forgot to set both flags, the setup pinned them to "0", and the Owner states "1" (production): refused, both flags named', async () => {
    const t = await refusedBeforeAnything({ CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1' })
    expect(t).toMatch(/BENCH_EXPECT_CONSULTATIVE_V1/); expect(t).toMatch(/BENCH_EXPECT_CONSULT_V2/)
  })
  it('(d2) the flags are really UNSET (the app default would be ON) and the Owner states "1": still refused (an unset flag is not a confirmed "1")', async () => {
    const t = await refusedBeforeAnything({ CONSULTATIVE_V1: undefined, CONSULT_V2: undefined, BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1' })
    expect(t).toMatch(/BENCH_EXPECT_CONSULTATIVE_V1/); expect(t).toMatch(/BENCH_EXPECT_CONSULT_V2/)
  })
  for (const [flag, expectVar] of [['CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULTATIVE_V1'], ['CONSULT_V2', 'BENCH_EXPECT_CONSULT_V2']] as const) {
    it(`(e) ${expectVar}="1" but ${flag}="0": refused`, async () => {
      const t = await refusedBeforeAnything({ [flag]: '0', [expectVar]: '1' })
      expect(t).toContain(expectVar)
    })
    it(`(e) ${expectVar}="0" but ${flag}="1": refused`, async () => {
      const t = await refusedBeforeAnything({ [flag]: '1', [expectVar]: '0' })
      expect(t).toContain(expectVar)
    })
  }
  it('(f) both match as "0"/"0": the preflight passes and the turn runs', async () => {
    stubEnv({ CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0' })
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(true)
  })
  it('(f) both match as "1"/"1": the preflight passes and the turn runs', async () => {
    stubEnv({ CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1' })
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(true)
    expect(out.summary.flagsInEffect).toMatchObject({ CONSULTATIVE_V1: '1', CONSULT_V2: '1' })
  })
  it('(f) one flag "0" and the other "1", each confirmed: passes (the two are independent)', async () => {
    stubEnv({ CONSULTATIVE_V1: '1', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '0' })
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(true)
  })
  it('(g) the environment passed to the core is not process.env (what the route reads): refused even though the passed object matches its own confirmation', async () => {
    stubEnv({ CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0' })
    const passed = { ...process.env, CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1' }
    const out = await runLiveTrial(input({ env: passed }))
    expect(out.kind).toBe('refused')
    expect((out as { reasons: string[] }).reasons.join(' | ')).toMatch(/process\.env.*CONSULTATIVE_V1/)
    nothingHappened(); expect(reads).toEqual([])
  })
  it('(h) a flag that changes AFTER the preflight (while the question file is read) is caught before the first request', async () => {
    stubEnv({})
    const out = await runLiveTrial(input({ readTextFile: p => { reads.push(p); vi.stubEnv('CONSULT_V2', '1'); return QUESTION } }))
    expect(net.openai).toHaveLength(0); expect(net.serper).toHaveLength(0)
    expect(out.kind).toBe('ran')
    if (out.kind === 'ran') { expect(out.summary.turnOk).toBe(false); expect(out.summary.problems.join(' ')).toMatch(/BENCH_EXPECT_CONSULT_V2/) }
    expect(globalThis.fetch).toBe(tripwireFetch)
  })
})

describe('(p) round 2f review · the allow-list judges the logical URL, so anything that can redirect the CONNECTION is refused before the run', () => {
  const proxyCases: Array<[string, Record<string, string | undefined>]> = [
    ['HTTPS_PROXY', { HTTPS_PROXY: 'http://proxy.example:8080' }], ['https_proxy', { https_proxy: 'http://proxy.example:8080' }],
    ['HTTP_PROXY', { HTTP_PROXY: 'http://proxy.example:8080' }], ['ALL_PROXY', { ALL_PROXY: 'socks5://proxy.example:1080' }],
    ['NODE_USE_ENV_PROXY', { NODE_USE_ENV_PROXY: '1' }], ['NODE_OPTIONS with --use-env-proxy', { NODE_OPTIONS: '--max-old-space-size=4096 --use-env-proxy' }],
    ['NODE_TLS_REJECT_UNAUTHORIZED=0', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }],
  ]
  for (const [label, over] of proxyCases) {
    it(`${label}: refused by name before anything (no request, no file-system call, no question file read), the value is not echoed`, async () => {
      const t = await refusedBeforeAnything(over)
      expect(t).toContain(Object.keys(over)[0].toUpperCase().startsWith('NODE_OPTIONS') ? 'NODE_OPTIONS' : Object.keys(over)[0])
      expect(t).not.toContain('proxy.example')
    })
  }
  it('an empty proxy variable and NODE_USE_ENV_PROXY=0 do not refuse (they do not route anything)', async () => {
    stubEnv({ HTTPS_PROXY: '', NODE_USE_ENV_PROXY: '0', NODE_TLS_REJECT_UNAUTHORIZED: '1' })
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(true)
  })
  const callFromPost = async (call: () => void) => {
    const post = (async () => { try { call() } catch { /* blocked */ } return new Response('0:"x"\nd:{"finishReason":"stop"}\n') }) as unknown as typeof POST
    const out = await runLiveTrial(input({ post }))
    expect(out.kind).toBe('ran')
    expect(httpCalls).toEqual([]) // the original (tripwire) was never reached
    return (out as { summary: { hostsBlocked: string[]; trialClean: boolean } }).summary
  }
  it('https.request(url, { hostname: undefined }): an explicit undefined override is still an override (Node falls back to localhost)', async () => {
    const s = await callFromPost(() => { https.request('https://api.openai.com/v1/chat/completions', { hostname: undefined }) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0); expect(s.trialClean).toBe(false)
  })
  it('options with socketPath (a local pipe) are refused even under an allowed host name', async () => {
    const s = await callFromPost(() => { https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', socketPath: 'x' }) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0)
  })
  it('options with createConnection are refused (they can send the connection elsewhere under an allowed name)', async () => {
    const s = await callFromPost(() => { https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', createConnection: () => { throw new Error('no') } } as never) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0)
  })
  it('options with an agent other than false are refused', async () => {
    const s = await callFromPost(() => { https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', agent: new https.Agent() }) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0)
  })
  it('agent: false and the APP\'S OWN safeLookup (what safeFetch/safePost pass) are NOT refused: the request is admitted and counted', async () => {
    const post = (async () => { try { https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', agent: false, lookup: safeLookup }).destroy() } catch { /* the tripwire stands in for the network */ } return new Response('0:"x"\nd:{"finishReason":"stop"}\n') }) as unknown as typeof POST
    const out = await runLiveTrial(input({ post }))
    expect(out.kind).toBe('ran')
    expect((out as { summary: { hostsBlocked: string[] } }).summary.hostsBlocked).toEqual([])
    expect(httpCalls).toHaveLength(1) // it was admitted and handed to the original (here the tripwire, which stands in for the network)
    httpCalls.length = 0
  })
  it('round 2g · D2: ANY OTHER lookup function is refused (it could map an allowed name to any address); only the app\'s safeLookup is let through', async () => {
    const s = await callFromPost(() => { https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', agent: false, lookup: (() => undefined) as never }) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0); expect(s.trialClean).toBe(false)
  })
  it('round 2g · D2: a lookup given in the (url, options) form is refused too', async () => {
    const s = await callFromPost(() => { https.request('https://api.openai.com/v1/chat/completions', { agent: false, lookup: (() => undefined) as never }) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0)
  })
  for (const [label, opts] of [
    ['rejectUnauthorized: false', { rejectUnauthorized: false }], ['a custom ca', { ca: 'x' }], ['a checkServerIdentity function', { checkServerIdentity: () => undefined }],
    ['_defaultAgent', { _defaultAgent: {} }],
  ] as Array<[string, Record<string, unknown>]>) {
    it(`review: https.request options with ${label} change what is trusted: refused`, async () => {
      const s = await callFromPost(() => { https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', agent: false, ...opts } as never) })
      expect(s.hostsBlocked.length).toBeGreaterThan(0)
    })
  }
  it('review: https.request with rejectUnauthorized: true / undefined is NOT refused', async () => {
    const post = (async () => { try { https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', agent: false, rejectUnauthorized: true }).destroy() } catch { /* tripwire */ } return new Response('0:"x"\nd:{"finishReason":"stop"}\n') }) as unknown as typeof POST
    const out = await runLiveTrial(input({ post }))
    expect((out as { summary: { hostsBlocked: string[] } }).summary.hostsBlocked).toEqual([])
    httpCalls.length = 0
  })
  it('review: fetch with a `dispatcher` in its init (undici\'s way of changing where the connection goes) is blocked', async () => {
    const s = await callFromPost(() => { void (fetch as unknown as (u: string, i: unknown) => Promise<unknown>)('https://api.openai.com/v1/chat/completions', { dispatcher: {} }).catch(() => undefined) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0)
    expect(net.openai).toHaveLength(0)
  })
  it('fetch with an object that merely carries a "url" property is blocked (what is sent could differ from what was checked)', async () => {
    const sneaky = { url: 'https://api.openai.com/v1/chat/completions', toString: () => 'https://evil.example/x' }
    const s = await callFromPost(() => { void (fetch as unknown as (x: unknown) => Promise<unknown>)(sneaky).catch(() => undefined) })
    expect(s.hostsBlocked.length).toBeGreaterThan(0)
    expect(net.other).toEqual([])
  })
})

describe('(q) round 2g · D1: after the trial the network stays CLOSED for the whole life of the process (afterTrial: "deny"), it is not given back to the real one', () => {
  const okPost = (async () => new Response('0:"x"\nd:{"finishReason":"stop"}\n')) as unknown as typeof POST
  it('default ("restore"): fetch and node:http(s) are the originals again after the run (the rehearsal needs this)', async () => {
    const before = [globalThis.fetch, https.request, https.get, http.request, http.get]
    await runLiveTrial(input({ post: okPost }))
    expect([globalThis.fetch, https.request, https.get, http.request, http.get]).toEqual(before)
  })
  it('"deny": after the answer and the drain EVERY later request - to any host, the allowed ones included - fails before it is sent and is counted; release() gives the originals back', async () => {
    const before = [globalThis.fetch, https.request, https.get, http.request, http.get]
    const out = ran(await runLiveTrial(input({ post: okPost, afterTrial: 'deny' })))
    try {
      const sentBefore = net.openai.length + net.serper.length
      await expect(fetch('https://evil.example/late')).rejects.toThrow(/closed/i)
      await expect(fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' })).rejects.toThrow(/closed/i) // even the allowed hosts: the trial is over
      await expect(fetch('https://google.serper.dev/search')).rejects.toThrow(/closed/i)
      expect(() => https.request('https://evil.example/late')).toThrow(/closed/i)
      expect(() => https.get({ hostname: 'api.openai.com', path: '/v1/chat/completions' })).toThrow(/closed/i)
      expect(() => http.request('http://evil.example/late')).toThrow(/closed/i)
      expect(net.openai.length + net.serper.length).toBe(sentBefore) // nothing reached the (fake) network
      expect(net.other).toEqual([])
      expect(out.controls.lateAttempts().length).toBe(6) // every one was recorded
      expect(out.controls.lateAttempts().join(' ')).toMatch(/evil\.example/)
      expect(httpCalls).toEqual([]) // the originals (tripwires) were never reached
    } finally { out.controls.release() }
    expect([globalThis.fetch, https.request, https.get, http.request, http.get]).toEqual(before) // released
  })
  const closed = async (controls: { lateAttempts: () => string[] }) => {
    await expect(fetch('https://evil.example/late')).rejects.toThrow(/closed/i)
    expect(() => https.request('https://evil.example/late')).toThrow(/closed/i)
    expect(controls.lateAttempts().length).toBeGreaterThanOrEqual(2)
  }
  it('review: in "deny" mode a PREFLIGHT refusal also leaves the network closed (the route is already imported; its background work must not run free until the process is ended)', async () => {
    stubEnv({ CI: 'true' })
    const before = [globalThis.fetch, https.request, https.get, http.request, http.get, console.log]
    const out = await runLiveTrial(input({ post: okPost, afterTrial: 'deny' }))
    expect(out.kind).toBe('refused')
    if (out.kind !== 'refused') return
    try { await closed(out.controls) } finally { out.controls.release() }
    expect([globalThis.fetch, https.request, https.get, http.request, http.get, console.log]).toEqual(before)
    expect(reads).toEqual([]); expect(net.openai).toHaveLength(0)
  })
  it('review: in "deny" mode a QUESTION refusal (the question is empty) also leaves the network closed', async () => {
    const out = await runLiveTrial(input({ post: okPost, afterTrial: 'deny', readTextFile: () => '   ' }))
    expect(out.kind).toBe('refused')
    if (out.kind !== 'refused') return
    try { await closed(out.controls) } finally { out.controls.release() }
  })
  it('review: in "deny" mode a refusal that comes from the runner (the output folder cannot be created) also leaves the network closed', async () => {
    fs.mkdirp = () => { throw new Error('EACCES') }
    const out = await runLiveTrial(input({ post: okPost, afterTrial: 'deny' }))
    expect(out.kind).toBe('refused')
    if (out.kind !== 'refused') return
    try { await closed(out.controls) } finally { out.controls.release() }
  })
  it('review: in "deny" mode a run that THROWS (the file system fails while the record is saved) leaves the network closed too', async () => {
    const real = fs.append
    fs.append = (p, t) => { if (!t.includes('"started"')) throw new Error('disk'); real(p, t) }
    const err = await runLiveTrial(input({ post: okPost, afterTrial: 'deny' })).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    try {
      await expect(fetch('https://evil.example/late')).rejects.toThrow(/closed/i)
      expect(() => https.get('https://api.openai.com/v1/chat/completions')).toThrow(/closed/i)
    } finally {
      // nothing returns controls on a throw: put the originals back by hand (the real process is ended by the launcher)
      globalThis.fetch = tripwireFetch; restoreHttp()
    }
  })
  it('review: in "deny" mode the ESM namespace bindings of node:https are denied too (module.syncBuiltinESMExports), and restored by release()', async () => {
    const ns = await import('node:https')
    const out = ran(await runLiveTrial(input({ post: okPost, afterTrial: 'deny' })))
    try { expect(() => ns.request('https://evil.example/late')).toThrow(/closed/i) } finally { out.controls.release() }
    expect(ns.request).toBe(https.request) // the namespace follows the release (what was installed before the run: the rehearsal's own tripwire)
  })
})

describe('(r) round 2g · D2: process.execArgv (the node command line), not only NODE_OPTIONS', () => {
  const bad: Array<[string, string[]]> = [
    ['--use-env-proxy', ['--use-env-proxy']],
    ['--use-env-proxy among other options', ['--conditions', 'node', '--use-env-proxy']],
    ['--require of another file', ['--require', 'D:/evil/patch.cjs']],
    ['-r of another file', ['-r', 'D:/evil/patch.cjs']],
    ['--require=… form', ['--require=D:/evil/patch.cjs']],
    ['--import', ['--import', 'file:///D:/evil/patch.mjs']],
    ['--loader', ['--loader=evil-loader']],
    ['--experimental-loader', ['--experimental-loader', 'evil-loader']],
    ['--require of a file that is only NAMED like vitest\'s preload, in another directory', ['--require=D:/evil/vitest/suppress-warnings.cjs']],
    ['--require (separate value) of a file named like vitest\'s preload in another directory', ['--require', 'D:/evil/vitest/suppress-warnings.cjs']],
    ['--import with a data: URL whose tail looks like the preload', ['--import=data:text/javascript,globalThis.x=1;//x/vitest/suppress-warnings.cjs']],
    ['--import of vitest\'s preload path (only --require is accepted)', ['--import', join(process.cwd(), 'node_modules', 'vitest', 'suppress-warnings.cjs')]],
    ['--inspect', ['--inspect=127.0.0.1:9229']],
    ['--inspect-brk', ['--inspect-brk']],
    ['--use-system-ca', ['--use-system-ca']],
    ['--use-openssl-ca', ['--use-openssl-ca']],
    ['--openssl-config', ['--openssl-config=D:/evil/openssl.cnf']],
    ['--env-file', ['--env-file=D:/evil/.env']],
    ['--eval', ['--eval', 'globalThis.x=1']],
    ['-e', ['-e', 'globalThis.x=1']],
    ['-p', ['-p', '1']],
  ]
  for (const [label, execArgv] of bad) {
    it(`${label}: refused by name before anything`, async () => {
      const t = await refusedBeforeAnything({}, { execArgv })
      expect(t).toMatch(/execArgv|node command line/i)
      expect(t).not.toContain('evil')
    })
  }
  it('vitest\'s own preload (the REAL file of this repository, compared by real path) and the usual options are accepted (this is what a vitest worker has)', async () => {
    const preload = join(process.cwd(), 'node_modules', 'vitest', 'suppress-warnings.cjs')
    for (const execArgv of [
      ['--experimental-import-meta-resolve', '--require', preload, '--conditions', 'node', '--conditions', 'development'],
      ['--require=' + preload],
      ['-r', preload],
    ]) {
      __resetBenchProcessGuardForTests()
      stubEnv({})
      const out = ran(await runLiveTrial(input({ execArgv })))
      expect(out.summary.turnOk).toBe(true)
    }
  })
  const nodeOptionsBad: Array<[string, string]> = [
    ['--require', '--require D:/evil/patch.cjs'], ['-r', '--max-old-space-size=4096 -r D:/evil/patch.cjs'], ['--import', '--import=file:///D:/evil/patch.mjs'],
    ['--loader', '--loader evil'], ['--experimental-loader', '--experimental-loader=evil'], ['--inspect', '--inspect-brk'], ['--use-system-ca', '--use-system-ca'],
    ['--use-openssl-ca', '--use-openssl-ca'], ['--openssl-config', '--openssl-config=x'], ['--env-file', '--env-file=x'],
  ]
  for (const [label, value] of nodeOptionsBad) {
    it(`NODE_OPTIONS with ${label}: refused by name (the core on its own, not only the launcher that drops NODE_OPTIONS)`, async () => {
      const t = await refusedBeforeAnything({ NODE_OPTIONS: value })
      expect(t).toContain('NODE_OPTIONS')
      expect(t).not.toContain('evil')
    })
  }
  it('NODE_OPTIONS with only a harmless option does not refuse', async () => {
    stubEnv({ NODE_OPTIONS: '--max-old-space-size=4096' })
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(true)
  })
  it('the default is the real process.execArgv of this vitest worker, and it passes', async () => {
    stubEnv({})
    const out = ran(await runLiveTrial(input()))
    expect(out.summary.turnOk).toBe(true)
  })
})

describe('(s) round 2g · D3: the console is filtered BEFORE it prints (not only the result files)', () => {
  const SECRETS = /secret/i
  it('console.log/info/warn/error/debug called during the run: strings, Errors and objects that carry a key reach the printer without it; harmless output is unchanged', async () => {
    const post = (async () => {
      console.error('boom sk-test-SECRET-123')
      console.warn(new Error('provider said serper-SECRET-456'))
      console.log({ nested: { k: 'serper-SECRET-456' } })
      console.debug('a', 'sk-test-SECRET-123', 7)
      console.info('plain output stays')
      return new Response('0:"x"\nd:{"finishReason":"stop"}\n')
    }) as unknown as typeof POST
    await runLiveTrial(input({ post }))
    const text = logged.join('\n')
    expect(text).not.toMatch(SECRETS)
    expect(text).toContain('plain output stays')
    expect(text).toContain('boom')
  })
  it('a provider error that quotes the key (HTTP 401): the route logs it, nothing with the key is printed, and the summary has none either', async () => {
    openaiPlan = () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-SECRET-123. serper-SECRET-456', type: 'invalid_request_error', code: 'invalid_api_key' } }), { status: 401, headers: { 'content-type': 'application/json' } })
    const out = ran(await runLiveTrial(input()))
    expect(logged.join('\n')).not.toMatch(SECRETS)
    expect(JSON.stringify(out) + formatSummary(out.summary)).not.toMatch(SECRETS)
    expect(out.summary.turnOk).toBe(false)
  })
  it('in the default mode the console is put back the way it was (the spies the rehearsal installed)', async () => {
    const before = [console.log, console.info, console.warn, console.error, console.debug]
    await runLiveTrial(input())
    expect([console.log, console.info, console.warn, console.error, console.debug]).toEqual(before)
  })
  it('"deny" mode keeps the console filter on for the rest of the process, release() puts it back', async () => {
    const before = [console.log, console.info, console.warn, console.error, console.debug]
    const out = ran(await runLiveTrial(input({ afterTrial: 'deny' })))
    try {
      console.error('late sk-test-SECRET-123')
      expect(logged.join('\n')).not.toMatch(SECRETS)
    } finally { out.controls.release() }
    expect([console.log, console.info, console.warn, console.error, console.debug]).toEqual(before)
  })
  it('review: an Error whose KEY sits in its cause, in an AggregateError member or in an own property is filtered, and console.dir / trace / table / group are filtered too', async () => {
    const post = (async () => {
      console.error(new Error('outer is clean', { cause: new Error('inner sk-test-SECRET-123') }))
      console.error(new AggregateError([new Error('member serper-SECRET-456')], 'many'))
      console.warn(Object.assign(new Error('clean message'), { responseBody: 'body with sk-test-SECRET-123' }))
      console.dir({ a: 'serper-SECRET-456' })
      console.table([{ k: 'sk-test-SECRET-123' }])
      console.group('group sk-test-SECRET-123'); console.groupEnd()
      console.trace('trace serper-SECRET-456')
      return new Response('0:"x"\nd:{"finishReason":"stop"}\n')
    }) as unknown as typeof POST
    await runLiveTrial(input({ post }))
    expect(logged.join('\n')).not.toMatch(SECRETS)
  })
  it('a cyclic object, a Symbol and undefined are passed through without throwing', async () => {
    const post = (async () => {
      const a: Record<string, unknown> = { n: 1 }; a.self = a
      console.log(a, Symbol("s"), undefined, null, BigInt(5))
      return new Response('0:"x"\nd:{"finishReason":"stop"}\n')
    }) as unknown as typeof POST
    const out = await runLiveTrial(input({ post }))
    expect(out.kind).toBe('ran')
  })
})

describe('(o) round 2f · every text that reaches a file or the summary passes through redactSecrets (writeError, ticketLog, blocked-host labels, refusal reasons)', () => {
  const SECRETS = /secret/i
  const allText = (out: unknown) => [JSON.stringify(out ?? null), ...(out && (out as TrialOutcome).kind === 'ran' ? [formatSummary((out as { summary: never }).summary)] : []), ...[...fs.files.values()], ...fs.ops].join('\n')
  it('a blocked host label that carries a key (in the path, and in the host name in another case) is redacted in the summary, the formatted summary and the files', async () => {
    const post = (async () => {
      for (const u of ['https://google.serper.dev/sk-test-SECRET-123', 'https://serper-SECRET-456.evil.example/x', 'https://api.openai.com/v1/chat/completions/serper-SECRET-456']) { try { await fetch(u) } catch { /* blocked */ } }
      return new Response('0:"x"\nd:{"finishReason":"stop"}\n')
    }) as unknown as typeof POST
    const out = await runLiveTrial(input({ post }))
    expect(out.kind).toBe('ran')
    expect((out as { summary: { hostsBlocked: string[] } }).summary.hostsBlocked.length).toBe(3) // still reported, just without the key
    expect(allText(out)).not.toMatch(SECRETS)
  })
  it('a ticket line that carries a key is redacted in the JSONL record (and in the result file)', async () => {
    const post = (async () => {
      console.log('{"type":"tappyai_web_ticket","note":"sk-test-SECRET-123 and serper-SECRET-456"}')
      return new Response('0:"x"\nd:{"finishReason":"stop"}\n')
    }) as unknown as typeof POST
    const out = await runLiveTrial(input({ post }))
    expect(out.kind).toBe('ran')
    expect(jsonlLines(fs)[0].ticketLog).toHaveLength(1) // the line is kept, only the key is gone
    expect(allText(out)).not.toMatch(SECRETS)
  })
  it('a file-system error that quotes a key, when the turn record cannot be saved: the thrown error, the result file and the files carry no key', async () => {
    const real = fs.append
    fs.append = (p, t) => { if (!t.includes('"started"')) throw new Error('disk said sk-test-SECRET-123 and serper-SECRET-456'); real(p, t) }
    const err = await runLiveTrial(input()).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(`${(err as Error).name} ${(err as Error).message}`).not.toMatch(SECRETS)
    expect(allText(null)).not.toMatch(SECRETS)
    expect(finalFile(fs)!.json.writeError).toMatch(/disk said/) // the useful part stays
  })
  it('a file-system error that quotes a key, when the turn cannot be announced (nothing was sent)', async () => {
    const real = fs.append
    fs.append = (p, t) => { if (t.includes('"started"')) throw new Error('disk said sk-test-SECRET-123 and serper-SECRET-456'); real(p, t) }
    const err = await runLiveTrial(input()).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(`${(err as Error).name} ${(err as Error).message}`).not.toMatch(SECRETS)
    expect(allText(null)).not.toMatch(SECRETS)
    expect(net.openai).toHaveLength(0)
  })
  it('a refusal that would echo a value (a cap variable holding a key) does not carry it', async () => {
    stubEnv({ BENCH_SPEND_TURN_CAP_USD: 'sk-test-SECRET-123', BENCH_CONFIRM_SPEND: 'serper-SECRET-456' })
    const out = await runLiveTrial(input())
    expect(out.kind).toBe('refused')
    expect(JSON.stringify(out)).not.toMatch(SECRETS)
    nothingHappened()
  })
  it('re-review: a refusal that comes from the runner (the output folder cannot be created and the file-system error quotes a key) carries no key', async () => {
    fs.mkdirp = () => { throw new Error('EACCES sk-test-SECRET-123 serper-SECRET-456') }
    const out = await runLiveTrial(input())
    expect(out.kind).toBe('refused')
    expect(JSON.stringify(out)).not.toMatch(SECRETS)
    expect(net.openai).toHaveLength(0); expect(net.serper).toHaveLength(0)
  })
  it('re-review: redaction uses the keys of the environment passed in AND of process.env (they may differ in a rehearsal)', async () => {
    stubEnv({ BENCH_SPEND_TURN_CAP_USD: 'serper-SECRET-456' }) // process.env holds the Serper key serper-SECRET-456 and a cap variable that echoes it
    const out = await runLiveTrial(input({ env: { ...process.env, SERPER_API_KEY: 'a-different-key-0000' } }))
    expect(out.kind).toBe('refused')
    expect(JSON.stringify(out)).not.toMatch(SECRETS)
  })
  it('a question file that cannot be read: the reason carries no key', async () => {
    const out = await runLiveTrial(input({ readTextFile: () => { throw new Error('ENOENT sk-test-SECRET-123') } }))
    expect(out.kind).toBe('refused')
    expect(JSON.stringify(out)).not.toMatch(SECRETS)
  })
})
