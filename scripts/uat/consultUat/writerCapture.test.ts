// @vitest-environment node
// Wave 6 · BENCH_CAPTURE_WRITER_INPUT (bench only, default OFF). (1) the pure parts; (2) through the REAL runLiveTrial with the REAL chat route and AI layer, only the network fake: the capture file
// holds exactly the bodies the network received, in order and tagged by turn, in its own capture-<n>.json - never in the bench json, never a header, never the key; OFF / any other value / the
// acceptance mode / a production runtime write nothing and change nothing; (3) the name is registered like the Wave 5 flags (names only) and the refusal of other names is as strong as before.
// The prompts here are written for this test; nothing comes from the acceptance set or the extension set. MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { WAVE2_FLAGS, runLiveTrial, wave2FlagState } from './liveTrial'
import { conditionReport } from './preflightReport'
import { FLAG_ENV_NAMES, WAVE2_FLAG_NAMES, buildChildEnv, gate1Summary, launcherRefusals } from './liveTrialLauncher.mjs'
import type { UatTurn } from './questions'
import { pickWriterCalls } from './writerReplay'
import { WRITER_CAPTURE_FLAG, WRITER_CAPTURE_MAX_CALLS, createWriterCapture, isChatCompletionsUrl, summarizeCompletion, writerCaptureOn, type WriterCaptureFile } from './writerCapture'

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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0c06' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const ANSWER = 'Câu trả lời kiểm thử: đây là phần viết của mô hình.'
const textStream = (inc: boolean) => sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: ANSWER }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, ...(inc ? [{ choices: [], usage: usage(1500, 80) }] : [])])

/** Every model request body the fake network received, in order. */
const net = { bodies: [] as unknown[] }
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    net.bodies.push(body)
    if (body.response_format) return jsonCompletion(INTENT, usage(1000, 100))
    if (body.stream !== true) return jsonCompletion('{}', usage(300, 10))
    return textStream(body.stream_options?.include_usage === true)
  }
  if (u.hostname === 'google.serper.dev') return new Response(JSON.stringify({ organic: [], credits: 1 }), { status: 200 })
  throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
const KEY = 'sk-test-not-a-real-key-wave6'
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450', BENCH_RESET_FREE_QUOTA_PER_TURN: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave3/mock-out',
  OPENAI_API_KEY: KEY, SERPER_API_KEY: 'serper-test-not-a-real-key',
  CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
}
const CHILD = { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true }
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  net.bodies = []
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_RESET_FREE_QUOTA_PER_TURN', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

const TURNS: UatTurn[] = [
  { id: 'W1', conversation: 'W1', turn: 1, text: 'Giai thich giup minh cach mot quy dinh hanh chinh duoc ban hanh.' },
  { id: 'W2', conversation: 'W2', turn: 1, text: 'Mot van ban phap luat co hieu luc tu khi nao?' },
]
async function run(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: process.cwd(), now: () => 4_242, turns: TURNS, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const files = [...fs.files.entries()]
  const bench = files.find(([p]) => /bench-\d+\.json$/.test(p))
  const cap = files.find(([p]) => /capture-\d+\.json$/.test(p))
  return { summary: out.summary, files, benchText: bench?.[1] ?? '', capPath: cap?.[0] ?? null, capture: cap ? JSON.parse(cap[1]) as WriterCaptureFile : null, capText: cap?.[1] ?? '' }
}

describe('W6 capture · pure parts', () => {
  it('the flag: only "1", only in the extension mode, never in a production runtime', () => {
    expect(WRITER_CAPTURE_FLAG).toBe('BENCH_CAPTURE_WRITER_INPUT')
    expect(writerCaptureOn({ BENCH_CAPTURE_WRITER_INPUT: '1', BENCH_TRIAL_MODE: 'dev-multi' })).toBe(true)
    for (const v of [undefined, '', '0', 'true', ' 1', '1 ', 'on']) expect(writerCaptureOn({ BENCH_CAPTURE_WRITER_INPUT: v, BENCH_TRIAL_MODE: 'dev-multi' }), String(v)).toBe(false)
    expect(writerCaptureOn({ BENCH_CAPTURE_WRITER_INPUT: '1' })).toBe(false)
    expect(writerCaptureOn({ BENCH_CAPTURE_WRITER_INPUT: '1', BENCH_TRIAL_MODE: 'single' })).toBe(false)
    expect(writerCaptureOn({ BENCH_CAPTURE_WRITER_INPUT: '1', BENCH_TRIAL_MODE: 'dev-multi', VERCEL_ENV: 'production' })).toBe(false)
    expect(writerCaptureOn({ BENCH_CAPTURE_WRITER_INPUT: '1', BENCH_TRIAL_MODE: 'dev-multi', NODE_ENV: 'production' })).toBe(false)
  })
  it('only https://api.openai.com/v1/chat/completions is a model request to keep', () => {
    expect(isChatCompletionsUrl('https://api.openai.com/v1/chat/completions')).toBe(true)
    for (const u of ['http://api.openai.com/v1/chat/completions', 'https://api.openai.com/v1/responses', 'https://google.serper.dev/search', 'https://api.openai.com.evil.example/v1/chat/completions', 'not a url']) expect(isChatCompletionsUrl(u), u).toBe(false)
  })
  it('a response summary: streamed text and tool calls, one JSON message, an error body', () => {
    const s = summarizeCompletion('data: {"choices":[{"delta":{"content":"ab"}}]}\n\ndata: {"choices":[{"delta":{"content":"cde"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n\n', 200)
    expect(s).toEqual({ status: 200, textChars: 5, toolCalls: 0, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 2 } })
    const t = summarizeCompletion('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"web_search","arguments":""}}]}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n', 200)
    expect(t).toMatchObject({ textChars: 0, toolCalls: 1, finishReason: 'tool_calls' })
    expect(summarizeCompletion(JSON.stringify({ choices: [{ message: { content: 'xyz' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } }), 200)).toEqual({ status: 200, textChars: 3, toolCalls: 0, finishReason: 'stop', usage: { prompt_tokens: 3, completion_tokens: 1 } })
    expect(summarizeCompletion('<html>bad gateway</html>', 502)).toEqual({ status: 502, textChars: 0, toolCalls: 0, finishReason: null, usage: null })
  })
  it('the capture: order within each turn, secrets redacted, an unreadable body is marked, a failed response keeps its status, the cap truncates', async () => {
    const c = createWriterCapture({ stamp: 7, redact: s => s.replaceAll('SECRET', '***') })
    c.record('A', JSON.stringify({ messages: [{ role: 'user', content: 'x SECRET' }] }), jsonCompletion('ok', usage(1, 1)))
    c.record('A', '{not json', jsonCompletion('ok', usage(1, 1)))
    c.record('B', null, new Response('no', { status: 500 }))
    const f = await c.finish()
    expect(f.calls.map(x => [x.turn, x.n])).toEqual([['A', 1], ['A', 2], ['B', 1]])
    expect(JSON.stringify(f.calls[0]!.body)).not.toContain('SECRET')
    expect(f.calls[1]!.bodyError).toBe('body_not_json'); expect(f.calls[2]!.bodyError).toBe('body_not_a_string')
    expect(f.calls[0]!.response).toMatchObject({ status: 200, textChars: 2 }); expect(f.calls[2]!.response).toMatchObject({ status: 500, textChars: 0 })
    expect(f).toMatchObject({ kind: 'tappy-writer-capture', version: 1, stamp: 7, truncated: false })
    const big = createWriterCapture({ stamp: 1, redact: s => s })
    for (let i = 0; i < WRITER_CAPTURE_MAX_CALLS + 2; i++) big.record('T', '{}', new Response('no', { status: 500 }))
    const bf = await big.finish()
    expect(bf.calls).toHaveLength(WRITER_CAPTURE_MAX_CALLS); expect(bf.truncated).toBe(true)
  })
})

describe('W6 capture · through the real trial (real route, fake network)', () => {
  it('ON: capture-<n>.json in the run folder holds exactly the bodies the network received, in order, tagged by turn, with each response summarised; the trial stays clean', async () => {
    const r = await run({ ...EXT, BENCH_CAPTURE_WRITER_INPUT: '1' })
    expect(r.capPath).toBe('D:/TappyAI-review-artifacts/consultative-wave3/mock-out/capture-4242.json')
    const cap = r.capture!
    expect(cap.calls.map(c => c.body)).toEqual(net.bodies)                              // byte for byte what was sent (no key was in any body)
    expect(net.bodies.length).toBeGreaterThanOrEqual(4)                                 // the control really sent requests: intent + answer, two turns
    expect([...new Set(cap.calls.map(c => c.turn))]).toEqual(['W1', 'W2'])
    for (const t of ['W1', 'W2']) expect(cap.calls.filter(c => c.turn === t).map(c => c.n)).toEqual(cap.calls.filter(c => c.turn === t).map((_, i) => i + 1))
    const writers = cap.calls.filter(c => (c.body as { stream?: boolean }).stream === true)
    expect(writers.length).toBe(2)
    for (const w of writers) expect(w.response).toMatchObject({ status: 200, textChars: ANSWER.length, toolCalls: 0, finishReason: 'stop' })
    expect(r.summary.warnings).toEqual([]); expect(r.summary.trialClean).toBe(true)
    // end to end with the replay core: the registered rule picks, in each turn, exactly the call that wrote the answer
    expect(pickWriterCalls(cap).map(p => [p.turn, p.n])).toEqual(writers.map(w => [w.turn, w.n]))
  }, 120_000)
  it('the capture is in its OWN file: the bench json carries none of it, the key is nowhere, no header is kept', async () => {
    const r = await run({ ...EXT, BENCH_CAPTURE_WRITER_INPUT: '1' })
    const sys = (net.bodies.find(b => (b as { stream?: boolean }).stream === true) as { messages: Array<{ role: string; content: unknown }> }).messages.find(m => m.role === 'system')!
    const sysText = typeof sys.content === 'string' ? sys.content : JSON.stringify(sys.content)
    expect(sysText.length).toBeGreaterThan(200)
    expect(r.capText).toContain(JSON.stringify(sysText).slice(1, 120))                  // the writer's system prompt IS in the capture
    expect(r.benchText).not.toContain(JSON.stringify(sysText).slice(1, 120))            // ... and NOT in the bench json
    expect(r.benchText).not.toContain('tappy-writer-capture')
    for (const t of [r.capText, r.benchText]) { expect(t).not.toContain(KEY); expect(t.toLowerCase()).not.toContain('authorization') }
  }, 120_000)
  it('OFF (unset, "0"): no capture file, the same files as without the flag; any other value ("true") is refused by the preflight and nothing runs; the acceptance mode and a production runtime never capture', async () => {
    const base = await run({ ...EXT })
    expect(base.capPath).toBeNull()
    __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); net.bodies = []
    const zero = await run({ ...EXT, BENCH_CAPTURE_WRITER_INPUT: '0' })
    expect(zero.capPath).toBeNull()
    expect(zero.files.map(([p]) => p).sort()).toEqual(base.files.map(([p]) => p).sort())
    __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); net.bodies = []
    await expect(run({ ...EXT, BENCH_CAPTURE_WRITER_INPUT: 'true' })).rejects.toThrow('BENCH_CAPTURE_WRITER_INPUT must be exactly 1, 0 or unset')
    expect(net.bodies).toEqual([])                                                      // refused before anything was sent
    // the pure rule decides the other two (the trial itself refuses a production runtime and needs the extension mode for several turns)
    expect(writerCaptureOn({ ...EXT, BENCH_CAPTURE_WRITER_INPUT: '1', BENCH_TRIAL_MODE: 'single' })).toBe(false)
    expect(writerCaptureOn({ ...EXT, BENCH_CAPTURE_WRITER_INPUT: '1', VERCEL_ENV: 'production' })).toBe(false)
  }, 180_000)
})

describe('W6 capture · registered like the Wave 5 flags (names only)', () => {
  it('in the trial list, the launcher list, the declared benchmark flags and the allow-list; the lists still agree', () => {
    for (const list of [WAVE2_FLAGS, WAVE2_FLAG_NAMES, BENCH_FLAG_NAMES, FLAG_ENV_NAMES]) expect(list).toContain('BENCH_CAPTURE_WRITER_INPUT')
    expect([...WAVE2_FLAG_NAMES]).toEqual([...WAVE2_FLAGS])
    expect([...FLAG_ENV_NAMES].sort()).toEqual([...BENCH_FLAG_NAMES].sort())
  })
  it('"1" reaches the child and is not refused; unset stays unset; a look-alike or unknown name is still refused and never reaches the child', () => {
    const base = { ...EXT, OPENAI_API_KEY: 'sk-x', SERPER_API_KEY: 'y' }
    expect(buildChildEnv({ ...base, BENCH_CAPTURE_WRITER_INPUT: '1' }, CHILD).BENCH_CAPTURE_WRITER_INPUT).toBe('1')
    expect('BENCH_CAPTURE_WRITER_INPUT' in buildChildEnv(base, CHILD)).toBe(false)
    expect(launcherRefusals({ ...base, BENCH_CAPTURE_WRITER_INPUT: '1' })).toEqual([])
    for (const k of ['BENCH_CAPTURE_WRITER_INPUTS', 'BENCH_CAPTURE_WRITER', 'BENCH_CAPTURE_ALL', 'CONSULT_CAPTURE_WRITER_INPUT']) {
      const env = { ...base, BENCH_CAPTURE_WRITER_INPUT: '1', [k]: '1' }
      expect(launcherRefusals(env).join(' | '), k).toContain(`${k} is set but is not one of the variables the trial passes on`)
      expect(k in buildChildEnv(env, CHILD), k).toBe(false)
    }
  })
  it('Gate 1 and the preflight state it; a value other than 0 / 1 fails the preflight by name', () => {
    const env = { ...EXT, BENCH_CAPTURE_WRITER_INPUT: '1', CONSULT_CAPABILITY_LEVEL: '2' }
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    expect(gate1Summary(env, null).join('\n')).toContain('BENCH_CAPTURE_WRITER_INPUT=1 (BẬT)')
    expect(wave2FlagState(env).BENCH_CAPTURE_WRITER_INPUT).toBe('ON')
    const line = conditionReport({ env: process.env, repoRoot: process.cwd(), questionText: null }).find(x => x.name.startsWith('wave-2 behaviour flags'))!
    expect(line.ok).toBe(true); expect(line.detail).toContain('BENCH_CAPTURE_WRITER_INPUT=1 (ON)')
    vi.stubEnv('BENCH_CAPTURE_WRITER_INPUT', 'yes')
    const bad = conditionReport({ env: process.env, repoRoot: process.cwd(), questionText: null }).find(x => x.name.startsWith('wave-2 behaviour flags'))!
    expect(bad.ok).toBe(false); expect(bad.detail).toContain('BENCH_CAPTURE_WRITER_INPUT must be exactly 1, 0 or unset')
  })
})
