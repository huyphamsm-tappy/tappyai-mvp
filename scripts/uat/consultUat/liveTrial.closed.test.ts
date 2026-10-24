// @vitest-environment node
// Round 3a, item 5 · the shared "closed" state of the live trial's network wrappers. MOCK-ONLY: the network is `fetchImpl` (a fake that records what reaches it); global
// fetch and node:http(s) are tripwires; no real route is loaded (the turn is a tiny `post` that makes the calls we want to look at).
//
// Rule under test: the moment the turn is over - BEFORE the drain and before the process tree is ended - every wrapper is CLOSED. Each wrapper looks at that state AT
// EVERY CALL, so a function reference that was taken while the turn was open (a library that kept `fetch`, a callback scheduled for later) is blocked too, whichever
// host it asks for (the two allowed hosts included). A blocked request is recorded and never reaches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { formatSummary, runLiveTrial, type LiveTrialInput, type TrialOutcome } from './liveTrial'
import { memFs } from './liveRunner.testkit'

const OPENAI = 'https://api.openai.com/v1/chat/completions'
const SERPER = 'https://google.serper.dev/search'
const reached: string[] = []
const fakeNetwork = (async (input: unknown) => { reached.push(String(input instanceof URL ? input.href : input)); return new Response('{}', { status: 200 }) }) as typeof fetch

const BASE_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.05', BENCH_CONFIRM_SPEND: '0.05',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '40', CONSULT_REQUEST_CAP_PER_RUN: '500', // armed (liveTrial.ts requestCapReasons); far above what these turns send
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/question.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-round3a-rehearsal',
  OPENAI_API_KEY: 'sk-test-SECRET-123', SERPER_API_KEY: 'serper-SECRET-456',
  CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
}
const NAMES = [...BENCH_FLAG_NAMES, 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'BENCH_LIVE_TRIAL', 'CI',
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NODE_USE_ENV_PROXY', 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']
const ANSWER = '0:"ok"\nd:{"finishReason":"stop"}\n'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const originalFetch = globalThis.fetch
const savedNode = { hr: https.request, hg: https.get, tr: http.request, tg: http.get }
const nodeCalls: string[] = []
beforeEach(() => {
  reached.length = 0; nodeCalls.length = 0
  for (const k of NAMES) vi.stubEnv(k, undefined)
  for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v)
  __resetBenchProcessGuardForTests()
  // tripwires: the REAL network is never reachable
  globalThis.fetch = (async () => { throw new Error('TRIPWIRE: global fetch used outside the wrapper') }) as typeof fetch
  for (const [name, mod] of [['https', https], ['http', http]] as const) for (const fn of ['request', 'get'] as const) (mod as unknown as Record<string, unknown>)[fn] = (...a: unknown[]) => { nodeCalls.push(`${name}.${fn} ${String(a[0])}`); throw new Error('TRIPWIRE: node network used outside the wrapper') }
})
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks(); globalThis.fetch = originalFetch
  https.request = savedNode.hr; https.get = savedNode.hg; http.request = savedNode.tr; http.get = savedNode.tg
  __resetBenchProcessGuardForTests()
})

const run = async (post: (req: never) => Promise<Response>, over: Partial<LiveTrialInput> = {}): Promise<TrialOutcome> =>
  runLiveTrial({ env: process.env, post: post as never, fetchImpl: fakeNetwork, fs: memFs(), readTextFile: () => 'Câu hỏi thử ngoài bộ nghiệm thu về thời tiết hôm nay?', repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, ...over })
const ranOk = (o: TrialOutcome) => { if (o.kind !== 'ran') throw new Error(`expected a run, got ${JSON.stringify(o)}`); return o }
const okResponse = () => new Response(ANSWER)

for (const mode of ['restore', 'deny'] as const) {
  describe(`afterTrial: "${mode}" · a wrapper reference taken while the turn was OPEN is closed afterwards`, () => {
    it('a held fetch reference: a call after the turn to an ALLOWED host is blocked, recorded, and never reaches the network', async () => {
      let held: typeof fetch | null = null
      const post = async () => { held = globalThis.fetch; await held(OPENAI, { method: 'POST' }); return okResponse() } // during the turn the allowed host is reachable
      const out = ranOk(await run(post, { afterTrial: mode }))
      try {
        expect(reached).toEqual([OPENAI]) // only the in-turn request
        await expect(held!(OPENAI, { method: 'POST' })).rejects.toThrow(/closed/i)
        await expect(held!(SERPER)).rejects.toThrow(/closed/i)
        await expect(held!('https://evil.example/x')).rejects.toThrow(/closed/i)
        expect(reached).toEqual([OPENAI])
        expect(out.controls.lateAttempts().join(' ')).toMatch(/api\.openai\.com/)
        expect(out.controls.lateAttempts().join(' ')).toMatch(/google\.serper\.dev/)
        expect(out.controls.lateAttempts().join(' ')).toMatch(/evil\.example/)
      } finally { out.controls.release() }
    })
    it('held node:https / node:http references (request and get): blocked after the turn, the originals are never reached', async () => {
      const held: { hr?: typeof https.request; hg?: typeof https.get; tr?: typeof http.request; tg?: typeof http.get } = {}
      const post = async () => { held.hr = https.request; held.hg = https.get; held.tr = http.request; held.tg = http.get; return okResponse() }
      const out = ranOk(await run(post, { afterTrial: mode }))
      try {
        expect(() => held.hr!('https://api.openai.com/v1/chat/completions')).toThrow(/closed/i)
        expect(() => held.hg!({ hostname: 'google.serper.dev', path: '/search' })).toThrow(/closed/i)
        expect(() => held.tr!('http://evil.example/x')).toThrow(/closed/i)
        expect(() => held.tg!('http://evil.example/y')).toThrow(/closed/i)
        expect(nodeCalls).toEqual([]) // the tripwire originals were never called
        expect(out.controls.lateAttempts()).toHaveLength(4)
      } finally { out.controls.release() }
    })
    it('deferred background work: a callback scheduled INSIDE the drain window and one scheduled AFTER it are both blocked', async () => {
      let held: typeof fetch | null = null
      const results: string[] = []
      const post = async () => {
        held = globalThis.fetch
        setTimeout(() => { void held!(OPENAI, { method: 'POST' }).then(() => results.push('inside:sent'), () => results.push('inside:blocked')) }, 20)
        setTimeout(() => { void held!(SERPER).then(() => results.push('after:sent'), () => results.push('after:blocked')) }, 220)
        return okResponse()
      }
      const out = ranOk(await run(post, { afterTrial: mode, drainMs: 100 }))
      try {
        expect(results).toEqual(['inside:blocked']) // the drain has passed: the first one was already blocked, the second has not run yet
        expect(out.summary.lateBlocked.join(' ')).toMatch(/api\.openai\.com/)
        expect(out.summary.trialClean).toBe(false) // late work is reported: it is not a complete, quiet trial
        expect(formatSummary(out.summary)).toMatch(/NOT CLEAN[^\n]*late/i)
        await sleep(200)
        expect(results).toEqual(['inside:blocked', 'after:blocked'])
        expect(out.controls.lateAttempts().join(' ')).toMatch(/google\.serper\.dev/)
        expect(reached).toEqual([]) // nothing at all reached the network (the turn itself made no request)
      } finally { out.controls.release() }
    })
  })
}

describe('the closed state is set BEFORE the drain, and the turn itself is not affected', () => {
  it('a request made during the drain window to an ALLOWED host is not sent (the drain only watches, it no longer lets requests through)', async () => {
    let held: typeof fetch | null = null
    let drainAttempt: Promise<unknown> | null = null
    const post = async () => { held = globalThis.fetch; setTimeout(() => { drainAttempt = held!(OPENAI, { method: 'POST' }).catch(e => String(e)) }, 30); return okResponse() }
    const out = ranOk(await run(post, { drainMs: 120 }))
    expect(await drainAttempt).toMatch(/closed/i)
    expect(reached).toEqual([])
    expect(out.summary.hostRequests).toEqual({}) // nothing was SENT; the late attempt is not counted as sent
  })
  it('requests during the turn are admitted and counted exactly as before (host counts, blocked host list, redirects)', async () => {
    const post = async () => { await fetch(OPENAI, { method: 'POST' }); await fetch(SERPER); try { await fetch('https://evil.example/x') } catch { /* blocked */ } return okResponse() }
    const out = ranOk(await run(post))
    expect(reached).toEqual([OPENAI, SERPER])
    expect(out.summary.hostRequests).toEqual({ 'api.openai.com': 1, 'google.serper.dev': 1 })
    expect(out.summary.hostsBlocked).toEqual(['evil.example'])
    expect(out.summary.lateBlocked).toEqual([])
  })
  it('review: when runBench itself THROWS (the turn record cannot be saved) the wrappers are closed too (the finally branch)', async () => {
    let held: typeof fetch | null = null
    const fs = memFs()
    const realAppend = fs.append
    fs.append = (p, t) => { if (!t.includes('"started"')) throw new Error('disk full'); realAppend(p, t) }
    const post = async () => { held = globalThis.fetch; return okResponse() }
    await expect(run(post, { fs })).rejects.toThrow()
    await expect(held!(OPENAI, { method: 'POST' })).rejects.toThrow(/closed/i)
    expect(reached).toEqual([])
  })
  it('a turn whose route fails (runBench catches it and returns a record) closes the wrappers too', async () => {
    let held: typeof fetch | null = null
    const post = async (): Promise<Response> => { held = globalThis.fetch; throw new Error('the route failed') }
    const out = await run(post)
    expect(out.kind).toBe('ran')
    await expect(held!(OPENAI, { method: 'POST' })).rejects.toThrow(/closed/i)
    expect(reached).toEqual([])
    if (out.kind === 'ran') out.controls.release()
  })
})
