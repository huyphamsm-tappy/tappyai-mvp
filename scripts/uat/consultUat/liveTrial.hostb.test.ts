// @vitest-environment node
// Option B · the three OpenStreetMap hosts of search_places' own fallback are reachable in the EXTENSION mode only (BENCH_TRIAL_MODE exactly dev-multi), nothing else changes.
//   · exactly three hosts, exact paths, https, default port, no wildcard, no subdomain: nominatim.openstreetmap.org /search · overpass-api.de /api/interpreter ·
//     maps.mail.ru /osm/tools/overpass/api/interpreter (the paths search_places uses: food.ts, travel.ts)
//   · acceptance mode, a missing mode and an unknown mode block all three exactly as before; the production allow-list (TRIAL_ALLOWED_HOSTS) is untouched
//   · a redirect from an allowed host is never followed (the wrapper forces redirect: 'manual') and is reported
//   · the summary and the result file carry a COUNT per host (never the query, the URL or a coordinate); the hosts are free, outside the Serper cap and the USD gate
//   · the key must have the OpenAI shape (starts with sk-) before the first paid call: preflight report AND the real run refuse, naming the variable and never any character of it
// MOCK ONLY: a fake network, no key, no real host. The `post` handler is a stand-in that fetches what the test tells it to; the route is not involved here (e1.reproduction.route.test.ts
// covers the real route).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { TRIAL_ALLOWED_HOSTS, formatSummary, isAllowedRequest, runLiveTrial, type TrialSummary } from './liveTrial'
import { conditionReport, formatConditionReport } from './preflightReport'
import { gate1Summary } from './liveTrialLauncher.mjs'
import type { UatTurn } from './questions'

const OSM = {
  nominatim: 'https://nominatim.openstreetmap.org/search?q=Quan%207%20Vietnam&format=json&limit=1',
  overpass: 'https://overpass-api.de/api/interpreter',
  mailru: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
} as const
const OSM_HOSTS = ['nominatim.openstreetmap.org', 'overpass-api.de', 'maps.mail.ru'] as const

const EXT_ENV: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-closure2/hostb/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
/** The acceptance-mode variant (0,65 USD maximum): caps equal to a value the acceptance mode accepts. */
const ACCEPTANCE_ENV = { ...EXT_ENV, BENCH_SPEND_RUN_CAP_USD: '0.05', BENCH_CONFIRM_SPEND: '0.05' }
const TURN: UatTurn[] = [{ id: 'H1', conversation: 'H1', turn: 1, text: 'Câu hỏi kiểm thử riêng cho chu vi mạng.' }]

const reached: string[] = []
const followed: string[] = []
/** The fake network. A redirect response is answered for the host named `redir`; a request that is allowed to FOLLOW redirects does so, as a real fetch would. */
const makeNetwork = (redirectFrom?: string) => (async (input: unknown, init?: { redirect?: string }): Promise<Response> => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  reached.push(u.hostname)
  if (redirectFrom && u.hostname === redirectFrom) {
    if (init?.redirect !== 'manual') { followed.push('evil.example'); reached.push('evil.example'); return new Response('{}', { status: 200 }) } // what an un-wrapped fetch would do
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } })
  }
  return new Response('{"elements":[]}', { status: 200 })
}) as typeof fetch

beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap(); reached.length = 0; followed.length = 0
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

interface Run { summary: TrialSummary; outcomes: Record<string, 'sent' | 'blocked'>; resultJson: string; allText: string; net: typeof reached }
/** One development turn whose handler fetches every URL in `urls` through the (wrapped) global fetch. `env` replaces the base environment. */
async function run(env: Record<string, string | undefined>, urls: readonly string[], network = makeNetwork()): Promise<Run> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const outcomes: Record<string, 'sent' | 'blocked'> = {}
  const post = async (): Promise<Response> => {
    for (const url of urls) { try { await fetch(url); outcomes[url] = 'sent' } catch { outcomes[url] = 'blocked' } }
    return new Response('', { status: 200 })
  }
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: network, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const file = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  return { summary: out.summary, outcomes, resultJson: file ? file[1] : '', allText: [...fs.files.values()].join('\n'), net: [...reached] }
}

describe('option B · the pure allow-list: three exact OSM endpoints only when asked for, the production list untouched', () => {
  it('the production allow-list is still exactly the two paid hosts', () => { expect(TRIAL_ALLOWED_HOSTS).toEqual(['api.openai.com', 'google.serper.dev']) })
  it('by default (no second argument) every OSM endpoint is blocked, as before', () => {
    for (const url of Object.values(OSM)) expect(isAllowedRequest(url).ok, url).toBe(false)
  })
  for (const [name, url] of Object.entries(OSM)) {
    it(`extension: ${name} is allowed on its exact path`, () => { expect(isAllowedRequest(url, true).ok, url).toBe(true) })
  }
  const NEAR_MISSES = [
    'https://nominatim.openstreetmap.org.evil.com/search', 'https://sub.nominatim.openstreetmap.org/search', 'https://www.overpass-api.de/api/interpreter', 'https://xmaps.mail.ru/osm/tools/overpass/api/interpreter',
    'http://nominatim.openstreetmap.org/search', 'http://overpass-api.de/api/interpreter', 'https://nominatim.openstreetmap.org:8443/search', 'https://overpass-api.de:444/api/interpreter',
    'https://user:pw@nominatim.openstreetmap.org/search', 'https://nominatim.openstreetmap.org/reverse', 'https://nominatim.openstreetmap.org/', 'https://overpass-api.de/other', 'https://overpass-api.de/api/interpreter/x',
    'https://maps.mail.ru/', 'https://maps.mail.ru/osm/tools/overpass/api/status', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de@evil.example/api/interpreter', 'https://evil.example/x', 'https://openstreetmap.org/search', 'not a url',
  ]
  for (const url of NEAR_MISSES) it(`extension: ${JSON.stringify(url)} is still blocked`, () => { expect(isAllowedRequest(url, true).ok).toBe(false) })
  it('the paid hosts behave as before in both settings', () => {
    for (const osm of [false, true]) {
      expect(isAllowedRequest('https://api.openai.com/v1/chat/completions', osm).ok).toBe(true)
      expect(isAllowedRequest('https://google.serper.dev/maps', osm).ok).toBe(true)
      expect(isAllowedRequest('https://api.openai.com/v1/images/generations', osm).ok).toBe(false)
    }
  })
})

describe('option B · through the real wrapper: BENCH_TRIAL_MODE=dev-multi lets the three hosts through, any other mode blocks them', () => {
  it('dev-multi: every one of the three hosts is sent, none is listed as blocked, the count per host is 1', async () => {
    const r = await run(EXT_ENV, Object.values(OSM))
    for (const url of Object.values(OSM)) expect(r.outcomes[url], url).toBe('sent')
    expect(r.net).toEqual([...OSM_HOSTS])
    expect(r.summary.hostsBlocked).toEqual([])
    expect(r.summary.osmRequests).toEqual({ 'nominatim.openstreetmap.org': 1, 'overpass-api.de': 1, 'maps.mail.ru': 1 })
    expect(r.summary.hostRequests).toEqual({ 'nominatim.openstreetmap.org': 1, 'overpass-api.de': 1, 'maps.mail.ru': 1 })
    expect(r.summary.warnings.join(' | ')).not.toMatch(/blocked|nominatim|overpass|mail\.ru/i)
  })
  it('dev-multi: near-misses are blocked, listed, and make the run NOT CLEAN; nothing of them reaches the network', async () => {
    const bad = ['https://nominatim.openstreetmap.org.evil.com/search', 'https://sub.overpass-api.de/api/interpreter', 'http://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://nominatim.openstreetmap.org:8443/search', 'https://overpass-api.de/other', 'https://evil.example/x']
    const r = await run(EXT_ENV, bad)
    for (const url of bad) expect(r.outcomes[url], url).toBe('blocked')
    expect(r.net).toEqual([])
    expect(r.summary.hostsBlocked.length).toBeGreaterThanOrEqual(5)
    expect(r.summary.trialClean).toBe(false)
    expect(r.summary.osmRequests).toEqual({ 'nominatim.openstreetmap.org': 0, 'overpass-api.de': 0, 'maps.mail.ru': 0 })
  })
  it('dev-multi: an unknown host next to the OSM ones is still blocked and listed (the OSM ones are not)', async () => {
    const r = await run(EXT_ENV, [OSM.nominatim, 'https://evil.example/x'])
    expect(r.outcomes[OSM.nominatim]).toBe('sent'); expect(r.outcomes['https://evil.example/x']).toBe('blocked')
    expect(r.summary.hostsBlocked).toEqual(['evil.example'])
    expect(r.summary.trialClean).toBe(false)
  })
  const MODES: Array<[string, Record<string, string | undefined>]> = [
    ['acceptance (a missing mode)', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: undefined }],
    ['acceptance (written out)', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'acceptance' }],
    ['an unknown mode', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'weird' }],
    ['different letters (DEV-MULTI)', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'DEV-MULTI' }],
    ['a trailing space ("dev-multi ")', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: 'dev-multi ' }],
    ['an empty mode', { ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: '' }],
  ]
  for (const [name, env] of MODES) {
    it(`${name}: all three hosts are blocked, listed, and none is sent`, async () => {
      const r = await run(env, Object.values(OSM))
      for (const url of Object.values(OSM)) expect(r.outcomes[url], url).toBe('blocked')
      expect(r.net).toEqual([])
      expect(r.summary.hostsBlocked).toEqual([...OSM_HOSTS].sort())
      expect(r.summary.trialClean).toBe(false)
      expect(r.summary.osmRequests).toEqual({ 'nominatim.openstreetmap.org': 0, 'overpass-api.de': 0, 'maps.mail.ru': 0 })
    })
  }
})

describe('option B · a redirect from an allowed host cannot leave the allow-list', () => {
  it('the wrapper forces redirect: manual: the evil host is never reached, the 302 is reported, the run is NOT CLEAN', async () => {
    const r = await run(EXT_ENV, [OSM.nominatim], makeNetwork('nominatim.openstreetmap.org'))
    expect(followed).toEqual([])
    expect(r.net).not.toContain('evil.example')
    expect(r.summary.redirects).toEqual([{ host: 'nominatim.openstreetmap.org', status: 302 }])
    expect(r.summary.trialClean).toBe(false)
  })
  it('a caller that asks for redirect: follow does not get it', async () => {
    for (const [k, v] of Object.entries(EXT_ENV)) vi.stubEnv(k, v)
    const post = async (): Promise<Response> => { await fetch(OSM.overpass, { redirect: 'follow' }); return new Response('', { status: 200 }) }
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
    let out
    try { out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: makeNetwork('overpass-api.de'), fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
    expect(out.kind).toBe('ran')
    expect(followed).toEqual([])
    expect(reached).not.toContain('evil.example')
  })
})

describe('option B · the counts per host are reported without anything sensitive; the cap and the cost gate are untouched', () => {
  it('three requests to Nominatim with a place name and coordinates: the summary and the result file say 3, and neither holds the query, the URL or the coordinates', async () => {
    const urls = ['https://nominatim.openstreetmap.org/search?q=Cafe%20Rieng%20Tu%20Vietnam&format=json&limit=1&lat=10.7380&lon=106.7210', OSM.nominatim, 'https://nominatim.openstreetmap.org/search?q=khu%20x']
    const r = await run(EXT_ENV, urls)
    expect(r.summary.osmRequests['nominatim.openstreetmap.org']).toBe(3)
    const text = formatSummary(r.summary)
    expect(text).toMatch(/OSM fallback hosts \(free: no Serper credit, no OpenAI cost; outside the request cap and the USD gate; counted, not priced\)/)
    expect(text).toContain('nominatim.openstreetmap.org=3')
    for (const t of [text, r.resultJson, JSON.stringify(r.summary)]) {
      expect(t).not.toMatch(/Cafe|Rieng|Quan%207|q=|10\.7380|106\.7210|format=json|\/search\?/)
    }
    const file = JSON.parse(r.resultJson)
    expect(file.osmRequests).toEqual({ 'nominatim.openstreetmap.org': 3, 'overpass-api.de': 0, 'maps.mail.ru': 0 })
  })
  it('the result file carries the three counts as zeros when nothing was asked (the field is always present)', async () => {
    const r = await run(EXT_ENV, [])
    expect(JSON.parse(r.resultJson).osmRequests).toEqual({ 'nominatim.openstreetmap.org': 0, 'overpass-api.de': 0, 'maps.mail.ru': 0 })
    expect(r.summary.osmRequests).toEqual({ 'nominatim.openstreetmap.org': 0, 'overpass-api.de': 0, 'maps.mail.ru': 0 })
  })
  it('OSM requests are not booked anywhere: the cap saw nothing, the ledger booked no Serper or OpenAI request, and no count-differs warning appears', async () => {
    const r = await run(EXT_ENV, Object.values(OSM))
    expect(r.summary.requestCap).toEqual({ perTurnLimit: 15, runLimit: 450, sent: 0, refused: 0 })
    expect(r.summary.serperRequests).toBe(0); expect(r.summary.llmRequests).toBe(0)
    expect(r.summary.warnings.join(' | ')).not.toMatch(/count differs/)
    expect(r.summary.budget).toEqual({ mode: 'extension', turnCapUsd: 0.05, runCapUsd: 1.75 })
  })
})

describe('option B · what the Owner is shown says which hosts the run may reach', () => {
  const allow = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name === 'allow-list the run may reach')!.detail
  }
  it('the preflight list names the three OSM hosts in the extension mode only', () => {
    expect(allow(EXT_ENV)).toMatch(/EXTENSION MODE ONLY, free OSM fallback.*nominatim\.openstreetmap\.org, overpass-api\.de, maps\.mail\.ru/)
    expect(allow({ ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: undefined })).not.toMatch(/nominatim|overpass|mail\.ru|EXTENSION/)
  })
  it('Gate 1 says it in Vietnamese: three free hosts counted per host in the extension mode, blocked in the acceptance mode', () => {
    const ext = gate1Summary({ ...EXT_ENV }, null).join('\n')
    expect(ext).toMatch(/THÊM đúng 3 host OSM miễn phí.*nominatim\.openstreetmap\.org, overpass-api\.de, maps\.mail\.ru.*không tính tiền.*ngoài trần request và cổng USD/)
    const acc = gate1Summary({ ...ACCEPTANCE_ENV, BENCH_TRIAL_MODE: undefined }, null).join('\n')
    expect(acc).toContain('ba host OSM của search_places bị CHẶN (chế độ nghiệm thu)')
    for (const t of [ext, acc]) expect(t).not.toContain('sk-test-not-a-real-key')
  })
})

describe('option B · the key must have the OpenAI shape before the first paid call', () => {
  const GOOD_QUESTIONS = Array.from({ length: 30 }, (_, i) => `Câu hỏi kiểm thử số ${i + 1} về một chủ đề riêng ${'x'.repeat(i)}`).join('\n')
  const lineOf = (c: ReturnType<typeof conditionReport>, name: string) => c.find(x => x.name.startsWith(name))!
  const report = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: GOOD_QUESTIONS })
  }
  const WRONG = 'WRONGKEY-9a8b7c6d5e4f'
  it('a key that starts with sk- passes (the line stays "present", no other line changes)', () => {
    const c = report(EXT_ENV)
    expect(lineOf(c, 'OPENAI_API_KEY present').ok).toBe(true)
  })
  it('a key that does not start with sk- is KHÔNG ĐẠT with the clear message, even when every other condition passes', () => {
    const c = report({ ...EXT_ENV, OPENAI_API_KEY: WRONG })
    const key = lineOf(c, 'OPENAI_API_KEY present')
    expect(key.ok).toBe(false)
    expect(key.detail).toBe('OPENAI_API_KEY không đúng dạng key OpenAI (phải bắt đầu bằng sk-): kiểm tra có dán nhầm key khác hoặc đảo thứ tự hai ô không')
    // the message is on that line only: the "every other check" line does not repeat it
    expect(lineOf(c, 'every other check').ok).toBe(true)
    // the ONLY difference from the same report with a good key is the key's own line (the question text of this test is not a real extension file, so one unrelated line may fail in both)
    const failing = (cs: ReturnType<typeof conditionReport>) => cs.filter(x => !x.ok).map(x => x.name)
    const baseline = failing(report({ ...EXT_ENV, OPENAI_API_KEY: 'sk-test-not-a-real-key' }))
    expect(failing(c)).toEqual([...baseline, key.name])
    expect(formatConditionReport(c)).toMatch(new RegExp(`TỔNG: ${baseline.length + 1} điều kiện KHÔNG ĐẠT — không chạy`))
  })
  it('no character of the key is printed anywhere in the report', () => {
    const text = formatConditionReport(report({ ...EXT_ENV, OPENAI_API_KEY: WRONG }))
    for (const piece of [WRONG, 'WRONGKEY', '9a8b', 'e4f']) expect(text).not.toContain(piece)
  })
  it('the two keys swapped (the Serper value in the OpenAI box) is caught; a value with a leading space is caught', () => {
    expect(lineOf(report({ ...EXT_ENV, OPENAI_API_KEY: 'serper-test-not-a-real-key', SERPER_API_KEY: 'sk-test-not-a-real-key' }), 'OPENAI_API_KEY present').ok).toBe(false)
    expect(lineOf(report({ ...EXT_ENV, OPENAI_API_KEY: ' sk-test-not-a-real-key' }), 'OPENAI_API_KEY present').ok).toBe(false)
  })
  it('an UNSET key keeps its old message and is not reported twice (the shape rule speaks only about a value that is there)', () => {
    const c = report({ ...EXT_ENV, OPENAI_API_KEY: undefined, SERPER_API_KEY: undefined })
    expect(lineOf(c, 'OPENAI_API_KEY present').detail).toBe('OPENAI_API_KEY is UNSET')
    const baseline = report({ ...EXT_ENV }).filter(x => !x.ok).map(x => x.name)
    expect(c.filter(x => !x.ok).map(x => x.name)).toEqual([...baseline, 'OPENAI_API_KEY present (value never shown)', 'SERPER_API_KEY present (value never shown)'])
  })
  it('the Serper key is NOT checked for a shape (its format is not verified): any non-blank value without whitespace passes', () => {
    expect(lineOf(report({ ...EXT_ENV, SERPER_API_KEY: 'whatever123' }), 'SERPER_API_KEY present').ok).toBe(true)
  })
  it('the real run refuses too: nothing is sent, the reason names the variable and holds no character of the key', async () => {
    for (const [k, v] of Object.entries({ ...EXT_ENV, OPENAI_API_KEY: WRONG })) vi.stubEnv(k, v)
    const post = vi.fn(async () => new Response('', { status: 200 }))
    const out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: makeNetwork(), fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never)
    expect(out.kind).toBe('refused')
    if (out.kind === 'refused') {
      expect(out.reasons.join(' | ')).toContain('OPENAI_API_KEY không đúng dạng key OpenAI (phải bắt đầu bằng sk-)')
      for (const piece of [WRONG, 'WRONGKEY', '9a8b']) expect(out.reasons.join(' | ')).not.toContain(piece)
    }
    expect(post).not.toHaveBeenCalled(); expect(reached).toEqual([])
  })
})
