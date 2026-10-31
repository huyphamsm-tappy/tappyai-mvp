// @vitest-environment node
// Quota option (d) · the extension mode can reset the FREE-plan question counter before each turn, only when BOTH the mode is exactly dev-multi AND the flag
// BENCH_RESET_FREE_QUOTA_PER_TURN is exactly 1. Everything else (flag missing / 0, acceptance, missing or odd mode) leaves the real limit in force: question FREE_DAILY_LIMIT + 1 of
// the simulated Free account is refused by the REAL route with HTTP 429 free_limit_reached (at 10/day this is what stopped the baseline at E11; owner 01/11/2026 raised Free to a
// hidden 300/day ceiling, so the tests first drive the same counter to 10 below it - see spendToTenBelowTheLimit).
//
// REAL chat route + REAL AI layer + REAL quota, the REAL runLiveTrial; only the network is fake (a scripted OpenAI that answers an intent request and a plain text answer; no tools,
// so Serper is never asked). MOCK ONLY: no key, no real host, no model. Questions are written for this test.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal, aiQuotaIdentity, consumeAiQuestion, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { FREE_DAILY_LIMIT } from '@/lib/config/product'
import { __clearToolCache, getCache, setCache } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests, httpErrorCodeOf } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { QUOTA_RESET_FLAG, formatSummary, quotaResetState, runLiveTrial, type TrialOutcome, type TrialSummary } from './liveTrial'
import { conditionReport } from './preflightReport'
import { buildChildEnv, gate1Summary, launcherRefusals } from './liveTrialLauncher.mjs'
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
  const evidence = new Map<string, unknown>()
  const rpc = (fn: string, args: { p_id?: string; p_evidence?: unknown }) => {
    if (fn === 'decision_evidence_save' && args?.p_id) { evidence.set(args.p_id, JSON.parse(JSON.stringify(args.p_evidence ?? null))); return Promise.resolve({ data: null, error: null }) }
    if (fn === 'decision_evidence_load' && args?.p_id) return Promise.resolve({ data: evidence.get(args.p_id) ?? null, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  return { client: { from: () => builder(), rpc } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
// the SAME fixed user for every turn and every test: the quota is keyed by this id, which is exactly what the real trial does (liveTrial.test.ts)
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0a01' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

// ── the fake OpenAI ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const net = { openaiCalls: 0, answerUserCounts: [] as number[], other: [] as string[] }
type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const textStream = (text: string, includeUsage: boolean) => sse([
  { choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ...(includeUsage ? [{ choices: [], usage: usage(1200, 40) }] : []),
])
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com' && u.pathname === '/v1/chat/completions') {
    net.openaiCalls++
    const body = JSON.parse(String(init?.body ?? '{}'))
    if (body.response_format) return jsonCompletion(INTENT, usage(1000, 100))
    const msgs: Array<{ role: string }> = body.messages ?? []
    net.answerUserCounts.push(msgs.filter(m => m.role === 'user').length)
    return textStream('Đây là câu trả lời kiểm thử ngắn.', body.stream_options?.include_usage === true)
  }
  net.other.push(u.hostname); throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)

const EXT_ENV: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-closure2/quota/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
/** Modes other than the extension mode have the acceptance maximum (0,65 USD per run); the run cap must leave room for a turn's 0,05 reservation after the earlier turns. */
const NON_EXT = { ...EXT_ENV, BENCH_SPEND_RUN_CAP_USD: '0.65', BENCH_CONFIRM_SPEND: '0.65' }
const FLAG = QUOTA_RESET_FLAG

beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  net.openaiCalls = 0; net.answerUserCounts = []; net.other = []
  for (const k of [...BENCH_FLAG_NAMES, FLAG, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

/** n development turns: T1..Tn, each its own conversation, except the last three which are ONE conversation "C" (history must reach them). */
const turnsOf = (n: number): UatTurn[] => Array.from({ length: n }, (_, i) => {
  const k = i + 1, inC = n >= 13 && k >= n - 2
  return { id: `T${k}`, conversation: inC ? 'C' : `T${k}`, turn: inC ? k - (n - 3) : 1, text: `Câu hỏi kiểm thử số ${k} về một chủ đề riêng ${'x'.repeat(k)}` }
})

interface Run { out: TrialOutcome; summary: TrialSummary; resultJson: any; text: string; logs: string[] }
async function run(env: Record<string, string | undefined>, n: number): Promise<Run> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ').slice(0, 300)) }))
  const fs = memFs()
  let out: TrialOutcome
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: turnsOf(n), afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const file = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  return { out, summary: out.summary, resultJson: file ? JSON.parse(file[1]) : null, text: formatSummary(out.summary), logs }
}
/**
 * owner 01/11/2026: Free 10 -> 300 a day (accounts have no visible limit; hidden anti-abuse ceiling). The harness cannot send 300+ real turns (its own request cap of 450 per
 * run and its spend cap stop it first), so the SAME counter the route spends from - the same user id, through the real quota module - is first driven to 10 below the
 * real limit, one real unit at a time. Turn T11 of the run is then question FREE_DAILY_LIMIT + 1 of the day, and it must be refused by the real route at the real limit.
 */
const BENCH_USER = { id: '00000000-0000-4000-8000-0000000c0a01', is_anonymous: false }
async function spendToTenBelowTheLimit(): Promise<void> {
  const id = aiQuotaIdentity(BENCH_USER, '127.0.0.1')
  for (let i = 0; i < FREE_DAILY_LIMIT - 10; i++) expect((await consumeAiQuestion(id)).ok).toBe(true)
  expect(await peekAiQuestionQuota(id)).toMatchObject({ limit: FREE_DAILY_LIMIT, used: FREE_DAILY_LIMIT - 10, remaining: 10 })
}
const refusal = async (env: Record<string, string | undefined>): Promise<string[]> => {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const out = await runLiveTrial({ env: process.env, post: (async () => { throw new Error('must not be called') }) as never, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: turnsOf(2), afterTrial: 'restore' } as never)
  if (out.kind !== 'refused') throw new Error('expected a refusal')
  return out.reasons
}

describe('the decision: mode × flag (pure)', () => {
  const table: Array<[string, string | undefined, string | undefined, boolean]> = [
    ['dev-multi + 1', 'dev-multi', '1', true],
    ['dev-multi + flag missing', 'dev-multi', undefined, false],
    ['dev-multi + 0', 'dev-multi', '0', false],
    ['dev-multi + an odd value', 'dev-multi', 'yes', false],
    ['mode missing + 1', undefined, '1', false],
    ['acceptance + 1', 'acceptance', '1', false],
    ['an unknown mode + 1', 'weird', '1', false],
    ['DEV-MULTI + 1', 'DEV-MULTI', '1', false],
    ['"dev-multi " + 1', 'dev-multi ', '1', false],
    ['an empty mode + 1', '', '1', false],
  ]
  for (const [name, mode, flag, on] of table) {
    it(`${name} → ${on ? 'ON' : 'OFF'}`, () => {
      const s = quotaResetState({ BENCH_TRIAL_MODE: mode, [FLAG]: flag })
      expect(s.on).toBe(on)
      expect(s.reason).toMatch(/^mode=.*, flag=/)
    })
  }
  it('the flag only has the one name the Owner sets', () => { expect(FLAG).toBe('BENCH_RESET_FREE_QUOTA_PER_TURN') })
})

describe('(a) dev-multi + flag 1: 13 turns in one process, one user, no 429; history and the L1 cache are kept', () => {
  it('runs all 13 turns, the quota was reset 13 times, a three-turn conversation keeps its history, the L1 sentinel survives, nothing else changed', async () => {
    setCache('quota-test-sentinel', { kept: true }, 600_000)
    // the counter starts 10 below the real limit, so without the per-turn reset T11 would be refused: 13 answers prove the reset reached it
    await spendToTenBelowTheLimit()
    const r = await run({ ...EXT_ENV, [FLAG]: '1' }, 13)
    const s = r.summary
    expect(s.turnsRun).toBe(13); expect(s.stopped).toBeNull()
    expect(r.resultJson.turns.map((t: { httpStatus: number }) => t.httpStatus)).toEqual(Array(13).fill(200))
    expect(r.resultJson.turns.every((t: { answer: string }) => t.answer.length > 0)).toBe(true)
    expect(s.quotaReset).toEqual({ on: true, reason: 'mode=dev-multi, flag=1', resets: 13 })
    // history: the last three turns are ONE conversation "C": the answer request of turn 3 of C carries 3 user messages (turns 1, 2, 3 of C)
    expect(net.answerUserCounts.slice(-3)).toEqual([1, 2, 3])
    // L1 cache, cap, cost gate, budget: untouched by the reset
    expect(getCache('quota-test-sentinel')).toEqual({ kept: true })
    expect(s.requestCap).toEqual({ perTurnLimit: 15, runLimit: 450, sent: 0, refused: 0 })
    expect(s.budget).toEqual({ mode: 'extension', turnCapUsd: 0.05, runCapUsd: 1.75 })
    expect(s.costState).toBe('known'); expect(s.llmRequests).toBe(net.openaiCalls); expect(s.hostRequests['api.openai.com']).toBe(net.openaiCalls)
    expect(s.hostsBlocked).toEqual([])
  })
})

describe(`(b) dev-multi and the flag missing / 0: the real limit stays — question ${FREE_DAILY_LIMIT + 1} of the day (run turn T11) gets HTTP 429 free_limit_reached`, () => {
  for (const [name, flag] of [['missing', undefined], ['0', '0']] as const) {
    it(`flag ${name}: the run stops at T11 with the 429 and its code; nothing after T11 is sent`, async () => {
      // owner 01/11/2026: 10 -> 300 (accounts have no visible limit; hidden anti-abuse ceiling)
      await spendToTenBelowTheLimit()
      const r = await run({ ...EXT_ENV, ...(flag === undefined ? {} : { [FLAG]: flag }) }, 13)
      const s = r.summary
      expect(s.turnsRun).toBe(11)
      expect(s.stopped).toMatch(/halted after 11 of 13/)
      expect(s.problems.join(' | ')).toContain('T11: error: HTTP 429: not an answer (error: free_limit_reached)')
      expect(s.quotaReset).toEqual({ on: false, reason: `mode=dev-multi, flag=${flag ?? 'unset'}`, resets: 0 })
      const t11 = r.resultJson.turns[10]
      expect(t11.httpStatus).toBe(429); expect(t11.httpErrorCode).toBe('free_limit_reached'); expect(t11.answer).toBe('')
      expect(r.resultJson.turns.slice(0, 10).every((t: { httpStatus: number }) => t.httpStatus === 200)).toBe(true)
    })
  }
  for (const odd of ['yes', '2', 'true', 'ON']) {
    it(`flag ${JSON.stringify(odd)} is refused by the preflight, by name, and nothing is sent`, async () => {
      const reasons = await refusal({ ...EXT_ENV, [FLAG]: odd })
      expect(reasons.join(' | ')).toContain(`${FLAG} must be exactly 1, 0 or unset`)
      expect(net.openaiCalls).toBe(0)
    })
  }
})

describe(`(c) every other mode, flag 1: no reset — question ${FREE_DAILY_LIMIT + 1} of the day (run turn T11) still gets 429`, () => {
  const modes: Array<[string, string | undefined]> = [['mode missing (acceptance)', undefined], ['acceptance written out', 'acceptance'], ['an unknown mode', 'weird'], ['DEV-MULTI', 'DEV-MULTI'], ['"dev-multi " with a space', 'dev-multi '], ['an empty mode', '']]
  for (const [name, mode] of modes) {
    it(`${name}`, async () => {
      await spendToTenBelowTheLimit()
      const r = await run({ ...NON_EXT, BENCH_TRIAL_MODE: mode, [FLAG]: '1' }, 13)
      expect(r.summary.turnsRun).toBe(11)
      expect(r.summary.problems.join(' | ')).toContain('T11: error: HTTP 429: not an answer (error: free_limit_reached)')
      expect(r.summary.quotaReset.on).toBe(false); expect(r.summary.quotaReset.resets).toBe(0)
      expect(r.summary.quotaReset.reason).toMatch(/^mode=.*, flag=1/)
    })
  }
})

describe('(e) the summary, the result file and Gate 1 show the state the configuration really has', () => {
  const combos: Array<[string, Record<string, string | undefined>, boolean]> = [
    ['dev-multi + 1', { ...EXT_ENV, [FLAG]: '1' }, true],
    ['dev-multi + flag missing', { ...EXT_ENV }, false],
    ['dev-multi + 0', { ...EXT_ENV, [FLAG]: '0' }, false],
    ['acceptance + 1', { ...NON_EXT, BENCH_TRIAL_MODE: undefined, [FLAG]: '1' }, false],
  ]
  for (const [name, env, on] of combos) {
    it(`${name} → ${on ? 'ON' : 'OFF'} in the summary text, in the result file and with the right count`, async () => {
      const r = await run(env, 3)
      const q = r.summary.quotaReset
      expect(q.on).toBe(on); expect(q.resets).toBe(on ? 3 : 0)
      expect(r.text).toContain(`free-question quota reset per turn: ${on ? 'ON' : 'OFF'} (reason: ${q.reason}) | resets: ${on ? 3 : 0}`)
      expect(r.resultJson.freeQuotaReset).toEqual(q)
      const gate = gate1Summary(env, null).join('\n')
      expect(gate).toMatch(on ? /hạn mức Free \(10 câu\/ngày\): được ĐẶT LẠI mỗi lượt/ : /hạn mức Free \(10 câu\/ngày\): ÁP DỤNG như thật/)
      expect(gate).not.toMatch(on ? /ÁP DỤNG như thật/ : /được ĐẶT LẠI/)
    })
  }
  it('Gate 1 names the stop at turn 11 when the limit applies, and says a flag outside the extension mode has no effect; it never names a Serper host', () => {
    const off = gate1Summary({ ...EXT_ENV }, null).join('\n')
    expect(off).toMatch(/dừng ở lượt 11/)
    const ignored = gate1Summary({ ...NON_EXT, BENCH_TRIAL_MODE: undefined, [FLAG]: '1' }, null).join('\n')
    expect(ignored).toMatch(/cờ không có hiệu lực ở chế độ này/)
    for (const t of [off, ignored, gate1Summary({ ...EXT_ENV, [FLAG]: '1' }, null).join('\n')]) expect(t).not.toMatch(/serper\.dev/i)
  })
  it('the launcher decision and the core decision agree on every mode × flag combination', () => {
    for (const mode of [undefined, '', 'dev-multi', 'dev-multi ', 'DEV-MULTI', 'acceptance', 'weird']) for (const flag of [undefined, '', '0', '1', 'yes']) {
      const env = { ...EXT_ENV, BENCH_TRIAL_MODE: mode, [FLAG]: flag }
      const core = quotaResetState(env).on
      const gate = gate1Summary(env, null).join('\n')
      expect(/được ĐẶT LẠI mỗi lượt/.test(gate), JSON.stringify({ mode, flag })).toBe(core)
    }
  })
})

describe('(f) the flag reaches the child, the preflight checks its value, other unknown variables are still refused', () => {
  it('buildChildEnv passes it on (value 1), and does not invent it when the shell has none', () => {
    expect(buildChildEnv({ ...EXT_ENV, [FLAG]: '1' }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })[FLAG]).toBe('1')
    expect(FLAG in buildChildEnv({ ...EXT_ENV }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })).toBe(false)
  })
  it('the launcher accepts the flag by name and still refuses a look-alike or any other unknown BENCH_ variable', () => {
    expect(launcherRefusals({ ...EXT_ENV, [FLAG]: '1' })).toEqual([])
    expect(launcherRefusals({ ...EXT_ENV, BENCH_RESET_FREE_QUOTA_PER_TURNS: '1' }).join(' | ')).toContain('BENCH_RESET_FREE_QUOTA_PER_TURNS is set but is not one of the variables the trial passes on')
    expect(launcherRefusals({ ...EXT_ENV, BENCH_SOMETHING_ELSE: '1' }).join(' | ')).toContain('BENCH_SOMETHING_ELSE is set but is not one')
  })
  const report = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null })
  }
  const line = (c: ReturnType<typeof conditionReport>) => c.find(x => x.name.startsWith('free-question quota reset per turn'))!
  it('a valid value gives an information line that says ON or OFF with its reason', () => {
    expect(line(report({ ...EXT_ENV, [FLAG]: '1' }))).toMatchObject({ ok: true, detail: expect.stringContaining('ON (mode=dev-multi, flag=1)') })
    expect(line(report({ ...EXT_ENV, [FLAG]: undefined }))).toMatchObject({ ok: true, detail: expect.stringContaining('OFF (mode=dev-multi, flag=unset)') })
  })
  it('an odd value is KHÔNG ĐẠT with the reason; the flag in the acceptance mode only warns that it has no effect', () => {
    const bad = line(report({ ...EXT_ENV, [FLAG]: 'yes' }))
    expect(bad.ok).toBe(false); expect(bad.detail).toContain(`${FLAG} must be exactly 1, 0 or unset`)
    const ignored = line(report({ ...NON_EXT, BENCH_TRIAL_MODE: undefined, [FLAG]: '1' }))
    expect(ignored.ok).toBe(true); expect(ignored.detail).toMatch(/CẢNH BÁO.*cờ không có hiệu lực ở chế độ này/)
  })
})

describe('(g) the error code of a non-2xx answer is recorded, short and redacted, and never the body', () => {
  it('httpErrorCodeOf: the error string of a JSON body, cut at 80 characters', () => {
    expect(httpErrorCodeOf('{"error":"free_limit_reached","message":"Bạn đã dùng hết 10 câu hỏi AI hôm nay"}', {})).toBe('free_limit_reached')
    expect(httpErrorCodeOf(JSON.stringify({ error: 'a'.repeat(200) }), {})).toBe('a'.repeat(80))
  })
  it('httpErrorCodeOf: null when there is none; never an object, an array or a long message body; key-shaped text is masked; non-ASCII characters are dropped', () => {
    expect(httpErrorCodeOf('not json', {})).toBeNull()
    expect(httpErrorCodeOf('{"message":"x"}', {})).toBeNull()
    expect(httpErrorCodeOf('{"error":{"message":"Bạn đã dùng hết"}}', {})).toBeNull()
    expect(httpErrorCodeOf('["free_limit_reached"]', {})).toBeNull()
    expect(httpErrorCodeOf('{"error":"bad key sk-abcdef123456 here"}', {})).toBe('bad key sk-*** here')
    expect(httpErrorCodeOf('{"error":"Hẹn gặp lại"}', {})).not.toMatch(/Hẹn|lại/)
  })
  it('the summary line and the file hold the code, and not the sentence the route sent to the user', async () => {
    await spendToTenBelowTheLimit()
    const r = await run({ ...EXT_ENV }, 12)
    expect(r.text).toContain('error: free_limit_reached')
    for (const t of [r.text, JSON.stringify(r.resultJson.turns[10])]) expect(t).not.toMatch(/Hẹn gặp lại|câu hỏi AI hôm nay|used all/)
  })
})
