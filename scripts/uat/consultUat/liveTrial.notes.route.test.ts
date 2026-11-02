// @vitest-environment node
// Wave 2B · the judge's note never reaches the model. REAL chat route + REAL runLiveTrial + REAL parseDevQuestions; only the network is fake (a scripted model). MOCK ONLY: no key, no real host.
// Every request body that leaves the process (OpenAI, Serper) is captured and searched for the note's unique marker. The sentences are written for this test.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { formatSummary, runLiveTrial } from './liveTrial'
import { parseDevQuestions, sha256OfText } from './devQuestions'

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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0c03' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const textStream = (text: string, inc: boolean) => sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, ...(inc ? [{ choices: [], usage: usage(500, 50) }] : [])])

/** Every request body that left the process, as text. */
const sent: string[] = []
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  sent.push(String(init?.body ?? ''))
  if (u.hostname === 'api.openai.com') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const inc = body.stream_options?.include_usage === true
    if (body.response_format) return jsonCompletion(INTENT, usage(1000, 100))
    if (body.stream !== true) return jsonCompletion('{}', usage(300, 10))
    return textStream('Đây là câu trả lời kiểm thử, ngắn gọn.', inc)
  }
  if (u.hostname === 'google.serper.dev') return new Response(JSON.stringify({ organic: [{ title: 'Ket qua kiem thu', link: 'https://example.com/1', snippet: 'Doan trich kiem thu.' }], places: [], credits: 1 }), { status: 200 })
  throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
const BASE: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450', BENCH_RESET_FREE_QUOTA_PER_TURN: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2b/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
}
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); sent.length = 0
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_RESET_FREE_QUOTA_PER_TURN', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

const MARKER = 'GHICHU-NOIBO-QZX-731'
const USER_WORDS = 'Giải thích giúp mình vì sao biển có màu xanh'
const V2_FILE = ['@format|2', `Q1|Q1|1|${USER_WORDS}`, `@note|Q1|1|(${MARKER}: chỉ dành cho người chấm, không phải lời người dùng)`].join('\r\n')
const V1_FILE = `Q1|Q1|1|${USER_WORDS}   (${MARKER}: chỉ dành cho người chấm, không phải lời người dùng)`

async function run(fileText: string) {
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v)
  const parsed = parseDevQuestions(fileText)
  if (!parsed.ok) throw new Error('refused: ' + parsed.reasons.join('; '))
  const fs = memFs()
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))
  let out
  try {
    out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: process.cwd(), now: () => 1_000, turns: parsed.turns,
      questionInfo: { sha256: sha256OfText(fileText), formatVersion: parsed.formatVersion, notesWithheld: parsed.notes.map(n => n.id) }, afterTrial: 'restore' } as never)
  } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const files = [...fs.files.entries()].map(([p, c]) => `${p}\n${c}`).join('\n')
  return { summary: out.summary, text: formatSummary(out.summary), files, logs: logs.join('\n'), bodies: sent.join('\n') }
}

describe('the judge note never reaches the model (route + runLiveTrial, mock network)', () => {
  it('v2 file: the model request carries the user words and NOT the note; no request body, log, summary or result file holds the note text', async () => {
    const r = await run(V2_FILE)
    expect(r.bodies).toContain(USER_WORDS)
    expect(r.bodies).not.toContain(MARKER)
    expect(r.logs).not.toContain(MARKER)
    expect(r.text).not.toContain(MARKER)
    expect(r.files).not.toContain(MARKER)
    expect(r.summary.problems).toEqual([])
  })
  it('v2 file: the summary and the result file name the file (SHA-256), the format and the withheld note by id', async () => {
    const r = await run(V2_FILE)
    expect(r.text).toContain(`question file: sha256=${sha256OfText(V2_FILE)} | format v2 | notes withheld from the model: 1 (Q1)`)
    expect(r.files).toContain('"questionFile"')
    expect(r.files).toContain(sha256OfText(V2_FILE))
    expect(r.files).toContain('"notesWithheld"')
  })
  it('v1 file (the old way, note glued to the line): the note DID reach the model - the defect the v2 format removes', async () => {
    const r = await run(V1_FILE)
    expect(r.bodies).toContain(MARKER)
    expect(r.text).toContain('format v1 | notes withheld from the model: 0')
  })
  it('a run that did not report the question file says so (nothing is invented)', async () => {
    for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v)
    const parsed = parseDevQuestions('Q1|Q1|1|' + USER_WORDS)
    if (!parsed.ok) throw new Error('refused')
    const out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: process.cwd(), now: () => 1_000, turns: parsed.turns, afterTrial: 'restore' } as never)
    if (out.kind !== 'ran') throw new Error('refused')
    expect(formatSummary(out.summary)).toContain('question file: not reported by the caller')
  })
})
