// @vitest-environment node
// Wave 2B · CONSULT_ANSWER_ATTRIBUTION · the WIRING in route.ts. Wave 2 left a hole: putting the route back on `wasAskReply` at any connection point made no test fail. Each test below
// pins ONE connection point (see the table in consultative-wave2b/report.md): reverting that point alone makes at least one of them fail.
//   P1  route.ts routingAnswersAsk  -> P3 Luna intent `previousWasAsk`            (scenario 1)
//   P1  route.ts routingAnswersAsk  -> P4 brain `previousWasAsk`                  (scenario 2)
//   P2  route.ts answersAsk         -> P5 `consultContinues` (thread kept or not) (scenario 3, seen through the gates it feeds: `ownDomainSwitch`)
//   P2  route.ts answersAsk         -> P6 `travelPreCall` thread join             (an EQUIVALENT point: see the report; scenario 4 pins that it is harmless)
// REAL chat route + REAL router + REAL runLiveTrial (two turns: the first is asked by code, the second is the reply); only the network is fake (a scripted Luna and brain).
// MOCK ONLY: no key, no real host. The sentences are written for this test; none comes from the acceptance set or the extension set.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { runLiveTrial } from './liveTrial'
import type { UatTurn } from './questions'
import { BRAIN_SYSTEM } from '@/lib/ai/consultative/consultBrain'

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
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()), getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }) }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0c04' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const intentObj = (o: Record<string, unknown>) => JSON.stringify({ domains: [], turn: 'chat', goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...o })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const textStream = (text: string, inc: boolean) => sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, ...(inc ? [{ choices: [], usage: usage(500, 50) }] : [])])

/** The scripted readers. `intent` gets the whole intent request (the conversation is inside it); `brain` gets the same for the brain call. */
const script: { intent: (all: string) => string; brain: (all: string) => string | null } = { intent: () => intentObj({}), brain: () => null }
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const inc = body.stream_options?.include_usage === true
    const all = JSON.stringify(body.messages ?? [])
    if (body.response_format) return jsonCompletion(script.intent(all), usage(1000, 100))
    if (body.stream !== true) {
      if (all.includes(BRAIN_SYSTEM.slice(0, 40))) { const b = script.brain(all); if (b) return jsonCompletion(b, usage(300, 20)) }
      return jsonCompletion('{}', usage(300, 10))
    }
    return textStream('Câu trả lời kiểm thử.', inc)
  }
  if (u.hostname === 'google.serper.dev') return new Response(JSON.stringify({ organic: [{ title: 'kt', link: 'https://example.com/1', snippet: 'kt' }], places: [], credits: 1 }), { status: 200 })
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
const ENV_NAMES = [...BENCH_FLAG_NAMES, 'BENCH_RESET_FREE_QUOTA_PER_TURN', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'CONSULT_LUNA']
const reset = () => { __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); for (const k of ENV_NAMES) vi.stubEnv(k, undefined) }
beforeEach(reset)
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

interface Seen { consult: string[]; gates: string[]; guards: string[]; problems: string[] }
async function run(env: Record<string, string>, first: string, second: string): Promise<Seen> {
  reset()
  for (const [k, v] of Object.entries({ ...BASE, ...env })) vi.stubEnv(k, v)
  const turns: UatTurn[] = [{ id: 'A1', conversation: 'A', turn: 1, text: first }, { id: 'A2', conversation: 'A', turn: 2, text: second }]
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ').slice(0, 1500)) }))
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: process.cwd(), now: () => 1_000, turns, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused ' + JSON.stringify(out.reasons))
  expect(logs.some(l => l.includes('tappyai_luna_intent_error')), 'the scripted intent answer must be valid').toBe(false)
  const j = (l: string) => JSON.parse(l.slice(l.indexOf('{')))
  return {
    consult: logs.filter(l => l.includes('"type":"tappyai_consult"')).map(l => { const x = j(l); return `${x.by}:${x.turn}:${x.domains.join('+')}` }),
    gates: logs.filter(l => l.includes('"type":"tappyai_intent_gate"') || l.includes('"type":"tappyai_clarify_gate"')).map(l => { const x = j(l); return x.type === 'tappyai_intent_gate' ? `intent:${x.turnIntent}/asked=${x.assistantAskedClarification}` : `clarify:${x.actionable}/${x.scope}` }),
    guards: logs.filter(l => l.includes('"guard":"consult_ask_catalogue"')).map(() => 'consult_ask_catalogue'),
    problems: out.summary.problems,
  }
}

const HOTEL = 'Tìm giúp mình khách sạn ở Đà Nẵng'
const OFF_TOPIC = 'Thủ đô của nước Pháp là thành phố nào vậy bạn?'
const NEW_FOOD = 'Tìm giúp mình quán phở ngon ở quận 3 nhé được không?'
const CARD = { lead: 'Để chọn đúng:', questions: [{ id: 'q1', q: 'Bạn muốn gì?', options: ['một', 'hai'] }, { id: 'q2', q: 'Ở đâu?', options: ['ba', 'bốn'] }] }
/** Luna: the first turn (no Tappy message in the conversation yet) is the hotel request; the reply is read as `second`. */
const luna = (second: Record<string, unknown>) => (all: string) => !all.includes('TAPPY:') ? intentObj({ domains: ['travel'], turn: 'pick', query: 'khách sạn', area: 'Đà Nẵng' }) : intentObj(second)
const flag = (on: boolean) => ({ CONSULT_ANSWER_ATTRIBUTION: on ? '1' : '0' })

describe('P3 · Luna intent: "never two asks in a row" uses the label (routingAnswersAsk → runLunaIntent previousWasAsk)', () => {
  it('OFF: a reply after an ask is the answer, so Luna\'s second ask becomes a pick (the old rule)', async () => {
    script.intent = luna({ domains: [], turn: 'ask', ask: CARD })
    const r = await run(flag(false), HOTEL, OFF_TOPIC)
    expect(r.consult).toEqual(['brain:ask:travel', 'brain:pick:travel'])
    expect(r.problems).toEqual([])
  })
  it('ON: the off-topic reply is a new request, so Luna\'s ask stays an ask (a card, rebuilt from the catalogue) and no consultation domain is imposed', async () => {
    script.intent = luna({ domains: [], turn: 'ask', ask: CARD })
    const r = await run(flag(true), HOTEL, OFF_TOPIC)
    expect(r.consult).toEqual(['brain:ask:travel', 'brain:ask:'])
    expect(r.guards).toEqual(['consult_ask_catalogue'])
  })
})

describe('P4 · brain: the same rule in the brain call (routingAnswersAsk → runConsultBrain previousWasAsk)', () => {
  const brain = () => JSON.stringify({ turn: 'ask', domains: [], ask: CARD })
  it('OFF: the rules are sure (the reply is "the answer"), the brain is not even asked: a pick by rules', async () => {
    script.brain = brain
    const r = await run({ ...flag(false), CONSULT_LUNA: '0' }, HOTEL, OFF_TOPIC)
    expect(r.consult).toEqual(['rules:ask:travel', 'rules:pick:travel'])
  })
  it('ON: the rules are unsure, the brain is asked, and its ask stays an ask (previousWasAsk false)', async () => {
    script.brain = brain
    const r = await run({ ...flag(true), CONSULT_LUNA: '0' }, HOTEL, OFF_TOPIC)
    expect(r.consult).toEqual(['rules:ask:travel', 'brain:ask:'])
    expect(r.guards).toEqual(['consult_ask_catalogue'])
  })
})

describe('P5 · consultContinues (answersAsk): a reply that is a request of its own does not continue the old thread', () => {
  // The reply names ANOTHER area, so the router starts it as a new consultation (the older `fresh` rule) in both modes. What differs is whether the route still treats it as a
  // continuation of the hotel thread: `ownDomainSwitch` (= !consultContinues && a new consultation) feeds the gates, which then judge the turn as its own.
  it('OFF: the turn is judged as a refinement of the thread (thread scope)', async () => {
    script.intent = luna({ domains: ['food'], turn: 'pick', query: 'quán phở', area: 'quận 3' })
    const r = await run(flag(false), HOTEL, NEW_FOOD)
    expect(r.consult).toEqual(['brain:ask:travel', 'brain:pick:food'])
    expect(r.gates.slice(2)).toEqual(['intent:refinement/asked=false', 'clarify:true/thread'])
  })
  it('ON: the turn is judged as a new consultation (its own scope), still a pick of the new area', async () => {
    script.intent = luna({ domains: ['food'], turn: 'pick', query: 'quán phở', area: 'quận 3' })
    const r = await run(flag(true), HOTEL, NEW_FOOD)
    expect(r.consult).toEqual(['brain:ask:travel', 'brain:pick:food'])
    expect(r.gates.slice(2)).toEqual(['intent:new_consultation/asked=false', 'clarify:true/turn'])
  })
})

describe('an ANSWER is untouched by the flag at every connection point', () => {
  it('the same turns, the same gates, ON and OFF', async () => {
    script.intent = luna({ domains: ['travel'], turn: 'pick', query: 'khách sạn', area: 'Đà Nẵng' })
    const off = await run(flag(false), 'Tìm giúp mình vé máy bay đi Đà Nẵng', 'Cuối tuần này đi 2 người')
    script.intent = luna({ domains: ['travel'], turn: 'pick', query: 'khách sạn', area: 'Đà Nẵng' })
    const on = await run(flag(true), 'Tìm giúp mình vé máy bay đi Đà Nẵng', 'Cuối tuần này đi 2 người')
    expect(on).toEqual(off)
    expect(on.consult[1]).toBe('brain:pick:travel')
  })
})
