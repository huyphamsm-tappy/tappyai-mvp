// @vitest-environment node
// Closure round · the Serper REQUEST cap in the bench: the preflight condition, the L2 run total, the summary line, and a 13-turn REHEARSAL with a
// mock provider. MOCK-ONLY: no network, no key, no paid call, no Luna. The rehearsal has the STRUCTURE of the acceptance set (13 turns, 12
// conversations, one of them with a follow-up) taken from UAT_TURNS (ids / conversation / turn number only); the texts are fake ("[mock] <id>").
// The acceptance questions are never printed, copied or used to tune anything: this file only counts them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { serperPost } from '@/lib/ai/tools/serperClient'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap, closeRequestCapTurn, createRequestCapTurn, runWithRequestCapTurn } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { formatSummary, preflight, requestCapReasons, runLiveTrial, type TrialOutcome } from './liveTrial'
import { conditionReport, formatConditionReport } from './preflightReport'
import { memFs } from './liveRunner.testkit'
import { UAT_TURNS, type UatTurn } from './questions'

const OPENAI = 'https://api.openai.com/v1/chat/completions'
const SECRET_KEY = 'sk-test-SECRET-closure-1'
const SECRET_SERPER = 'serper-SECRET-closure-2'
const REPO = process.cwd()

/** The structure of the acceptance set with fake text. Nothing of the real wording is read into the output. */
const mockStructure = (): UatTurn[] => UAT_TURNS.map(t => ({ id: t.id, conversation: t.conversation, turn: t.turn, text: `[mock] ${t.id}` }))

beforeEach(() => {
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI']) vi.stubEnv(k, undefined)
  vi.stubEnv('BENCH_SPEND_GATE', '1')
  vi.stubEnv('BENCH_SPEND_TURN_CAP_USD', '0.05')
  vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '0.65')
  vi.stubEnv('BENCH_CONFIRM_SPEND', '0.65')
  vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '3'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '8')
  vi.stubEnv('BENCH_TRIAL_QUESTION_FILE', 'D:/fake/question.txt')
  vi.stubEnv('BENCH_TRIAL_OUT_DIR', 'D:/TappyAI-review-artifacts/consultative-closure/mock-out')
  vi.stubEnv('OPENAI_API_KEY', SECRET_KEY)
  vi.stubEnv('SERPER_API_KEY', SECRET_SERPER)
  vi.stubEnv('CONSULTATIVE_V1', '0'); vi.stubEnv('CONSULT_V2', '0')
  vi.stubEnv('BENCH_EXPECT_CONSULTATIVE_V1', '0'); vi.stubEnv('BENCH_EXPECT_CONSULT_V2', '0')
  __resetBenchProcessGuardForTests(); __resetRequestCap(); __clearToolCache()
  vi.stubGlobal('fetch', (async () => { throw new Error('TRIPWIRE: a real request must never be made') }) as typeof fetch)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests(); __resetRequestCap() })

describe('the preflight and the report know the request cap', () => {
  const armed = { CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '3', CONSULT_REQUEST_CAP_PER_RUN: '8' }
  it('armed: no reason', () => { expect(requestCapReasons(armed)).toEqual([]) })
  it.each([
    ['flag unset', { CONSULT_REQUEST_CAP_PER_TURN: '3', CONSULT_REQUEST_CAP_PER_RUN: '8' }, 'CONSULT_REQUEST_CAP is not ON'],
    ['flag 0', { ...armed, CONSULT_REQUEST_CAP: '0' }, 'CONSULT_REQUEST_CAP is not ON'],
    ['per-turn unset', { CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_RUN: '8' }, 'CONSULT_REQUEST_CAP_PER_TURN'],
    ['per-turn 0', { ...armed, CONSULT_REQUEST_CAP_PER_TURN: '0' }, 'CONSULT_REQUEST_CAP_PER_TURN'],
    ['per-turn 2.5', { ...armed, CONSULT_REQUEST_CAP_PER_TURN: '2.5' }, 'CONSULT_REQUEST_CAP_PER_TURN'],
    ['per-turn above the validation bound', { ...armed, CONSULT_REQUEST_CAP_PER_TURN: '101' }, 'CONSULT_REQUEST_CAP_PER_TURN'],
    ['per-run unset', { CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '3' }, 'CONSULT_REQUEST_CAP_PER_RUN'],
    ['per-run "abc"', { ...armed, CONSULT_REQUEST_CAP_PER_RUN: 'abc' }, 'CONSULT_REQUEST_CAP_PER_RUN'],
    ['per-run above the validation bound', { ...armed, CONSULT_REQUEST_CAP_PER_RUN: '5001' }, 'CONSULT_REQUEST_CAP_PER_RUN'],
  ])('%s → refused by name (never by value)', (_n, env, needle) => {
    const r = requestCapReasons(env)
    expect(r.length).toBeGreaterThan(0)
    expect(r.join(' ')).toContain(needle)
  })
  it('preflight() carries the request-cap reasons together with its other reasons', () => {
    const p = preflight({ ...process.env, CONSULT_REQUEST_CAP: undefined, CONSULT_REQUEST_CAP_PER_TURN: undefined, CONSULT_REQUEST_CAP_PER_RUN: undefined } as Record<string, string | undefined>, REPO, [])
    expect(p.reasons.some(r => r.includes('CONSULT_REQUEST_CAP is not ON'))).toBe(true)
  })
  it('the preflight report has a line for it: ĐẠT when armed, KHÔNG ĐẠT when not', () => {
    const base = { ...process.env } as Record<string, string | undefined>
    const ok = conditionReport({ env: base, repoRoot: REPO, execArgv: [], questionText: null }).find(c => c.name.startsWith('Serper request cap armed'))!
    expect(ok.ok).toBe(true)
    const off = conditionReport({ env: { ...base, CONSULT_REQUEST_CAP: undefined }, repoRoot: REPO, execArgv: [], questionText: null })
    const line = off.find(c => c.name.startsWith('Serper request cap armed'))!
    expect(line.ok).toBe(false)
    expect(formatConditionReport(off)).toMatch(/\[KHÔNG ĐẠT\] Serper request cap armed/)
  })
  it('the three variables are benchmark flags: the result records them (liveTrialLauncher.test.ts keeps the launcher list equal to this one)', () => {
    for (const n of ['CONSULT_REQUEST_CAP', 'CONSULT_REQUEST_CAP_PER_TURN', 'CONSULT_REQUEST_CAP_PER_RUN']) expect(BENCH_FLAG_NAMES).toContain(n)
  })
})

/**
 * A scripted provider for the rehearsal. Per turn: a cap turn object like the route's, `wanted(turnIndex)` Serper requests through the REAL serperPost
 * (so L1, L2 and the spend gate all act), one booked model call. No question text is looked at.
 */
function provider(wanted: (i: number) => number, llmUsd = 0.01) {
  let n = 0
  const post = async (req: unknown) => {
    const i = n++
    await (req as { json(): Promise<unknown> }).json()
    await fetch(OPENAI, { method: 'POST' }).catch(() => undefined)
    const cap = createRequestCapTurn()
    const results: Array<Response | null> = []
    const send = async () => { for (let k = 0; k < wanted(i); k++) results.push(await serperPost('search', SECRET_SERPER, { q: `[mock] q ${i}.${k}`, gl: 'vn', hl: 'vi', num: 8 }, 2000)) }
    if (cap) { await runWithRequestCapTurn(cap, send); closeRequestCapTurn(cap) } else await send()
    const h = reserveSpend('llm:consult', 0.03)!
    h.settle(llmUsd, { tokensIn: 1, tokensOut: 1, cachedIn: 0 })
    return new Response(`0:"answer ${i + 1}"\nd:{"finishReason":"stop"}\n`)
  }
  return { post, calls: () => n }
}
const serperFake = (async (input: unknown) => {
  const u = String(input instanceof URL ? input.href : input)
  if (u.includes('google.serper.dev')) return new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://example.com/a', snippet: 's' }], credits: 1 }), { status: 200 })
  return new Response('{}', { status: 200 })
}) as typeof fetch
const run = (post: unknown, turns: UatTurn[]): Promise<TrialOutcome> =>
  runLiveTrial({ env: process.env, post, fetchImpl: serperFake, fs: memFs(), repoRoot: REPO, now: () => 1_000, turns, afterTrial: 'deny' } as never)

describe('13-turn rehearsal with a mock provider (structure of the acceptance set, fake text)', () => {
  it('the structure is read correctly: 13 turns, 12 conversations, exactly one conversation has a follow-up', () => {
    const t = mockStructure()
    const conv = new Map<string, number>()
    for (const x of t) conv.set(x.conversation, (conv.get(x.conversation) ?? 0) + 1)
    expect(t).toHaveLength(13)
    expect(conv.size).toBe(12)
    expect([...conv.values()].filter(v => v === 2)).toHaveLength(1)
    expect(t.every(x => x.text.startsWith('[mock] '))).toBe(true)
  })

  it('turn count: all 13 turns run, in order, one record each', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '500')
    const turns = mockStructure()
    const m = provider(() => 1)
    const out = await run(m.post, turns)
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(m.calls()).toBe(13)
    expect(out.summary.turnsRun).toBe(13)
    expect(out.summary.turnRows.map(r => r.id)).toEqual(turns.map(t => t.id))
    expect(out.summary.stopped).toBeNull()
    expect(out.summary.benchmarkEligible).toBe(false) // fake text: never an acceptance result
  })

  it('L1 per turn: a turn that wants 5 requests sends 3 (cap 3); a turn that wants 2 sends 2', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '500')
    const m = provider(i => (i % 2 === 0 ? 5 : 2))
    const out = await run(m.post, mockStructure())
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    const rows = out.summary.turnRows.map(r => r.serper)
    expect(rows).toEqual(Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? 3 : 2)))
    expect(out.summary.hostRequests['google.serper.dev']).toBe(rows.reduce((a, b) => a + b, 0))
    expect(out.summary.requestCap.refused).toBe(7 * 2) // seven turns wanted 5 and were held to 3
    expect(out.summary.requestCap.sent).toBe(out.summary.hostRequests['google.serper.dev']) // the cap's count and the network wrapper's count agree
    expect(out.summary.trialClean).toBe(false) // a refused request means a search was not made: never a clean result
    expect(out.summary.warnings.join(' ')).toContain('request cap refused 14')
  })

  it('L2 per run: a run total of 8 stops the requests mid-run (turns still answer); the later turns send none', async () => {
    const m = provider(() => 3) // cap 3 per turn, 8 per run: turns 1-2 send 3, turn 3 sends 2, the rest 0
    const out = await run(m.post, mockStructure())
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(out.summary.turnRows.map(r => r.serper)).toEqual([3, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(out.summary.requestCap).toEqual({ perTurnLimit: 3, runLimit: 8, sent: 8, refused: 13 * 3 - 8 })
    expect(out.summary.hostRequests['google.serper.dev']).toBe(8)
    expect(out.summary.turnsRun).toBe(13)
    expect(out.summary.trialClean).toBe(false)
  })

  it('the spend gate (L3) still acts: a run cap of 0.10 USD with 0.03 per model call stops the run before its last turn, and nothing is sent after the stop', async () => {
    vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '0.10'); vi.stubEnv('BENCH_CONFIRM_SPEND', '0.10'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '500')
    const m = provider(() => 1, 0.03)
    const out = await run(m.post, mockStructure())
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(out.summary.turnsRun).toBeLessThan(13)
    expect(out.summary.stopped).not.toBeNull()
    expect(out.summary.trialClean).toBe(false)
    expect(out.summary.hostRequests['api.openai.com'] ?? 0).toBe(m.calls())
    expect(out.summary.hostRequests['google.serper.dev']).toBe(out.summary.turnsRun) // one Serper request per turn that ran
  })

  it('the summary names the request cap and leaks no key and no question text', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '500')
    const out = await run(provider(() => 1).post, mockStructure())
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    const text = formatSummary(out.summary)
    expect(text).toContain('request cap (a COUNT of Serper requests, not a price): per turn 3 | per run 500 | let through 13 | refused 0')
    expect(text).not.toContain(SECRET_KEY)
    expect(text).not.toContain(SECRET_SERPER)
    expect(out.summary.requestCap).toEqual({ perTurnLimit: 3, runLimit: 500, sent: 13, refused: 0 })
    expect(out.summary.trialClean).toBe(true)
  })

  it('the cap is checked AGAIN right before the first request: a flag that changes after the preflight (while the question file is read) sends nothing', async () => {
    const m = provider(() => 1)
    const out = await runLiveTrial({
      env: process.env, post: m.post, fetchImpl: serperFake, fs: memFs(), repoRoot: REPO, now: () => 1_000, afterTrial: 'deny',
      readTextFile: () => { vi.stubEnv('CONSULT_REQUEST_CAP', '0'); return 'câu hỏi thử số một về giá vé tàu hỏa tuyến Hà Nội đi Vinh ngày mai' },
    } as never)
    expect(m.calls()).toBe(0)
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(out.summary.turnOk).toBe(false)
    expect(out.summary.hostRequests['google.serper.dev'] ?? 0).toBe(0)
    expect(out.summary.problems.join(' ')).toMatch(/CONSULT_REQUEST_CAP/)
  })

  it('a run that is not armed is REFUSED before anything is sent (no flag → no run)', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', undefined)
    const m = provider(() => 1)
    const out = await run(m.post, mockStructure())
    expect(out.kind).toBe('refused')
    if (out.kind !== 'refused') return
    expect(out.reasons.join(' ')).toContain('CONSULT_REQUEST_CAP is not ON')
    expect(m.calls()).toBe(0)
  })
})
