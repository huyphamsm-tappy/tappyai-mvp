// @vitest-environment node
// Wave 4 (C-PRE-0) · BENCH_ALLOW_PUBLIC_PAGE_FETCH: the page reader's own requests (made INSIDE a `read_page` tool call: the page, its robots.txt, each redirect hop) may reach a public
// HTTP(S) page in the bench - only with the flag exactly "1" in the extension mode, only GET, never a private / local / link-local / metadata / internal name, at most
// PUBLIC_PAGE_MAX_PER_TURN per turn, counted in their own ledger. Flag OFF = the allow-list of a58dd26 byte for byte. MOCK ONLY: a fake network, no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { safeLookup } from '@/lib/security/safeFetch'
import { realHop } from '@/lib/security/safePageFetch'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
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
  try { out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: network, fs, repoRoot: process.cwd(), now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
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
    try { await runLiveTrial({ env: process.env, post: post as never, fetchImpl: network, fs: memFs(), repoRoot: process.cwd(), now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
    expect(called).toBe(0)
    expect(https.request).toBe(real) // the trial restores the network afterwards
  })
})

// Wave 4 fix N4: the node:http(s) path of the wrapper, judged through the real wrapper. The node functions the trial captures as "the originals" are fakes put in place BEFORE the
// trial starts (no socket is ever opened): a call the wrapper admits reaches the fake (recorded), a refused one throws before it.
type NodeCall = { lib: 'http' | 'https'; fn: 'request' | 'get'; args: unknown[] }
const DUMMY_REQ = { on: () => DUMMY_REQ, end: () => undefined, destroy: () => undefined, setTimeout: () => DUMMY_REQ }
async function runNode(env: Record<string, string | undefined>, calls: readonly NodeCall[], turns: readonly UatTurn[] = TURN): Promise<{ outcomes: Array<'sent' | 'blocked'>; reachedNode: string[]; result: Record<string, unknown> }> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const saved = { hr: http.request, hg: http.get, sr: https.request, sg: https.get }
  const reachedNode: string[] = []
  const fake = (label: string) => ((...a: unknown[]) => { const o = (typeof a[0] === 'object' && !(a[0] instanceof URL) ? a[0] : a[1]) as { hostname?: string } | undefined; reachedNode.push(`${label} ${o?.hostname ?? String(a[0])}`); return DUMMY_REQ }) as never
  http.request = fake('http.request'); http.get = fake('http.get'); https.request = fake('https.request'); https.get = fake('https.get')
  const outcomes: Array<'sent' | 'blocked'> = []
  const post = async (): Promise<Response> => {
    for (const c of calls) {
      const lib = c.lib === 'http' ? http : https
      try { await traceToolCall('read_page', {}, async () => (lib[c.fn] as (...a: unknown[]) => unknown)(...c.args)); outcomes.push('sent') } catch { outcomes.push('blocked') }
    }
    // a real answer with a known cost (as liveTrial.turnsCap.test.ts): otherwise the runner halts after the first turn and a second turn never runs
    await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' })
    reserveSpend('llm:consult', 0.01)!.settle(0.001, { tokensIn: 1, tokensOut: 1, cachedIn: 0 })
    return new Response('0:"ok"\nd:{"finishReason":"stop"}\n')
  }
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: network, fs, repoRoot: process.cwd(), now: () => 1_000, turns, afterTrial: 'restore' } as never) } finally {
    spies.forEach(s => s.mockRestore()); http.request = saved.hr; http.get = saved.hg; https.request = saved.sr; https.get = saved.sg
  }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const file = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  return { outcomes, reachedNode, result: JSON.parse(file ? file[1] : '{}') }
}
const pinned = (o: Record<string, unknown>) => ({ ...o, lookup: safeLookup, agent: false })

describe('fix N4 · the node:http(s) path of the wrapper (flag ON, inside read_page)', () => {
  it('(a) only GET: the options form, the (url, options) form, node:http and node:https - a non-GET is refused before the request function runs; GET goes through (live control)', async () => {
    const calls: NodeCall[] = [
      { lib: 'http', fn: 'request', args: [pinned({ hostname: 'www.nasa.gov', path: '/a', method: 'GET' })] },
      { lib: 'http', fn: 'request', args: [pinned({ hostname: 'www.nasa.gov', path: '/b', method: 'POST' })] },
      { lib: 'http', fn: 'request', args: ['http://www.nasa.gov/c', pinned({ method: 'PUT' })] },
      { lib: 'https', fn: 'request', args: [pinned({ hostname: 'www.nasa.gov', path: '/d', method: 'DELETE' })] },
      { lib: 'https', fn: 'request', args: [pinned({ hostname: 'www.nasa.gov', path: '/e' })] },            // no method: node's default, a GET
      { lib: 'http', fn: 'get', args: [pinned({ hostname: 'www.nasa.gov', path: '/f' })] },
    ]
    const r = await runNode(ON_ENV, calls)
    expect(r.outcomes).toEqual(['sent', 'blocked', 'blocked', 'blocked', 'sent', 'sent'])
    expect(r.reachedNode).toEqual(['http.request www.nasa.gov', 'https.request www.nasa.gov', 'http.get www.nasa.gov'])
    expect(r.result.pageRequests).toEqual({ 'www.nasa.gov': 3 })
  })
  it('(b) the wrapper itself requires the product\'s safeLookup on a public-page request: absent → refused, another function → refused, safeLookup → sent', async () => {
    const other = (() => undefined) as unknown
    const calls: NodeCall[] = [
      { lib: 'https', fn: 'request', args: [{ hostname: 'www.nasa.gov', path: '/x', method: 'GET', agent: false }] },
      { lib: 'https', fn: 'request', args: ['https://www.nasa.gov/y', { method: 'GET' }] },
      { lib: 'https', fn: 'request', args: [{ hostname: 'www.nasa.gov', path: '/z', method: 'GET', lookup: other }] },
      { lib: 'https', fn: 'request', args: [pinned({ hostname: 'www.nasa.gov', path: '/ok', method: 'GET' })] },
    ]
    const r = await runNode(ON_ENV, calls)
    expect(r.outcomes).toEqual(['blocked', 'blocked', 'blocked', 'sent'])
    expect(r.reachedNode).toEqual(['https.request www.nasa.gov'])
  })
  it('(b) the product\'s page reader really passes it: realHop calls node:https with lookup = safeLookup and agent = false', async () => {
    const seen: Array<Record<string, unknown>> = []
    const spy = vi.spyOn(https, 'request').mockImplementation(((o: Record<string, unknown>) => { seen.push(o); return { on: (ev: string, cb: (e: Error) => void) => { if (ev === 'error') setTimeout(() => cb(new Error('no network in this test')), 0); return undefined }, end: () => undefined, destroy: () => undefined } }) as never)
    try { await realHop(new URL('https://www.nasa.gov/x'), { signal: new AbortController().signal, maxBytes: 1000, connectTimeoutMs: 1000, readTimeoutMs: 1000 }) } finally { spy.mockRestore() }
    expect(seen).toHaveLength(1)
    expect(seen[0]!.lookup).toBe(safeLookup); expect(seen[0]!.agent).toBe(false); expect(seen[0]!.method).toBe('GET')
  })
  it(`(c) the cap is PER TURN: two turns of ${PUBLIC_PAGE_MAX_PER_TURN + 2} requests each - ${PUBLIC_PAGE_MAX_PER_TURN} sent in EACH turn, the 2 over the cap refused in each`, async () => {
    const turns: UatTurn[] = [{ id: 'P1', conversation: 'P1', turn: 1, text: 'Cau hoi kiem thu thu nhat.' }, { id: 'P2', conversation: 'P2', turn: 1, text: 'Cau hoi kiem thu thu hai.' }]
    const calls: NodeCall[] = Array.from({ length: PUBLIC_PAGE_MAX_PER_TURN + 2 }, (_, i) => ({ lib: 'https' as const, fn: 'request' as const, args: [pinned({ hostname: 'www.nasa.gov', path: `/p${i}`, method: 'GET' })] }))
    const r = await runNode(ON_ENV, calls, turns)
    const perTurn = [r.outcomes.slice(0, calls.length), r.outcomes.slice(calls.length)]
    expect(r.outcomes).toHaveLength(2 * calls.length)
    for (const t of perTurn) { expect(t.filter(o => o === 'sent').length).toBe(PUBLIC_PAGE_MAX_PER_TURN); expect(t.slice(PUBLIC_PAGE_MAX_PER_TURN)).toEqual(['blocked', 'blocked']) }
    expect((r.result.pageRequests as Record<string, number>)['www.nasa.gov']).toBe(2 * PUBLIC_PAGE_MAX_PER_TURN)
  })
  it('flag OFF: the same pinned GET is refused (the node path follows the flag too)', async () => {
    const r = await runNode(EXT_ENV, [{ lib: 'https', fn: 'request', args: [pinned({ hostname: 'www.nasa.gov', path: '/x', method: 'GET' })] }])
    expect(r.outcomes).toEqual(['blocked']); expect(r.reachedNode).toEqual([])
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
      const report = conditionReport({ env: full, repoRoot: process.cwd(), questionText: null })
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
