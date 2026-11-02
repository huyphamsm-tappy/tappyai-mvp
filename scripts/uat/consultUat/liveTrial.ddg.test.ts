// @vitest-environment node
// Wave 2 · P1.1 · the DuckDuckGo fallback of web_search (common.ts webSearchImpl asks https://html.duckduckgo.com/html/ when Serper gives no rows) is reachable in the EXTENSION mode only
// (BENCH_TRIAL_MODE exactly dev-multi), exactly like the three OSM hosts (liveTrial.hostb.test.ts): exactly this host and this path, https, default port, no wildcard, no subdomain,
// a redirect is never followed, a COUNT per host (never the query or the URL), free: outside the Serper request cap and the USD gate. Every other mode blocks it as before.
// MOCK ONLY: a fake network, no key, no real host; `post` is a stand-in that fetches what the test says.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { TRIAL_ALLOWED_HOSTS, formatSummary, isAllowedRequest, runLiveTrial, type TrialSummary } from './liveTrial'
import { conditionReport } from './preflightReport'
import { gate1Summary } from './liveTrialLauncher.mjs'
import type { UatTurn } from './questions'

const DDG = 'https://html.duckduckgo.com/html/?q=gia%20xang%20hom%20nay'
const EXT_ENV: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const ACCEPTANCE_ENV = { ...EXT_ENV, BENCH_SPEND_RUN_CAP_USD: '0.05', BENCH_CONFIRM_SPEND: '0.05' }
const TURN: UatTurn[] = [{ id: 'H1', conversation: 'H1', turn: 1, text: 'Cau hoi kiem thu rieng cho chu vi mang.' }]
const reached: string[] = [], followed: string[] = []
const makeNetwork = (redirectFrom?: string) => (async (input: unknown, init?: { redirect?: string }): Promise<Response> => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  reached.push(u.hostname)
  if (redirectFrom && u.hostname === redirectFrom) {
    if (init?.redirect !== 'manual') { followed.push('evil.example'); reached.push('evil.example'); return new Response('<html></html>', { status: 200 }) }
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } })
  }
  return new Response('<html></html>', { status: 200 })
}) as typeof fetch

beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap(); reached.length = 0; followed.length = 0
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'BENCH_RESET_FREE_QUOTA_PER_TURN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

interface Run { summary: TrialSummary; outcomes: Record<string, 'sent' | 'blocked'>; resultJson: string; net: string[] }
async function run(env: Record<string, string | undefined>, urls: readonly string[], network = makeNetwork()): Promise<Run> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const outcomes: Record<string, 'sent' | 'blocked'> = {}
  const post = async (): Promise<Response> => { for (const url of urls) { try { await fetch(url); outcomes[url] = 'sent' } catch { outcomes[url] = 'blocked' } } return new Response('', { status: 200 }) }
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: network, fs, repoRoot: process.cwd(), now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const file = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  return { summary: out.summary, outcomes, resultJson: file ? file[1] : '', net: [...reached] }
}

describe('the pure allow-list: exactly one DuckDuckGo endpoint, only when the extension is asked for', () => {
  it('the production allow-list is still the two paid hosts', () => { expect(TRIAL_ALLOWED_HOSTS).toEqual(['api.openai.com', 'google.serper.dev']) })
  it('by default the DuckDuckGo endpoint is blocked; with the extension setting it is allowed', () => {
    expect(isAllowedRequest(DDG).ok).toBe(false)
    expect(isAllowedRequest(DDG, true)).toEqual({ ok: true, host: 'html.duckduckgo.com' })
  })
  const NEAR = [
    'https://duckduckgo.com/html/?q=x', 'https://www.duckduckgo.com/html/?q=x', 'https://html.duckduckgo.com.evil.com/html/?q=x', 'https://sub.html.duckduckgo.com/html/?q=x', 'https://xhtml.duckduckgo.com/html/?q=x',
    'http://html.duckduckgo.com/html/?q=x', 'https://html.duckduckgo.com:8443/html/?q=x', 'https://user:pw@html.duckduckgo.com/html/?q=x', 'https://html.duckduckgo.com/', 'https://html.duckduckgo.com/html',
    'https://html.duckduckgo.com/lite/', 'https://html.duckduckgo.com/html/x', 'https://html.duckduckgo.com@evil.example/html/', 'https://lite.duckduckgo.com/lite/', 'https://api.duckduckgo.com/?q=x&format=json',
  ]
  for (const url of NEAR) it(`extension: ${JSON.stringify(url)} is still blocked`, () => { expect(isAllowedRequest(url, true).ok).toBe(false) })
})

describe('through the real wrapper: dev-multi lets the endpoint through and counts it; any other mode blocks it', () => {
  it('dev-multi: sent, not listed as blocked, counted once, host entry in hostRequests, nothing about the query anywhere', async () => {
    const r = await run(EXT_ENV, [DDG])
    expect(r.outcomes[DDG]).toBe('sent'); expect(r.net).toEqual(['html.duckduckgo.com'])
    expect(r.summary.hostsBlocked).toEqual([])
    expect(r.summary.ddgRequests).toEqual({ 'html.duckduckgo.com': 1 })
    expect(r.summary.hostRequests).toEqual({ 'html.duckduckgo.com': 1 })
    const text = formatSummary(r.summary)
    expect(text).toMatch(/DuckDuckGo fallback host \(free: no Serper credit, no OpenAI cost; outside the request cap and the USD gate; counted, not priced\): html\.duckduckgo\.com=1/)
    for (const t of [text, r.resultJson, JSON.stringify(r.summary)]) expect(t).not.toMatch(/gia%20xang|q=|\/html\/\?/)
    expect(JSON.parse(r.resultJson).ddgRequests).toEqual({ 'html.duckduckgo.com': 1 })
    expect(r.summary.requestCap).toEqual({ perTurnLimit: 15, runLimit: 450, sent: 0, refused: 0 }) // free host: nothing for the cap to count
    expect(r.summary.serperRequests).toBe(0); expect(r.summary.warnings.join(' | ')).not.toMatch(/blocked|duckduckgo|count differs/i)
  })
  it('dev-multi: a near-miss next to it is blocked, listed, and makes the run NOT CLEAN', async () => {
    const bad = 'https://duckduckgo.com/html/?q=x'
    const r = await run(EXT_ENV, [DDG, bad])
    expect(r.outcomes[DDG]).toBe('sent'); expect(r.outcomes[bad]).toBe('blocked'); expect(r.summary.hostsBlocked).toEqual(['duckduckgo.com'])
    expect(r.summary.trialClean).toBe(false)
  })
  const MODES: Array<[string, Record<string, string | undefined>]> = [
    ['a missing mode (acceptance)', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: undefined }], ['acceptance written out', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'acceptance' }], ['an unknown mode', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'weird' }],
    ['DEV-MULTI', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'DEV-MULTI' }], ['"dev-multi " with a space', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'dev-multi ' }], ['an empty mode', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: '' }],
  ]
  for (const [name, env] of MODES) {
    it(`${name}: blocked, listed, not sent, counted as 0`, async () => {
      const r = await run(env, [DDG])
      expect(r.outcomes[DDG]).toBe('blocked'); expect(r.net).toEqual([]); expect(r.summary.hostsBlocked).toEqual(['html.duckduckgo.com'])
      expect(r.summary.ddgRequests).toEqual({ 'html.duckduckgo.com': 0 }); expect(r.summary.trialClean).toBe(false)
    })
  }
})

describe('a redirect from the endpoint cannot leave the allow-list', () => {
  it('redirect: manual is forced: the evil host is not reached, the 302 is reported, the run is NOT CLEAN', async () => {
    const r = await run(EXT_ENV, [DDG], makeNetwork('html.duckduckgo.com'))
    expect(followed).toEqual([]); expect(r.net).not.toContain('evil.example')
    expect(r.summary.redirects).toEqual([{ host: 'html.duckduckgo.com', status: 302 }]); expect(r.summary.trialClean).toBe(false)
  })
})

describe('what the Owner is shown names the endpoint in the extension mode only', () => {
  const allow = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return conditionReport({ env: process.env, repoRoot: process.cwd(), questionText: null }).find(x => x.name === 'allow-list the run may reach')!.detail
  }
  it('the preflight list', () => {
    expect(allow(EXT_ENV)).toMatch(/html\.duckduckgo\.com \/html\//)
    expect(allow({ ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: undefined })).not.toMatch(/duckduckgo/i)
  })
  it('Gate 1, in Vietnamese, never naming a Serper host', () => {
    const ext = gate1Summary({ ...EXT_ENV }, null).join('\n')
    expect(ext).toMatch(/html\.duckduckgo\.com.*chỉ đếm số request từng host/)
    expect(gate1Summary({ ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: undefined }, null).join('\n')).toMatch(/ba host OSM và DuckDuckGo của dự phòng tìm kiếm bị CHẶN \(chế độ nghiệm thu\)/)
    expect(ext).not.toMatch(/serper\.dev/i)
  })
})
