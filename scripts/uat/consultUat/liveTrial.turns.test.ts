// @vitest-environment node
// Round 3c · Việc 2: several turns in ONE process, each turn with its own "closed" state (turnScope.ts), and the whole run closed at the end.
// MOCK-ONLY: the network is a fake that records what reaches it; global fetch and node:http(s) are tripwires; no route is loaded: the chat
// transport (`post`) is a small stand-in that calls the wrappers the way the app would.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { runLiveTrial, type LiveTrialInput, type TrialOutcome } from './liveTrial'
import { memFs } from './liveRunner.testkit'
import type { UatTurn } from './questions'

const OPENAI = 'https://api.openai.com/v1/chat/completions'
const SERPER = 'https://google.serper.dev/search'
const reached: string[] = []
const fakeNetwork = (async (input: unknown) => { reached.push(String(input instanceof URL ? input.href : input)); return new Response('{}', { status: 200 }) }) as typeof fetch

const BASE_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: '0.10',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/question.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-round3c-rehearsal',
  OPENAI_API_KEY: 'sk-test-SECRET-123', SERPER_API_KEY: 'serper-SECRET-456',
  CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
}
const NAMES = [...BENCH_FLAG_NAMES, 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'BENCH_LIVE_TRIAL', 'CI',
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NODE_USE_ENV_PROXY', 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']
const ANSWER = '0:"ok"\nd:{"finishReason":"stop"}\n'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const originalFetch = globalThis.fetch
const savedNode = { hr: https.request, hg: https.get, tr: http.request, tg: http.get }
beforeEach(() => {
  reached.length = 0
  for (const k of NAMES) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v)
  __resetBenchProcessGuardForTests()
  globalThis.fetch = (async () => { throw new Error('TRIPWIRE: global fetch used outside the wrapper') }) as typeof fetch
})
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks(); globalThis.fetch = originalFetch
  https.request = savedNode.hr; https.get = savedNode.hg; http.request = savedNode.tr; http.get = savedNode.tg
  __resetBenchProcessGuardForTests()
})

const turnsOf = (n: number, conv = 'T'): UatTurn[] => Array.from({ length: n }, (_, i) => ({ id: `${conv}${i + 1}`, conversation: conv, turn: i + 1, text: `câu thử số ${i + 1}` }))

const run = async (post: (req: never) => Promise<Response>, turns: UatTurn[], over: Partial<LiveTrialInput> = {}): Promise<TrialOutcome> =>
  runLiveTrial({ env: process.env, post: post as never, fetchImpl: fakeNetwork, fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns, ...over } as LiveTrialInput)
const ranOk = (o: TrialOutcome) => { if (o.kind !== 'ran') throw new Error(`expected a run, got ${JSON.stringify(o)}`); return o }
const okResponse = () => new Response(ANSWER)

describe('(9) the request lifecycle across turns', () => {
  it('(9a) a valid request of turn 2 is sent normally while turn 1 is over', async () => {
    let call = 0
    const post = async () => { call++; if (call === 2) await fetch(OPENAI, { method: 'POST' }); return okResponse() }
    const out = ranOk(await run(post as never, turnsOf(2), { afterTrial: 'deny' }))
    expect(reached).toEqual([OPENAI])
    expect(out.summary.lateBlocked).toEqual([])
    if (out.kind === 'ran') out.controls.release()
  })

  it('(9b) a late task of turn 1 (a timer created in turn 1) tries to send while turn 2 is running: refused, not received, recorded; turn 2 is not harmed', async () => {
    let call = 0
    let turn2Result: string | null = null
    const post = async () => {
      call++
      if (call === 1) setTimeout(() => { void fetch(SERPER).catch(() => undefined) }, 30) // late task of turn 1
      if (call === 2) { await sleep(80); const r = await fetch(OPENAI, { method: 'POST' }); turn2Result = String(r.status) }
      return okResponse()
    }
    const out = ranOk(await run(post as never, turnsOf(2), { afterTrial: 'deny' }))
    expect(reached).toEqual([OPENAI]) // the turn-1 task never reached the network; the turn-2 request did
    expect(turn2Result).toBe('200')
    expect(out.summary.lateBlocked.join(' ')).toMatch(/google\.serper\.dev/)
    expect(out.summary.trialClean).toBe(false)
    if (out.kind === 'ran') out.controls.release()
  })

  it('(9c) after the whole run ended, a request to either allowed host is refused', async () => {
    let held: typeof fetch | null = null
    const post = async () => { held = globalThis.fetch; return okResponse() }
    const out = ranOk(await run(post as never, turnsOf(1), { afterTrial: 'deny' }))
    try {
      await expect(held!(OPENAI, { method: 'POST' })).rejects.toThrow(/closed/i)
      await expect(held!(SERPER)).rejects.toThrow(/closed/i)
      expect(reached).toEqual([])
    } finally { if (out.kind === 'ran') out.controls.release() }
  })
})

describe('(1) eleven turns in one process', () => {
  // The history carried between turns is checked where it is built (runUat / the runner), not here: this test checks that every turn runs and the
  // summary counts them. It does not claim to prove history.
  it('runs every turn, in order, and the summary counts all of them', async () => {
    const seen: number[] = []
    const post = async (req: { json?: () => Promise<unknown> } & Record<string, unknown>) => { seen.push(seen.length + 1); void req; return okResponse() }
    const out = ranOk(await run(post as never, turnsOf(11, 'D6'), { afterTrial: 'restore' }))
    expect(seen).toHaveLength(11)
    expect(out.summary.turnsRun).toBe(11)
    expect(out.summary.turnsTotal).toBe(11)
    expect(out.summary.stopped).toBeNull()
    expect(out.summary.runValid).toBe(false) // eleven turns is not the fixed benchmark set: never a valid benchmark run
  })
})
