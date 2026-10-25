// @vitest-environment node
// Wave 2 · P2.A · CONSULT_FINAL_SYNTHESIS (default OFF). The baseline had three turns whose tool loop used EVERY step calling web_search: finishReason "tool-calls", the model never wrote a
// word. Two of them got a canned gap sentence (in card / opening-hours language) and one shipped EMPTY (the safety net only runs for a consult turn with a frame).
// With the flag ON the LAST step is kept for writing: a tool call made when only the last step is left is answered by code (no search, no Serper request, no cost) and the model writes from
// what it has; if it still writes nothing, ONE honest sentence about the evidence is put back, in no place/shopping vocabulary. Step budget, caps, gate and L1/L2 are untouched.
// The prompts here are written for this test; nothing comes from the acceptance set or the extension set.
// REAL chat route + REAL AI layer + REAL runLiveTrial; only the network is fake (a scripted model that keeps calling web_search). MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { formatSummary, runLiveTrial, type TrialSummary } from './liveTrial'
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0c01' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const toolStream = (name: string, args: object, inc: boolean) => sse([
  { choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: '' } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }, ...(inc ? [{ choices: [], usage: usage(500, 50) }] : []),
])
const textStream = (text: string, inc: boolean) => sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, ...(inc ? [{ choices: [], usage: usage(1500, 80) }] : [])])

/** The scripted model: it keeps calling web_search (a new query every time) and writes only once a tool result says the budget is used (`obeys`), never otherwise (`stubborn`). */
const net = { answerCalls: 0, serper: 0, queryN: 0, stubborn: false }
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const inc = body.stream_options?.include_usage === true
    if (body.response_format) return jsonCompletion(INTENT, usage(1000, 100))
    if (body.stream !== true) return jsonCompletion('{}', usage(300, 10))
    net.answerCalls++
    const msgs: Array<{ role: string; content?: unknown }> = body.messages ?? []
    const tools: string[] = (body.tools ?? []).map((t: { function?: { name: string } }) => t.function?.name)
    const lastTool = [...msgs].reverse().find(m => m.role === 'tool')
    const told = lastTool !== undefined && JSON.stringify(lastTool.content ?? '').includes('search_budget_used')
    if (tools.includes('web_search') && (net.stubborn || !told)) return toolStream('web_search', { query: `tim hieu quy dinh phan ${++net.queryN} cua nam nay` }, inc)
    return textStream('Theo những gì đã tìm được, đây là câu trả lời ngắn: chưa tìm thấy số liệu chính thức, bạn nên kiểm tra nguồn gốc.', inc)
  }
  if (u.hostname === 'google.serper.dev') { net.serper++; return new Response(JSON.stringify({ organic: [{ title: 'Ket qua kiem thu', link: 'https://example.com/' + net.serper, snippet: 'Doan trich kiem thu.' }], credits: 1 }), { status: 200 }) }
  throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450', BENCH_RESET_FREE_QUOTA_PER_TURN: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const LEGACY = { ...EXT, CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0' }
const CONSULT = { ...EXT, CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1' }
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  net.answerCalls = 0; net.serper = 0; net.queryN = 0; net.stubborn = false
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_RESET_FREE_QUOTA_PER_TURN', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

const TURN: UatTurn[] = [{ id: 'S1', conversation: 'S1', turn: 1, text: 'Mot quy dinh hanh chinh nam nay co gi moi can luu y khong?' }]
interface Run { summary: TrialSummary; file: any; logs: string[]; answer: string; text: string }
async function run(env: Record<string, string | undefined>): Promise<Run> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ').slice(0, 4000)) }))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const f = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  const file = f ? JSON.parse(f[1]) : null
  return { summary: out.summary, file, logs, answer: file?.turns?.[0]?.answer ?? '', text: formatSummary(out.summary) }
}
const usageLine = (logs: string[]) => { const l = logs.find(x => x.includes('"type":"tappyai_usage"')); return l ? JSON.parse(l.slice(l.indexOf('{'))) : null }
const PLACE_WORDS = /thẻ|giờ mở|điểm đánh giá|Xem thêm/

describe('legacy path (no consult frame): the tool loop that never writes', () => {
  it('flag OFF (unset): every step is a tool call, the turn ends with finishReason tool-calls and the answer is EMPTY', async () => {
    const r = await run(LEGACY)
    expect(usageLine(r.logs)).toMatchObject({ finishReason: 'tool-calls' })
    expect(r.answer).toBe(''); expect(r.summary.problems.join(' | ')).toContain('empty answer')
    expect(net.serper).toBeGreaterThanOrEqual(3) // every step searched
  })
  it('flag "0" is OFF too: the same empty turn (any other value than 0 or 1 is refused by the preflight; the product reads only the exact "1" as ON: consultFlags tests)', async () => {
    const r = await run({ ...LEGACY, CONSULT_FINAL_SYNTHESIS: '0' })
    expect(r.answer).toBe('')
  })
  it('flag ON, the model obeys the note: the last step WRITES, the last tool call ran no search, the step count and the model-call count are the same as OFF', async () => {
    const off = await run(LEGACY)
    const offAnswerCalls = net.answerCalls, offSerper = net.serper
    __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); net.answerCalls = 0; net.serper = 0; net.queryN = 0
    const on = await run({ ...LEGACY, CONSULT_FINAL_SYNTHESIS: '1' })
    expect(usageLine(on.logs)).toMatchObject({ finishReason: 'stop' })
    expect(on.answer.length).toBeGreaterThan(20); expect(on.answer).toContain('chưa tìm thấy số liệu chính thức')
    expect(on.summary.problems).toEqual([])
    expect(net.answerCalls).toBe(offAnswerCalls) // the step budget is unchanged: the same number of model steps
    expect(net.serper).toBe(offSerper - 2) // the guarded step and the writing step made no search (maxSteps 5 → 3 searches instead of 5)
    expect(on.logs.filter(l => l.includes('tappyai_final_synthesis_guard'))).toHaveLength(1)
    expect(on.summary.requestCap).toMatchObject({ sent: net.serper, refused: 0 })
    expect(on.file.turns[0].cost.usd).toBeLessThanOrEqual(0.05); expect(on.summary.costState).toBe('known')
    expect(on.file.turns[0].refusals).toBe(0)
    void off
  })
  it('flag ON, the model ignores the note and keeps calling tools: ONE honest sentence about the evidence ships (no place or shopping words), not an empty answer', async () => {
    net.stubborn = true
    const r = await run({ ...LEGACY, CONSULT_FINAL_SYNTHESIS: '1' })
    expect(usageLine(r.logs)).toMatchObject({ finishReason: 'tool-calls' })
    expect(r.answer).toContain('chưa có đủ bằng chứng đáng tin'); expect(r.answer).not.toMatch(PLACE_WORDS)
    expect(r.logs.some(l => l.includes('"guard":"empty_reply_neutral"'))).toBe(true)
    expect(r.summary.problems).toEqual([])
  })
})

/** A question whose wording makes the router treat it as a lookup of "where" (the consult FRAME runs and the buffered guards run) although the need has no domain. Written for this test. */
const FRAMED: UatTurn[] = [{ id: 'S2', conversation: 'S2', turn: 1, text: 'Nop ho so dang ky mot thu tuc o dau va can nhung giay to gi?' }]
async function runTurns(env: Record<string, string | undefined>, turns: UatTurn[]): Promise<Run> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ').slice(0, 4000)) }))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const f = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  const file = f ? JSON.parse(f[1]) : null
  return { summary: out.summary, file, logs, answer: file?.turns?.[0]?.answer ?? '', text: formatSummary(out.summary) }
}
const events = (logs: string[]) => logs.map(l => (l.match(/"type":"([a-z_0-9]+)"/)?.[1] ?? '') + (l.includes('"guard"') ? ':' + (l.match(/"guard":"([a-z_0-9]+)"/)?.[1] ?? '') : '') + (l.includes('"step"') ? ':' + (l.match(/"step":"([a-z_0-9]+)"/)?.[1] ?? '') : '')).join(' ')

describe('consult path, live turn (no frame, nothing buffered): the reply that ships empty', () => {
  it('flag OFF: EMPTY (no guard runs on a live turn)', async () => {
    net.stubborn = true
    const r = await run(CONSULT)
    expect(r.answer).toBe('')
  })
  it('flag ON: one honest sentence, sent as the reply (empty_reply_neutral, live), no place words; a model that obeys the note writes its own answer', async () => {
    net.stubborn = true
    const r = await run({ ...CONSULT, CONSULT_FINAL_SYNTHESIS: '1' })
    expect(r.answer).toContain('chưa có đủ bằng chứng đáng tin'); expect(r.answer).not.toMatch(PLACE_WORDS)
    expect(r.logs.some(l => l.includes('"guard":"empty_reply_neutral"') && l.includes('"live":true'))).toBe(true)
    __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); net.stubborn = false; net.queryN = 0
    const obey = await run({ ...CONSULT, CONSULT_FINAL_SYNTHESIS: '1' })
    expect(usageLine(obey.logs)).toMatchObject({ finishReason: 'stop' }); expect(obey.answer).toContain('chưa tìm thấy số liệu chính thức')
    expect(obey.logs.some(l => l.includes('empty_reply_neutral') || l.includes('empty_reply_fallback'))).toBe(false)
  })
})

describe('consult path, framed turn without a domain (buffered guards): the canned sentence in card language', () => {
  it('flag OFF: the old gap sentence about cards, opening hours and price (empty_reply_fallback)', async () => {
    net.stubborn = true
    const r = await runTurns(CONSULT, FRAMED)
    expect(r.answer, events(r.logs)).toMatch(/thẻ/); expect(r.logs.some(l => l.includes('empty_reply_fallback'))).toBe(true)
  })
  it('flag ON: the honest sentence about the evidence instead (empty_reply_neutral); no card, hours or price words', async () => {
    net.stubborn = true
    const r = await runTurns({ ...CONSULT, CONSULT_FINAL_SYNTHESIS: '1' }, FRAMED)
    expect(r.answer, events(r.logs)).toContain('chưa có đủ bằng chứng đáng tin'); expect(r.answer).not.toMatch(PLACE_WORDS)
    expect(r.logs.some(l => l.includes('empty_reply_neutral'))).toBe(true); expect(r.logs.some(l => l.includes('empty_reply_fallback'))).toBe(false)
  })
})

describe('a turn with a normal single search is not touched by the flag', () => {
  it('flag ON: a model that searches once and writes ends exactly as with the flag OFF (same answer calls, same searches)', async () => {
    // a model that stops after its first result
    const normal = (async (input: unknown, init?: { body?: unknown }) => {
      const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
      if (u.hostname === 'api.openai.com') {
        const body = JSON.parse(String(init?.body ?? '{}')); const inc = body.stream_options?.include_usage === true
        if (body.response_format) return jsonCompletion(INTENT, usage(1000, 100))
        if (body.stream !== true) return jsonCompletion('{}', usage(300, 10))
        net.answerCalls++
        const msgs: Array<{ role: string }> = body.messages ?? []
        const tools: string[] = (body.tools ?? []).map((t: { function?: { name: string } }) => t.function?.name)
        if (tools.includes('web_search') && !msgs.some(m => m.role === 'tool')) return toolStream('web_search', { query: 'tim hieu mot van de don gian' }, inc)
        return textStream('Cau tra loi ngan co nguon.', inc)
      }
      if (u.hostname === 'google.serper.dev') { net.serper++; return new Response(JSON.stringify({ organic: [{ title: 'KQ', link: 'https://example.com/x', snippet: 'DT' }], credits: 1 }), { status: 200 }) }
      throw new Error('UNEXPECTED host: ' + u.hostname)
    }) as typeof fetch
    const runWith = async (flag: string | undefined) => {
      __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap(); net.answerCalls = 0; net.serper = 0
      for (const [k, v] of Object.entries({ ...LEGACY, CONSULT_FINAL_SYNTHESIS: flag })) vi.stubEnv(k, v)
      const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
      const fs = memFs()
      let out
      try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: normal, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
      if (out.kind !== 'ran') throw new Error('refused')
      const file = JSON.parse([...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))![1])
      return { answer: file.turns[0].answer as string, answerCalls: net.answerCalls, serper: net.serper }
    }
    const a = await runWith(undefined), b = await runWith('1')
    expect(b).toEqual(a); expect(a.answer).toContain('Cau tra loi ngan co nguon.')
  })
})
