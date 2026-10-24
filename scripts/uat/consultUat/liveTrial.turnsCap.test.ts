// @vitest-environment node
// Round 3c · Việc 2: the run cap across turns in ONE process, the stop rules, and the confirmation. MOCK-ONLY: the chat transport spends through
// the spend gate of its turn (reserveSpend / settle, or markUnknown); the network is a fake; no key, no paid call.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { runLiveTrial, type TrialOutcome } from './liveTrial'
import { memFs } from './liveRunner.testkit'
import type { UatTurn } from './questions'

const BASE_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: '0.10',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/question.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-round3c-rehearsal',
  OPENAI_API_KEY: 'sk-test-SECRET-123', SERPER_API_KEY: 'serper-SECRET-456',
  CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
}
const ANSWER = '0:"ok"\nd:{"finishReason":"stop"}\n'
const OPENAI = 'https://api.openai.com/v1/chat/completions'
const turnsOf = (n: number): UatTurn[] => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}`, conversation: `C${i + 1}`, turn: 1, text: `câu thử số ${i + 1}` }))
const fakeNetwork = (async () => new Response('{}', { status: 200 })) as typeof fetch
const originalFetch = globalThis.fetch

beforeEach(() => {
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI']) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v)
  __resetBenchProcessGuardForTests()
  globalThis.fetch = (async () => { throw new Error('TRIPWIRE') }) as typeof fetch
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); globalThis.fetch = originalFetch; __resetBenchProcessGuardForTests() })

/** A turn that spends `usd` on one model call (settled), or leaves its cost unknown. */
const spendingPost = (usd: number, unknownOnCall?: number) => {
  let call = 0
  const calls = { n: 0 }
  const post = async () => {
    call++; calls.n = call
    await fetch(OPENAI, { method: 'POST' }) // the model call goes through the wrapper, as in the app, so the sent count matches the ledger
    const h = reserveSpend('llm:consult', 0.03)!
    if (unknownOnCall === call) h.markUnknown(); else h.settle(usd, { tokensIn: 1, tokensOut: 1, cachedIn: 0 })
    return new Response(ANSWER)
  }
  return { post, calls }
}

const run = (post: never, turns: UatTurn[], over: Record<string, unknown> = {}): Promise<TrialOutcome> =>
  runLiveTrial({ env: process.env, post, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns, afterTrial: 'deny', ...over } as never)

describe('the run cap across turns in one process (the sum is never above the cap)', () => {
  it('the cap cuts in the middle: turn 3 is refused BEFORE its request, turns 4+ are not run, and the sum never exceeds the run cap', async () => {
    const { post, calls } = spendingPost(0.03)
    const out = await run(post as never, turnsOf(11))
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(calls.n).toBe(2) // turn 3 was refused before its request; no request for turns 4..11
    expect(out.summary.stopped).toMatch(/budget-refused/)
    expect(out.summary.trialClean, 'a run cut short is never a clean trial').toBe(false)
    // the reason it is not clean is the stop alone: the sent count equals the ledger, so no count warning hides anything
    expect(out.summary.warnings).toEqual([])
    expect(out.summary.hostRequests['api.openai.com']).toBe(calls.n)
    expect(out.summary.costState).toBe('known') // the sum is only meaningful when every turn that ran has a known cost
    expect(out.summary.usd).not.toBeNull()
    expect(out.summary.usd as number).toBeLessThanOrEqual(0.10)
    expect(out.summary.runValid).toBe(false)
    out.controls.release()
  })

  it('an unknown cost on turn 2 stops the run: turns 3+ are not sent', async () => {
    const { post, calls } = spendingPost(0.01, 2)
    const out = await run(post as never, turnsOf(11), { afterTrial: 'restore' })
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(calls.n).toBe(2)
    // the harness names a turn whose cost could not be booked "invalid-cost" (its runner reports NaN, harness.ts:354); "cost-unknown" is the
    // runner-throws case. Both are cost stops; the test accepts either name and nothing else.
    expect(out.summary.stopped).toMatch(/invalid-cost|cost-unknown/)
    expect(out.summary.trialClean).toBe(false)
    out.controls.release()
  })
})

describe('a turn that is not an answer stops the run, and the summary says so', () => {
  it('turn 2 answers with an HTTP error (not a thrown error): turns 3+ are not sent, and STOPPED names the halt (not "every turn ran")', async () => {
    let call = 0
    const post = async () => { call++; if (call === 2) return new Response('upstream error', { status: 500 }); return new Response(ANSWER) }
    const out = await run(post as never, turnsOf(4))
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(call).toBe(2)
    expect(out.summary.turnsRun).toBe(2)
    expect(out.summary.stopped).toMatch(/runner halted after 2 of 4 turns/)
    expect(out.summary.trialClean, 'a run cut short is never a clean trial').toBe(false)
    expect(out.summary.stopped).not.toBeNull()
    out.controls.release()
  })
})

describe('the confirmation must be exactly the RUN cap, not the turn cap', () => {
  it('BENCH_CONFIRM_SPEND = turn cap (0.05) while the run cap is 0.10: refused before any I/O', async () => {
    vi.stubEnv('BENCH_CONFIRM_SPEND', '0.05')
    const { post, calls } = spendingPost(0.01)
    const out = await run(post as never, turnsOf(2), { afterTrial: 'restore' })
    expect(out.kind).toBe('refused')
    expect(calls.n).toBe(0)
  })
})

describe('the dev summary says what it is and where it stopped', () => {
  it('a stopped dev run prints DEV RUN, the stop, one row per turn that ran, and "not an acceptance result"; no key appears', async () => {
    const { post } = spendingPost(0.03)
    const out = await run(post as never, turnsOf(11))
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    const { formatSummary } = await import('./liveTrial')
    const text = formatSummary(out.summary)
    expect(text).toMatch(/DEV RUN: 2\/11 turns ran \| STOPPED: budget-refused at C3/)
    expect(text).toMatch(/dev run, not an acceptance result/)
    expect(text).toMatch(/C1 \|/)
    expect(text).toMatch(/C2 \|/)
    expect(text).not.toMatch(/C3 \|/)
    expect(text).not.toMatch(/SECRET/)
    out.controls.release()
  })
})
