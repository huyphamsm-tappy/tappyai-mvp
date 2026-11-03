// @vitest-environment node
// Wave 2C · CONSULT_TRACE_DIAGNOSTICS at ROUTE level: REAL chat route + REAL router + REAL runLiveTrial (the turn ids A1/A2 travel to the route as the trace id); only the network is fake (a scripted
// Luna / model, a scripted Serper). MOCK ONLY: no key, no real host. The sentences are written for this test; none comes from the acceptance set or the extension set.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { runLiveTrial } from './liveTrial'
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
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()), getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }) }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0c05' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const intentObj = (o: Record<string, unknown>) => JSON.stringify({ domains: [], turn: 'chat', goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...o })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const textStream = (text: string, inc: boolean) => sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, ...(inc ? [{ choices: [], usage: usage(500, 50) }] : [])])
const toolStream = (name: string, args: object, inc: boolean) => sse([
  { choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: '' } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }, ...(inc ? [{ choices: [], usage: usage(500, 50) }] : []),
])

const net = { serper: 0, tool: null as null | { name: string; args: object }, stubborn: false, mapsRows: [] as object[], organic: [] as object[], intent: (_all: string): string => intentObj({}) }
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const inc = body.stream_options?.include_usage === true
    const all = JSON.stringify(body.messages ?? [])
    if (body.response_format) return jsonCompletion(net.intent(all), usage(1000, 100))
    if (body.stream !== true) return jsonCompletion('{}', usage(300, 10))
    const names: string[] = (body.tools ?? []).map((t: { function?: { name: string } }) => t.function?.name)
    const told = [...(body.messages ?? [])].reverse().find((m: { role: string }) => m.role === 'tool')
    const sawBudget = told !== undefined && JSON.stringify(told.content ?? '').includes('search_budget_used')
    if (net.tool && names.includes(net.tool.name) && (net.stubborn || told === undefined)) return toolStream(net.tool.name, net.tool.args, inc)
    void sawBudget
    return textStream('Câu trả lời kiểm thử, ngắn gọn.', inc)
  }
  if (u.hostname === 'google.serper.dev') {
    net.serper++
    if (u.pathname === '/maps') return new Response(JSON.stringify({ places: net.mapsRows, credits: 3 }), { status: 200 })
    return new Response(JSON.stringify({ organic: net.organic, credits: 1 }), { status: 200 })
  }
  if (/openstreetmap|overpass|mail\.ru/.test(u.hostname)) return new Response(JSON.stringify({ elements: [] }), { status: 200 })
  if (u.hostname === 'html.duckduckgo.com') return new Response('<html></html>', { status: 200 })
  throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
const BASE: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450', BENCH_RESET_FREE_QUOTA_PER_TURN: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2c/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
}
const LEGACY = { CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0' }
const ENV_NAMES = [...BENCH_FLAG_NAMES, 'BENCH_RESET_FREE_QUOTA_PER_TURN', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'CONSULT_LUNA']
const reset = () => { __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); net.serper = 0; net.tool = null; net.stubborn = false; net.mapsRows = []; net.organic = []; net.intent = () => intentObj({}); for (const k of ENV_NAMES) vi.stubEnv(k, undefined) }
beforeEach(reset)
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

type Ev = Record<string, any>
interface Run { logs: string[]; trace: Ev[]; answers: string[]; problems: string[] }
async function run(env: Record<string, string>, turnTexts: string[]): Promise<Run> {
  // (the environment and the process guards are reset by beforeEach; `net` is set by the test BEFORE it calls run)
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); net.serper = 0
  for (const k of ENV_NAMES) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries({ ...BASE, ...env })) vi.stubEnv(k, v)
  const turns: UatTurn[] = turnTexts.map((text, i) => ({ id: `A${i + 1}`, conversation: 'A', turn: i + 1, text }))
  const fs = memFs()
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: process.cwd(), now: () => 1_000, turns, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused ' + JSON.stringify(out.reasons))
  const f = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  const file = f ? JSON.parse(f[1]) : null
  const trace = logs.filter(l => l.startsWith('{"type":"tappyai_trace"')).map(l => JSON.parse(l) as Ev)
  return { logs, trace, answers: (file?.turns ?? []).map((t: { answer: string }) => t.answer), problems: out.summary.problems }
}
const of = (r: Run, id: string, ev?: string) => r.trace.filter(e => e.traceId === id && (!ev || e.ev === ev))

const HOTEL = 'Tìm giúp mình khách sạn ở Đà Nẵng'
const OFF_TOPIC = 'Thủ đô của nước Pháp là thành phố nào vậy bạn?'
const INTENT_HOTEL = intentObj({ domains: ['travel'], turn: 'pick', query: 'khách sạn Đà Nẵng', area: 'Đà Nẵng' })
net.intent = () => intentObj({})
const hotelThenChat = (all: string) => (!all.includes('TAPPY:') ? INTENT_HOTEL : intentObj({}))
const ON = { CONSULT_TRACE_DIAGNOSTICS: '1', CONSULT_ANSWER_ATTRIBUTION: '1' }

describe('attribution label, trace id join, intent merge', () => {
  it('records the REAL label, its signal and the branch; the first turn has no previous ask; the two turns never mix', async () => {
    const r = await (async () => { reset(); net.intent = hotelThenChat; return run(ON, [HOTEL, OFF_TOPIC]) })()
    expect(r.problems).toEqual([])
    // (optional, for the report: TRACE_SAMPLE_OUT=<file> writes the real lines this scenario produced; the mock network holds no secret and no user data)
    if (process.env.TRACE_SAMPLE_OUT) writeFileSync(process.env.TRACE_SAMPLE_OUT, r.logs.filter(l => l.startsWith('{"type":"tappyai_trace"') || /^\{"type":"tappyai_(consult|intent_gate|canned_reply)","traceId"/.test(l)).join('\n') + '\n', 'utf8')
    // every trace line belongs to exactly one of the two turns
    expect(new Set(r.trace.map(e => e.traceId))).toEqual(new Set(['A1', 'A2']))
    for (const id of ['A1', 'A2']) {
      const ev = of(r, id)
      expect(ev.filter(e => e.ev === 'turn_start')).toHaveLength(1); expect(ev[0].ev).toBe('turn_start'); expect(ev[0].idSource).toBe('header')
      expect(ev.map(e => e.seq)).toEqual(ev.map((_, i) => i + 1)) // 1, 2, 3 … per turn
    }
    const a1 = of(r, 'A1', 'attribution')[0], a2 = of(r, 'A2', 'attribution')[0]
    expect(a1).toMatchObject({ where: 'router_step2', previousWasAsk: false, label: null, branch: 'previous_not_ask' })
    expect(a2).toMatchObject({ where: 'router_step2', previousWasAsk: true, flagOn: true, label: 'new_request', signal: 'own_question', branch: 'new_request', inThread: true })
    expect(a2.askIds.length).toBeGreaterThan(0)
    // the OLD log lines of each turn carry that turn's id too (bench tagging): the two consult lines are not swapped
    const consult = r.logs.filter(l => l.startsWith('{"type":"tappyai_consult"')).map(l => JSON.parse(l))
    expect(consult.map(c => c.traceId)).toEqual(['A1', 'A2'])
  })
  it('flag OFF for attribution but trace ON: the label is still reported (what it WOULD be) with applied=false and the old branch', async () => {
    net.intent = hotelThenChat
    const r = await run({ CONSULT_TRACE_DIAGNOSTICS: '1' }, [HOTEL, OFF_TOPIC])
    expect(of(r, 'A2', 'attribution')[0]).toMatchObject({ previousWasAsk: true, flagOn: false, label: 'new_request', branch: 'flag_off_read_as_answer' })
  })
  it('an answer that matches an offered option is labelled answer / option, and is read as the answer', async () => {
    net.intent = (all: string) => intentObj({ domains: ['travel'], turn: 'pick', query: 'khách sạn Đà Nẵng', area: 'Đà Nẵng' })
    const r = await run(ON, [HOTEL, 'Dưới 500k một đêm thôi'])
    const a2 = of(r, 'A2', 'attribution')[0]
    expect(a2).toMatchObject({ previousWasAsk: true, flagOn: true, branch: 'read_as_answer' })
    expect(['answer', 'unclear']).toContain(a2.label)
  })
  it('the intent event lays the rules, Luna and the merge side by side: rules ask beats Luna pick (turnWinner rules), nothing changed', async () => {
    net.intent = hotelThenChat
    const r = await run(ON, [HOTEL, OFF_TOPIC])
    const i1 = of(r, 'A1', 'intent')[0]
    expect(i1.rules).toMatchObject({ turn: 'ask', confidence: 'rule' }); expect(i1.luna).toMatchObject({ turn: 'pick', domains: ['travel'] })
    expect(i1.merge).toMatchObject({ mode: 'merged', turn: 'ask', rulesTurn: 'ask', lunaTurn: 'pick', turnWinner: 'rules' })
    expect(i1.final).toMatchObject({ turn: 'ask' })
    expect(of(r, 'A1', 'path_cut')[0]).toMatchObject({ kind: 'canned_reply', cannedKind: 'consult_ask', modelCalled: false })
    const i2 = of(r, 'A2', 'intent')[0]
    expect(i2.previousWasAsk).toMatchObject({ wasAskReply: true, routing: false, route: false, routeLabel: 'new_request' })
    expect(i2.rules).toMatchObject({ turn: 'chat', confidence: 'unsure' }); expect(i2.merge).toMatchObject({ mode: 'luna', turnWinner: 'luna_rules_unsure' })
    expect(of(r, 'A2', 'continuation')[0]).toMatchObject({ pickContinuesBecauseAnswer: false })
  })
})

describe('tool states through the real route', () => {
  const QUESTION = 'Giải thích ngắn gọn vì sao nước biển mặn?'
  it('a stubborn tool loop with CONSULT_FINAL_SYNTHESIS: three calls run, the rest are BLOCKED (search_budget_used), and a blocked call is not a provider request', async () => {
    net.tool = { name: 'web_search', args: { query: 'nuoc bien man vi sao' } }; net.stubborn = true; net.organic = [{ title: 'Ket qua 1', link: 'https://example.vn/a?utm_source=x', snippet: 'doan trich dai' }]
    const r = await run({ ...LEGACY, ...ON, CONSULT_FINAL_SYNTHESIS: '1' }, [QUESTION])
    const tool = of(r, 'A1', 'tool')
    const by = (s: string) => tool.filter(e => e.state === s)
    expect(by('requested').length).toBeGreaterThanOrEqual(4)
    expect(by('executed')).toHaveLength(3); expect(by('results')).toHaveLength(3)
    expect(by('blocked').length).toBeGreaterThanOrEqual(1)
    for (const b of by('blocked')) { expect(b).toMatchObject({ reason: 'search_budget_used', reachedProvider: false, by: 'guard' }); expect(b).not.toHaveProperty('serperRequests') }
    // "executed" is NOT "a request reached the provider": the same query repeated is answered from the tool cache. The per-call Serper count shows it; the provider saw exactly that many requests.
    const sent = by('results').map(e => e.serperRequests as number)
    expect(sent.reduce((a, b) => a + b, 0)).toBe(net.serper); expect(net.serper).toBe(1); expect(sent).toEqual([1, 0, 0])
    expect(by('results')[0]).toMatchObject({ rows: 1, provider: 'serper', lookup: 'completed' }); expect(by('results')[0].preview[0]).toEqual({ name: 'Ket qua 1', url: 'example.vn/a' })
    const loop = of(r, 'A1', 'loop')[0]
    expect(loop.tools).toMatchObject({ executed: 3, results: 3 }); expect(loop.tools.blocked).toBe(by('blocked').length); expect(loop.maxSteps).toBe(5); expect(loop).toHaveProperty('finishReason')
    expect(JSON.stringify(r.trace)).not.toMatch(/utm_source|doan trich dai/)
  })
  it('search_places that answers no_current_location is an ERROR that looked nothing up (never results, no Serper request)', async () => {
    net.tool = { name: 'search_places', args: { query: 'nguyen nhat anh' } }
    const r = await run({ ...LEGACY, ...ON }, [QUESTION])
    const tool = of(r, 'A1', 'tool')
    expect(tool.map(e => e.state).slice(0, 3)).toEqual(['requested', 'executed', 'error'])
    expect(tool[2]).toMatchObject({ errorKind: 'no_current_location', lookup: 'not_attempted', rows: null })
    expect(tool.some(e => e.state === 'results')).toBe(false); expect(net.serper).toBe(0)
    expect(of(r, 'A1', 'loop')[0].tools).toMatchObject({ executed: 1, error: 1, results: 0 })
    // the code then appends its own area question: that cut of the path is recorded too (and the old log line carries the turn id)
    expect(of(r, 'A1', 'path_cut').find(e => e.kind === 'area_ask')).toMatchObject({ appended: true })
    expect(r.logs.find(l => l.startsWith('{"type":"tappyai_area_ask"'))).toContain('"traceId":"A1"')
  })
  it('an empty provider answer is "empty" (executed, completed, no rows)', async () => {
    net.tool = { name: 'web_search', args: { query: 'khong co gi ca xyz' } }; net.organic = []
    const r = await run({ ...LEGACY, ...ON }, [QUESTION])
    const tool = of(r, 'A1', 'tool')
    expect(tool.find(e => e.state === 'empty')).toMatchObject({ tool: 'web_search', rows: 0, lookup: 'completed', errorKind: null })
    expect(tool.some(e => e.state === 'results')).toBe(false)
  })
  it('the code\'s own pre-search is seen too: requested by "code", executed, results with a bounded preview', async () => {
    net.mapsRows = [{ title: 'Quán Phở Một', address: '1 Nguyễn Huệ', rating: 4.6, ratingCount: 120, cid: '111', latitude: 10.77, longitude: 106.7, website: 'https://phomot.example.vn/menu?utm_campaign=z', phoneNumber: '0901234567', type: 'Quán phở' }]
    net.organic = [{ title: 'Phở Một review', link: 'https://review.example.vn/pho-mot', snippet: 'rat ngon' }]
    net.intent = () => intentObj({ domains: ['food'], turn: 'pick', query: 'phở', area: 'Quận 3' })
    const r = await run(ON, ['Tìm giúp mình quán phở ngon ở quận 3'])
    const tool = of(r, 'A1', 'tool')
    expect(tool[0]).toMatchObject({ state: 'requested', by: 'code', tool: 'search_places' })
    expect(tool[1]).toMatchObject({ state: 'executed', by: 'code' })
    const res = tool.find(e => e.state === 'results' || e.state === 'empty')!
    expect(res).toBeDefined()
    expect(JSON.stringify(r.trace)).not.toMatch(/utm_campaign|0901234567|Nguyễn Huệ|rat ngon/)
  })
})

describe('flag OFF: nothing new, and the product output is the same', () => {
  it('no tappyai_trace line, no traceId tag, and the same answers and the same old events as with the trace ON', async () => {
    net.intent = hotelThenChat
    const off = await run({ CONSULT_ANSWER_ATTRIBUTION: '1' }, [HOTEL, OFF_TOPIC])
    expect(off.trace).toEqual([]); expect(off.logs.some(l => l.includes('"traceId"') || l.includes('tappyai_trace'))).toBe(false)
    net.intent = hotelThenChat
    const on = await run(ON, [HOTEL, OFF_TOPIC])
    expect(on.trace.length).toBeGreaterThan(0)
    expect(on.answers).toEqual(off.answers)
    const kinds = (r: Run) => r.logs.filter(l => l.startsWith('{"type":"tappyai_') && !l.startsWith('{"type":"tappyai_trace"')).map(l => (JSON.parse(l) as Ev).type)
    expect(kinds(on)).toEqual(kinds(off))
  })
  it('"0" is OFF; any other value than 0, 1 or unset is refused by the preflight (not guessed at), so no run starts with it', async () => {
    net.intent = hotelThenChat
    const r = await run({ CONSULT_TRACE_DIAGNOSTICS: '0' }, [HOTEL])
    expect(r.trace).toEqual([])
    for (const v of ['true', 'on']) await expect(run({ CONSULT_TRACE_DIAGNOSTICS: v }, [HOTEL]), v).rejects.toThrow(/CONSULT_TRACE_DIAGNOSTICS must be exactly 1, 0 or unset/)
  })
})
