// @vitest-environment node
// Wave 4 (C-PRE-0) · BENCH_ALLOW_PUBLIC_PAGE_FETCH: the page reader's own requests (made INSIDE a `read_page` tool call: the page, its robots.txt, each redirect hop) may reach a public
// HTTP(S) page in the bench - only with the flag exactly "1" in the extension mode, only GET, never a private / local / link-local / metadata / internal name, at most
// PUBLIC_PAGE_MAX_PER_TURN per turn, counted in their own ledger. Flag OFF = the allow-list of a58dd26 byte for byte. MOCK ONLY: a fake network, no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import https from 'node:https'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { traceToolCall } from '@/lib/ai/tools/toolTrace'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { PUBLIC_PAGE_FETCH_FLAG, PUBLIC_PAGE_MAX_PER_TURN, TRIAL_ALLOWED_HOSTS, benchSwitchState, isAllowedRequest, isPublicPageRequest, publicPageFetchAllowed, runLiveTrial, type TrialSummary } from './liveTrial'
import { conditionReport } from './preflightReport'
import { FLAG_ENV_NAMES, benchSwitchLine, gate1Summary } from './liveTrialLauncher.mjs'
import type { UatTurn } from './questions'

const EXT_ENV: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave4/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const ON_ENV = { ...EXT_ENV, [PUBLIC_PAGE_FETCH_FLAG]: '1' }
const TURN: UatTurn[] = [{ id: 'P1', conversation: 'P1', turn: 1, text: 'Cau hoi kiem thu rieng cho chu vi mang.' }]
const reached: string[] = []
const network = (async (input: unknown, init?: { redirect?: string }): Promise<Response> => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  reached.push(u.hostname)
  if (u.hostname === 'redirector.example' && init?.redirect === 'manual') return new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } })
  return new Response('<html></html>', { status: 200 })
}) as typeof fetch

beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap(); reached.length = 0
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'BENCH_RESET_FREE_QUOTA_PER_TURN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

type Call = { url: string; tool: 'read_page' | 'web_search' | null; method?: string }
interface Run { summary: TrialSummary; outcomes: Array<'sent' | 'blocked'>; resultJson: string; result: Record<string, unknown> }
async function run(env: Record<string, string | undefined>, calls: readonly Call[]): Promise<Run> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const outcomes: Array<'sent' | 'blocked'> = []
  const post = async (): Promise<Response> => {
    for (const c of calls) {
      const go = () => fetch(c.url, c.method ? { method: c.method } : undefined)
      try { await (c.tool ? traceToolCall(c.tool, {}, go) : go()); outcomes.push('sent') } catch { outcomes.push('blocked') }
    }
    return new Response('', { status: 200 })
  }
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: network, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const file = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  const resultJson = file ? file[1] : '{}'
  return { summary: out.summary, outcomes, resultJson, result: JSON.parse(resultJson) }
}

describe('the pure rule: a GET to a public http(s) page that passes the product\'s own string-level host check', () => {
  for (const url of ['https://www.nasa.gov/news/x?utm=1', 'http://example.com/page', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1/', 'https://www.apple.com./airpods']) {
    it(`allowed: ${url}`, () => { expect(isPublicPageRequest(url).ok).toBe(true) })
  }
  const BAD = [
    'http://localhost/', 'http://localhost./', 'http://api.localhost/', 'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.0.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://metadata.google.internal/', 'http://metadata.google.internal./', 'http://x.internal/', 'http://printer.local/', 'http://intranet/', 'http://[::1]/', 'http://[::ffff:7f00:1]/',
    'http://100.64.0.1/', 'http://0.0.0.0/', 'https://user:pw@example.com/', 'https://example.com:8443/', 'http://example.com:6379/', 'ftp://example.com/x', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '',
  ]
  for (const url of BAD) it(`refused: ${JSON.stringify(url)}`, () => { expect(isPublicPageRequest(url).ok).toBe(false) })
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT']) it(`only GET: ${m} is refused`, () => { expect(isPublicPageRequest('https://www.nasa.gov/x', m).ok).toBe(false) })
  it('get / GET / Get are all a GET', () => { for (const m of ['GET', 'get', 'Get']) expect(isPublicPageRequest('https://www.nasa.gov/x', m).ok).toBe(true) })
  it('the paid-host allow-list itself is untouched (still the two hosts) and a public page is not on it', () => {
    expect(TRIAL_ALLOWED_HOSTS).toEqual(['api.openai.com', 'google.serper.dev'])
    expect(isAllowedRequest('https://www.nasa.gov/x', true).ok).toBe(false)
  })
})

describe('the flag: exactly "1", extension mode only', () => {
  it('truth table', () => {
    const ext = (v: string | undefined) => publicPageFetchAllowed({ BENCH_TRIAL_MODE: 'dev-multi', ...(v === undefined ? {} : { [PUBLIC_PAGE_FETCH_FLAG]: v }) })
    expect(ext('1')).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes', '01', '2']) expect(ext(v), String(v)).toBe(false)
    expect(publicPageFetchAllowed({ [PUBLIC_PAGE_FETCH_FLAG]: '1' })).toBe(false)
    for (const m of ['', 'acceptance', 'Dev-Multi', 'dev-multi ', 'extension']) expect(publicPageFetchAllowed({ BENCH_TRIAL_MODE: m, [PUBLIC_PAGE_FETCH_FLAG]: '1' }), m).toBe(false)
  })
})

describe('through the real wrapper', () => {
  const PAGE = 'https://www.nasa.gov/news/some-article?utm_source=SECRETQUERY&q=ricequery'
  it('flag OFF: a read_page request to a public page is blocked before it is sent and listed in blockedLog - exactly the old behaviour', async () => {
    const r = await run(EXT_ENV, [{ url: PAGE, tool: 'read_page' }])
    expect(r.outcomes).toEqual(['blocked']); expect(reached).toEqual([])
    expect(r.summary.hostsBlocked).toEqual(['www.nasa.gov'])
    expect(r.result.blockedLog).toEqual([{ turn: 'P1', label: 'www.nasa.gov' }])
    expect(r.result).not.toHaveProperty('pageRequests')
    expect(r.result.requestLog).toEqual([])
  })
  it('flag ON, inside read_page: sent, counted in its own ledger, logged by host + path (never the query), not a Serper or OpenAI request, not blocked', async () => {
    const r = await run(ON_ENV, [{ url: PAGE, tool: 'read_page' }])
    expect(r.outcomes).toEqual(['sent']); expect(reached).toEqual(['www.nasa.gov'])
    expect(r.summary.hostsBlocked).toEqual([])
    expect(r.result.pageRequests).toEqual({ 'www.nasa.gov': 1 })
    expect(r.result.requestLog).toMatchObject([{ turn: 'P1', host: 'www.nasa.gov', path: '/news/some-article' }])
    expect(r.result.blockedLog).toEqual([])
    expect(r.summary.hostRequests).toEqual({}) // the paid-host ledger does not see it
    expect(r.summary.serperRequests).toBe(0); expect(r.summary.llmRequests).toBe(0)
    for (const t of [r.resultJson, JSON.stringify(r.summary)]) expect(t).not.toMatch(/SECRETQUERY|ricequery|utm_source/)
  })
  it('flag ON but NOT inside read_page (no tool context, or another tool): blocked', async () => {
    const r = await run(ON_ENV, [{ url: PAGE, tool: null }, { url: PAGE, tool: 'web_search' }])
    expect(r.outcomes).toEqual(['blocked', 'blocked']); expect(reached).toEqual([])
    expect(r.summary.hostsBlocked).toEqual(['www.nasa.gov'])
  })
  it('flag ON in the ACCEPTANCE mode: ignored (blocked)', async () => {
    const r = await run({ ...ON_ENV, BENCH_TRIAL_MODE: undefined, BENCH_SPEND_RUN_CAP_USD: '0.05', BENCH_CONFIRM_SPEND: '0.05' }, [{ url: PAGE, tool: 'read_page' }])
    expect(r.outcomes).toEqual(['blocked']); expect(reached).toEqual([])
  })
  it('flag ON: private / local / link-local / metadata / internal names and non-GET are blocked even inside read_page, each listed in blockedLog', async () => {
    const calls: Call[] = [
      { url: 'http://localhost/admin', tool: 'read_page' }, { url: 'http://127.0.0.1/', tool: 'read_page' }, { url: 'http://10.0.0.5/x', tool: 'read_page' },
      { url: 'http://169.254.169.254/latest/meta-data/', tool: 'read_page' }, { url: 'http://metadata.google.internal./x', tool: 'read_page' }, { url: 'https://user:pw@example.com/', tool: 'read_page' },
      { url: 'https://example.com:8443/', tool: 'read_page' }, { url: 'https://www.nasa.gov/x', tool: 'read_page', method: 'POST' },
    ]
    const r = await run(ON_ENV, calls)
    expect(r.outcomes).toEqual(calls.map(() => 'blocked')); expect(reached).toEqual([])
    expect((r.result.blockedLog as unknown[]).length).toBe(calls.length)
    expect(r.result.pageRequests).toEqual({})
  })
  it('flag ON: a redirect is never followed by the wrapper (each hop is a request of its own, judged on its own) and is recorded', async () => {
    const r = await run(ON_ENV, [{ url: 'https://redirector.example/go', tool: 'read_page' }])
    expect(r.outcomes).toEqual(['sent']); expect(reached).toEqual(['redirector.example'])
    expect(r.summary.redirects).toEqual([{ host: 'redirector.example', status: 302 }])
  })
  it(`flag ON: at most ${PUBLIC_PAGE_MAX_PER_TURN} public-page requests per turn, the next is blocked`, async () => {
    const calls: Call[] = Array.from({ length: PUBLIC_PAGE_MAX_PER_TURN + 3 }, (_, i) => ({ url: `https://www.nasa.gov/p${i}`, tool: 'read_page' as const }))
    const r = await run(ON_ENV, calls)
    expect(r.outcomes.filter(o => o === 'sent').length).toBe(PUBLIC_PAGE_MAX_PER_TURN)
    expect(r.outcomes.filter(o => o === 'blocked').length).toBe(3)
    expect((r.result.pageRequests as Record<string, number>)['www.nasa.gov']).toBe(PUBLIC_PAGE_MAX_PER_TURN)
  })
  it('flag ON: the paid hosts keep working and keep their own ledger', async () => {
    const r = await run(ON_ENV, [{ url: 'https://api.openai.com/v1/chat/completions', tool: null }, { url: PAGE, tool: 'read_page' }])
    expect(r.outcomes).toEqual(['sent', 'sent']); expect(r.summary.hostRequests).toEqual({ 'api.openai.com': 1 })
  })
  it('node https.request: a blocked page (flag OFF, or a private name with the flag ON) is refused before the real request function runs', async () => {
    const real = https.request
    let called = 0
    const post = async (): Promise<Response> => {
      for (const [opts, tool] of [[{ hostname: 'www.nasa.gov', path: '/x', method: 'GET' }, 'read_page'], [{ hostname: '127.0.0.1', path: '/x', method: 'GET' }, 'read_page'], [{ hostname: 'www.nasa.gov', path: '/x', method: 'POST' }, 'read_page']] as const) {
        try { traceToolCall(tool, {}, () => https.request(opts)); called++ } catch { /* refused */ }
      }
      return new Response('', { status: 200 })
    }
    for (const [k, v] of Object.entries(EXT_ENV)) vi.stubEnv(k, v)
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
    try { await runLiveTrial({ env: process.env, post: post as never, fetchImpl: network, fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
    expect(called).toBe(0)
    expect(https.request).toBe(real) // the trial restores the network afterwards
  })
})

describe('Gate 1 and the preflight say the real state; the launcher knows the name', () => {
  const cases: Array<Record<string, string>> = [{}, { LEGACY_STREAM_TRACE: '1' }, { LEGACY_STREAM_TRACE: 'true' }, { LEGACY_STREAM_TRACE: '0' }, { LEGACY_STREAM_TRACE: ' 1 ' },
    { BENCH_TRIAL_MODE: 'dev-multi', [PUBLIC_PAGE_FETCH_FLAG]: '1' }, { BENCH_TRIAL_MODE: 'dev-multi', [PUBLIC_PAGE_FETCH_FLAG]: 'true' }, { [PUBLIC_PAGE_FETCH_FLAG]: '1' }, { BENCH_TRIAL_MODE: 'dev-multi', [PUBLIC_PAGE_FETCH_FLAG]: '0' }]
  for (const [i, env] of cases.entries()) {
    it(`case ${i}: ${JSON.stringify(env)}`, () => {
      const s = benchSwitchState(env), line = benchSwitchLine(env)
      expect(line).toContain(`(${s.trace}:`); expect(line).toContain(`(${s.page}:`)
      expect(gate1Summary({ ...env }, null).some(l => l === line)).toBe(true)
      const full = { ...EXT_ENV, ...env }, sf = benchSwitchState(full)
      expect(benchSwitchLine(full)).toContain(`(${sf.page}:`)
      const report = conditionReport({ env: full, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null })
      const row = report.find(c => c.name.startsWith('bench switches'))!
      expect(row.ok).toBe(true); expect(row.detail).toContain(`(${sf.trace})`); expect(row.detail).toContain(`(${sf.page})`)
    })
  }
  it('LEGACY_STREAM_TRACE is shown as BẬT only for the values the product reads as ON (1 / true, trimmed)', () => {
    expect(benchSwitchState({ LEGACY_STREAM_TRACE: '1' }).trace).toBe('BẬT'); expect(benchSwitchState({ LEGACY_STREAM_TRACE: ' true ' }).trace).toBe('BẬT')
    for (const v of [undefined, '', '0', 'on', 'yes']) expect(benchSwitchState(v === undefined ? {} : { LEGACY_STREAM_TRACE: v }).trace).toBe('TẮT')
  })
  it('the name is in the launcher allow-list and in the flags the result records, equally', () => {
    expect(FLAG_ENV_NAMES).toContain(PUBLIC_PAGE_FETCH_FLAG); expect(BENCH_FLAG_NAMES).toContain(PUBLIC_PAGE_FETCH_FLAG)
    expect([...FLAG_ENV_NAMES].sort()).toEqual([...BENCH_FLAG_NAMES].sort())
  })
})
