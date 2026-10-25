// @vitest-environment node
// PROCESS-BOUNDARY PROOF · the PARENT half. It starts the REAL launcher (runLauncher in liveTrialLauncher.mjs: the real spawn, the real allow-listed child environment, the real
// nonce and marker filter) and points it at liveTrial.procproof.child.test.ts with the SAME command and loader the real trial child uses:
//     node node_modules/vitest/vitest.mjs run --project app <test file> --reporter=verbose --silent=false
// so the route, the quota module and runLiveTrial are loaded exactly as in a real run (vitest's fork worker, vite module runner, the '@' alias of vitest.config.ts).
// MOCK ONLY: the child's OpenAI answers are scripted through runLiveTrial's own fetchImpl seam; the allow-list is not widened; fake keys; nothing real is sent.
//
// What it proves, in a process of its own that is NOT the one running this file:
//   · route and runLiveTrial run in ONE process (one pid at module load, in the turn handler and in the network layer), by direct function call (no HTTP server)
//   · the quota module is evaluated ONCE and the '@/' alias and a relative import give the SAME module (same functions)
//   · with BENCH_TRIAL_MODE=dev-multi + BENCH_RESET_FREE_QUOTA_PER_TURN=1 the counter the ROUTE writes is the counter the RESET clears: 13 turns, no 429, the counter is 0 at the start
//     of every turn and 1 after it; with the flag missing the counter climbs 0..10 and turn 11 is refused with free_limit_reached
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { runLauncher, buildChildEnv } from './liveTrialLauncher.mjs'

const REPO = process.cwd()
const CHILD = 'scripts/uat/consultUat/liveTrial.procproof.child.test.ts'
const BASE_ENV: Record<string, string> = {
  PATH: process.env.PATH ?? '', Path: process.env.Path ?? '', SystemRoot: process.env.SystemRoot ?? '', TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '',
  USERPROFILE: process.env.USERPROFILE ?? '', APPDATA: process.env.APPDATA ?? '', LOCALAPPDATA: process.env.LOCALAPPDATA ?? '',
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-closure2/quota/procproof-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
for (const k of Object.keys(BASE_ENV)) if (BASE_ENV[k] === '') delete BASE_ENV[k]

interface Proof {
  pidAtLoad: number; pidInTest: number; postPids: number[]; fetchPids: number[]; fetchCalls: number; ppid: number; argv1: string; execArgv: string[]; isMainThread: boolean
  hasIpcChannel: boolean; vitestPoolId: string | null; vitestWorkerId: string | null; quotaModuleEvaluations: number; sameFunctionAliasVsRelative: boolean; counterIsAMap: boolean
  distributedStoreConfigured: boolean; storeLikeEnvNames: string[]
  startHits: number[]; endHits: number[]
  summary: { turnsRun: number; stopped: string | null; quotaReset: { on: boolean; reason: string; resets: number }; problems: string[]; hostsBlocked: string[]; requestCap: { sent: number; refused: number } }
}
async function viaLauncher(extra: Record<string, string>): Promise<{ proof: Proof; printed: string; code: number; childEnvHasKeyOrFlag: Record<string, boolean> }> {
  const env = { ...BASE_ENV, ...extra }
  const out: string[] = []
  const code = await runLauncher({
    env, repoRoot: REPO, print: (s: string) => out.push(s), timeLimitMs: 180_000, graceMs: 500,
    child: { file: process.execPath, args: [join(REPO, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--project', 'app', CHILD, '--reporter=verbose', '--silent=false'] },
    writeFile: () => undefined, makeDir: () => undefined, // the redacted copy of the child output is not written anywhere
  } as never)
  const printed = out.join('\n')
  const line = printed.split('\n').find(l => l.startsWith('PROCPROOF '))
  if (!line) throw new Error('the child produced no PROCPROOF line; launcher said:\n' + printed.slice(0, 1500))
  const ce = buildChildEnv(env, { confirm: true, nonce: 'a'.repeat(32) })
  return { proof: JSON.parse(line.slice('PROCPROOF '.length)), printed, code, childEnvHasKeyOrFlag: { flag: 'BENCH_RESET_FREE_QUOTA_PER_TURN' in ce, key: 'OPENAI_API_KEY' in ce } }
}

describe('the shared-store variables never reach the child (a reset cannot clear a shared store)', () => {
  it('KV_* / UPSTASH_* set in the shell are dropped by the launcher (not passed on, not refused) — and BENCH_RESET_FREE_QUOTA_PER_TURN is passed', () => {
    const shell = { ...BASE_ENV, KV_REST_API_URL: 'https://example.invalid', KV_REST_API_TOKEN: 'x', UPSTASH_REDIS_REST_URL: 'https://example.invalid', UPSTASH_REDIS_REST_TOKEN: 'y', BENCH_RESET_FREE_QUOTA_PER_TURN: '1' }
    const ce = buildChildEnv(shell, { confirm: true, nonce: 'a'.repeat(32) })
    for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) expect(k in ce, k).toBe(false)
    expect(ce.BENCH_RESET_FREE_QUOTA_PER_TURN).toBe('1')
  })
})

const canRun = !process.env.CI // the launcher refuses to run in CI by design
describe.skipIf(!canRun)('the real launcher → the real child process → the real route: one process, one quota counter', () => {
  it('flag ON (dev-multi + 1): the counter that the route writes is the counter the reset clears — 13 turns, no 429', async () => {
    const r = await viaLauncher({ BENCH_RESET_FREE_QUOTA_PER_TURN: '1' })
    const p = r.proof
    // 1 · ONE process, direct call: the same pid at module load, in the turn handler (route POST called as a function) and in the network layer; a forked vitest worker, not this process
    expect(new Set([p.pidAtLoad, p.pidInTest, ...p.postPids, ...p.fetchPids]).size).toBe(1)
    expect(p.pidInTest).not.toBe(process.pid)
    expect(p.hasIpcChannel).toBe(true) // a forked worker (vitest's default 'forks' pool), not the main process of the command
    expect(p.isMainThread).toBe(true)
    expect(p.postPids).toHaveLength(1); expect(p.fetchCalls).toBeGreaterThan(13)
    // 2 · the quota module: evaluated once; '@/…' and the relative path are the same module
    expect(p.quotaModuleEvaluations).toBe(1)
    expect(p.sameFunctionAliasVsRelative).toBe(true); expect(p.counterIsAMap).toBe(true)
    // 3a · no shared store in that process: the in-process counter is the only one the route can spend from
    expect(p.distributedStoreConfigured).toBe(false); expect(p.storeLikeEnvNames).toEqual([])
    // 3 · the reset reaches the counter the route spends from
    expect(p.summary.turnsRun).toBe(13); expect(p.summary.stopped).toBeNull()
    expect(p.summary.problems.join(' | ')).not.toMatch(/429|free_limit_reached/)
    expect(p.summary.quotaReset).toEqual({ on: true, reason: 'mode=dev-multi, flag=1', resets: 13 })
    expect(p.startHits).toEqual(Array(13).fill(0)); expect(p.endHits).toEqual(Array(13).fill(1))
    expect(p.summary.requestCap).toMatchObject({ sent: 0, refused: 0 }); expect(p.summary.hostsBlocked).toEqual([])
    expect(r.childEnvHasKeyOrFlag).toEqual({ flag: true, key: true }) // what the launcher passes on
    expect(r.printed).not.toContain('sk-test-not-a-real-key')
  }, 240_000)

  it('flag missing (dev-multi): the SAME counter climbs 0..10 and turn 11 is refused with free_limit_reached — the real limit', async () => {
    const r = await viaLauncher({})
    const p = r.proof
    expect(new Set([p.pidAtLoad, p.pidInTest, ...p.postPids, ...p.fetchPids]).size).toBe(1)
    expect(p.quotaModuleEvaluations).toBe(1)
    expect(p.summary.turnsRun).toBe(11)
    expect(p.summary.problems.join(' | ')).toContain('T11: error: HTTP 429: not an answer (error: free_limit_reached)')
    expect(p.summary.quotaReset).toEqual({ on: false, reason: 'mode=dev-multi, flag=unset', resets: 0 })
    expect(p.startHits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); expect(p.endHits).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10])
  }, 240_000)
})
