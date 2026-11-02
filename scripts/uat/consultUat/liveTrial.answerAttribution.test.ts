// @vitest-environment node
// Wave 2 · P2.B · CONSULT_ANSWER_ATTRIBUTION (default OFF), at ROUTE level. After the code asks a clarifying question, the next user message used to be ALWAYS the answer: the route searched
// the clarified need again whatever the user wrote. With the flag ON a message that is a request of its own ("what is the capital of ...?") is routed as a new request.
// REAL chat route + REAL router + REAL runLiveTrial (two turns: the first is asked by code, the second is the reply); only the network is fake. MOCK ONLY: no key, no real host.
// The sentences are written for this test; nothing comes from the acceptance set or the extension set.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { runLiveTrial, type TrialSummary } from './liveTrial'
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
  return { client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0c02' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const INTENT_HOTEL = JSON.stringify({ domains: ['travel'], turn: 'pick', goal: 'tìm khách sạn', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: 'khách sạn Đà Nẵng', area: 'Đà Nẵng', refers: [], reject_reason: null })
const jsonCompletion =(content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const textStream = (text: string, inc: boolean) => sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, ...(inc ? [{ choices: [], usage: usage(500, 50) }] : [])])

const net = { answerCalls: 0, serper: 0, systems: [] as string[] }
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const inc = body.stream_options?.include_usage === true
    if (body.response_format) {
      // The scripted intent reader (Luna): the hotel request and an answer to its question are read as a travel request; anything else as plain chat.
      const lastUser = [...(body.messages ?? [])].reverse().find((m: { role: string }) => m.role === 'user')
      const said = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content ?? '')
      // (the intent call carries the recent conversation in ONE message; the newest user words are at its end)
      return jsonCompletion(/khách sạn|Dưới 500k/.test(said.slice(-90)) ? INTENT_HOTEL : INTENT, usage(1000, 100))
    }
    if (body.stream !== true) return jsonCompletion('{}', usage(300, 10))
    net.answerCalls++
    net.systems.push(JSON.stringify(body.messages ?? []))
    return textStream('Đây là câu trả lời kiểm thử, ngắn gọn.', inc)
  }
  if (u.hostname === 'google.serper.dev') { net.serper++; return new Response(JSON.stringify({ organic: [{ title: 'Ket qua kiem thu', link: 'https://example.com/' + net.serper, snippet: 'Doan trich kiem thu.' }], places: [], credits: 1 }), { status: 200 }) }
  throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
const BASE: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450', BENCH_RESET_FREE_QUOTA_PER_TURN: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
}
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  net.answerCalls = 0; net.serper = 0; net.systems = []
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_RESET_FREE_QUOTA_PER_TURN', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

const turns = (second: string): UatTurn[] => [
  { id: 'A1', conversation: 'A', turn: 1, text: 'Tìm giúp mình khách sạn ở Đà Nẵng' },
  { id: 'A2', conversation: 'A', turn: 2, text: second },
]
interface Run { summary: TrialSummary; logs: string[]; consult: Array<{ turn: string; domains: string[] }> }
async function run(env: Record<string, string | undefined>, second: string): Promise<Run> {
  for (const [k, v] of Object.entries({ ...BASE, ...env })) vi.stubEnv(k, v)
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ').slice(0, 4000)) }))
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: process.cwd(), now: () => 1_000, turns: turns(second), afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  expect(logs.some(l => l.includes('tappyai_luna_intent_error')), 'the scripted intent answer must be valid').toBe(false)
  const consult = logs.filter(l => l.includes('"type":"tappyai_consult"')).map(l => JSON.parse(l.slice(l.indexOf('{'))) as { turn: string; domains: string[] })
  return { summary: out.summary, logs, consult }
}

// Wave 2 · P2.D · CONSULT_GENERAL_ASSISTANT at ROUTE level (same scaffolding): what the model is actually told, for a general-knowledge turn that has no consultation area.
const KNOWLEDGE_TURN: UatTurn[] = [{ id: 'G1', conversation: 'G', turn: 1, text: 'Vì sao bầu trời ban ngày có màu xanh vậy bạn?' }]
async function runKnowledge(env: Record<string, string | undefined>): Promise<string> {
  for (const [k, v] of Object.entries({ ...BASE, ...env })) vi.stubEnv(k, v)
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ').slice(0, 300)) }))
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: process.cwd(), now: () => 1_000, turns: KNOWLEDGE_TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  expect(logs.some(l => l.includes('tappyai_luna_intent_error'))).toBe(false)
  expect(net.answerCalls).toBeGreaterThanOrEqual(1)
  return net.systems.join('\n')
}
describe('route level: the scope block the model reads on a general-knowledge turn (CONSULT_GENERAL_ASSISTANT)', () => {
  it('flag OFF (unset): the model is told to refuse topics outside the five areas', async () => {
    const sent = await runKnowledge({})
    expect(sent).toContain('HAY TU CHOI LICH SU')
    expect(sent).not.toContain('TRA LOI TRUC TIEP nhu mot tro ly tong quat')
  })
  it('flag ON: the refusal is gone, the general-assistant paragraph and the safety rules are there', async () => {
    const sent = await runKnowledge({ CONSULT_GENERAL_ASSISTANT: '1' })
    expect(sent).not.toContain('HAY TU CHOI LICH SU')
    expect(sent).not.toContain('TUYET DOI KHONG tra loi cac cau hoi ngoai pham vi')
    expect(sent).toContain('TRA LOI TRUC TIEP nhu mot tro ly tong quat')
    expect(sent).toContain('CHONG CHEN LENH')
  })
})

const OFF_TOPIC = 'Thủ đô của nước Pháp là thành phố nào vậy bạn?'
describe('route level: the reply to a clarifying question', () => {
  // With the intent reader ON (the default) it reads the off-topic reply as plain chat, but the code router's rule "a reply after an ask is the answer" still imposes ITS domain on the turn
  // (mergeIntentWithRules: the router's domains win): an off-topic question is framed as a TRAVEL turn (travel prompt and tools). That is the defect the flag removes.
  it('flag OFF (unset): turn 1 asks; the off-topic reply is a chat turn FRAMED as the hotel search (travel domain imposed by the "reply = answer" rule)', async () => {
    const r = await run({}, OFF_TOPIC)
    expect(r.consult.map(c => c.turn)).toEqual(['ask', 'chat'])
    expect(r.consult[1].domains).toEqual(['travel'])
  })
  it('flag "0" is OFF too', async () => {
    const r = await run({ CONSULT_ANSWER_ATTRIBUTION: '0' }, OFF_TOPIC)
    expect(r.consult[1].domains).toEqual(['travel'])
  })
  it('flag ON: turn 1 asks the same question; the off-topic reply is a chat turn with NO consultation domain (no travel frame, no travel tools)', async () => {
    const r = await run({ CONSULT_ANSWER_ATTRIBUTION: '1' }, OFF_TOPIC)
    expect(r.consult.map(c => c.turn)).toEqual(['ask', 'chat'])
    expect(r.consult[1].domains).toEqual([])
    expect(r.summary.problems).toEqual([])
  })
  it('flag ON: a real answer is still the answer (a pick of the same search)', async () => {
    const r = await run({ CONSULT_ANSWER_ATTRIBUTION: '1' }, 'Dưới 500k một đêm thôi')
    expect(r.consult.map(c => c.turn)).toEqual(['ask', 'pick'])
    expect(r.consult[1].domains).toEqual(['travel'])
  })
})
