// @vitest-environment node
// Round 3d · Việc 3: does a reservation of a FINISHED turn stay in the books? Answer, by test: no. When a turn settles, its reservation is
// moved to 'settled' and only the reported cost is added to the known total (harness.ts settle, BudgetGuard). So the next turn is admitted on
// (known + reservation of the next turn), not on (known + every earlier reservation). MOCK-ONLY: the chat transport spends through the spend
// gate of its turn; the network is a fake; no key, no paid call.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reserveSpend } from '@/lib/ai/budget/spendGate'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { runLiveTrial, type TrialOutcome } from './liveTrial'
import { memFs } from './liveRunner.testkit'
import type { UatTurn } from './questions'

const BASE_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: '0.10',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '40', CONSULT_REQUEST_CAP_PER_RUN: '500', // armed (liveTrial.ts requestCapReasons); far above what these turns send
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/question.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-round3d-rehearsal',
  OPENAI_API_KEY: 'sk-test-SECRET-123', SERPER_API_KEY: 'serper-SECRET-456',
  CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
}
const ANSWER = '0:"ok"\nd:{"finishReason":"stop"}\n'
const OPENAI = 'https://api.openai.com/v1/chat/completions'
const turnsOf = (n: number): UatTurn[] => Array.from({ length: n }, (_, i) => ({ id: `B${i + 1}`, conversation: `B${i + 1}`, turn: 1, text: `câu thử số ${i + 1}` }))
const originalFetch = globalThis.fetch

beforeEach(() => {
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI']) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v)
  __resetBenchProcessGuardForTests()
  globalThis.fetch = (async () => { throw new Error('TRIPWIRE') }) as typeof fetch
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); globalThis.fetch = originalFetch; __resetBenchProcessGuardForTests() })

/** Each turn: one model call through the wrapper, one reservation of `reserveUsd` (the worst case), settled at `actualUsd`. */
const spend = (actualUsd: number | 'unknown', reserveUsd = 0.03) => {
  const calls = { n: 0 }
  const post = async () => {
    calls.n++
    await fetch(OPENAI, { method: 'POST' })
    const h = reserveSpend('llm:consult', reserveUsd)!
    if (actualUsd === 'unknown') h.markUnknown(); else h.settle(actualUsd, { tokensIn: 1, tokensOut: 1, cachedIn: 0 })
    return new Response(ANSWER)
  }
  return { post, calls }
}
const run = (post: never, turns: UatTurn[]): Promise<TrialOutcome> =>
  runLiveTrial({ env: process.env, post, fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch, fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns, afterTrial: 'deny' } as never)

describe('a settled turn releases its reservation: the next turn is admitted on the known total, not on every earlier reservation', () => {
  it('(a) turn 1 spends a small 0.004 (its per-call worst case is 0.03; the run guard holds the 0.05 turn cap): turn 2 is admitted and runs', async () => {
    const { post, calls } = spend(0.004)
    const out = await run(post as never, turnsOf(2))
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(calls.n).toBe(2)
    expect(out.summary.stopped).toBeNull()
    out.controls.release()
  })

  it('(b) known + the next turn\'s reservation never exceeds the run cap: with 0.02 spent per turn, turns 1-3 run and turn 4 is refused BEFORE its request', async () => {
    // known after k turns = 0.02k. Turn k+1 is admitted only if 0.02k + 0.05 (its turn cap) <= 0.10, i.e. k <= 2. So turns 1, 2, 3 run; turn 4 does not.
    const { post, calls } = spend(0.02, 0.05)
    const out = await run(post as never, turnsOf(11))
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(calls.n).toBe(3)
    expect(out.summary.stopped).toMatch(/budget-refused at B4/)
    expect(out.summary.usd).not.toBeNull()
    expect(out.summary.usd as number).toBeLessThanOrEqual(0.10)
    expect(out.summary.usd).toBeCloseTo(0.06, 6)
    out.controls.release()
  })

  // (c) pins the UNKNOWN path only (an unknown cost blocks the run). It does not pin the release of a settled reservation; (a), (b) and (d) do.
  it('(c) a cost that is unknown on turn 1 stops the run at once: turn 2 is not sent', async () => {
    const { post, calls } = spend('unknown')
    const out = await run(post as never, turnsOf(11))
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(calls.n).toBe(1)
    expect(out.summary.trialClean).toBe(false)
    out.controls.release()
  })

  it('(d) eleven turns at 0.004 each: all eleven run, the known total is 0.044, nothing is held back by earlier turns', async () => {
    const { post, calls } = spend(0.004, 0.03)
    const out = await run(post as never, turnsOf(11))
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(calls.n).toBe(11)
    expect(out.summary.turnsRun).toBe(11)
    expect(out.summary.stopped).toBeNull()
    expect(out.summary.usd).toBeCloseTo(0.044, 6)
    out.controls.release()
  })
})
