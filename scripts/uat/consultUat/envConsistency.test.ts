// @vitest-environment node
// Pre-baseline hardening · the environment and the spend gate must say the SAME thing in every place that reads them: the preflight, the runner, the per-call gate
// and the launcher. MOCK ONLY (no network, no key). Pins: mode × caps agree across the three evaluators; BENCH_CONFIRM_SPEND must equal the run cap; a missing or
// misspelled request-cap variable is refused by name; the launcher passes the new variables on and refuses a typo instead of dropping it silently; a mode that
// differs between the environment that was checked and the one the app reads fails CLOSED (the paid call is refused, never allowed).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { benchModeOf, readBenchCaps, reserveSpend } from '@/lib/ai/budget/spendGate'
import { BENCH_FLAG_NAMES, BenchRefusal, __resetBenchProcessGuardForTests, createBenchRunner } from './liveRunner'
import { preflight, requestCapReasons } from './liveTrial'
import { GOOD_ENV, applyEnv, options, turnTransport } from './liveRunner.testkit'
import { buildChildEnv, launcherRefusals, FLAG_ENV_NAMES, TRIAL_ENV_NAMES } from './liveTrialLauncher.mjs'

const REPO = 'D:/TappyAI-wt/wt-integration'
const CAP = { CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450' }

beforeEach(() => { __resetBenchProcessGuardForTests(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('TRIPWIRE: a real request must never be made') })) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); applyEnv({}); delete process.env.BENCH_TRIAL_MODE; __resetBenchProcessGuardForTests() })

const fullEnv = (over: Record<string, string | undefined>): Record<string, string | undefined> => ({
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.65', BENCH_CONFIRM_SPEND: '0.65', BENCH_TRIAL_MODE: undefined, ...CAP,
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-prebaseline/mock-out', ...over,
})

describe('mode × caps: the preflight, the runner and the per-call gate give the SAME verdict on the SAME environment', () => {
  const modes: Array<string | undefined> = [undefined, '', 'dev-multi', 'Dev-Multi', 'dev-multi ', 'extension']
  const runs = ['0.65', '0.7', '1.75', '1.76']
  const turns = ['0.05', '0.10', '0.11']
  for (const mode of modes) for (const run of runs) for (const turn of turns) {
    const expected = Number(turn) <= 0.10 && Number(run) <= (mode === 'dev-multi' ? 1.75 : 0.65)
    it(`mode ${JSON.stringify(mode)} · run ${run} · turn ${turn} → ${expected ? 'accepted' : 'refused'} by all three`, () => {
      const env = fullEnv({ BENCH_TRIAL_MODE: mode, BENCH_SPEND_RUN_CAP_USD: run, BENCH_CONFIRM_SPEND: run, BENCH_SPEND_TURN_CAP_USD: turn })
      expect(benchModeOf(env)).toBe(mode === 'dev-multi' ? 'extension' : 'acceptance')
      // 1. the preflight
      expect(preflight(env, REPO, []).caps !== null, 'preflight').toBe(expected)
      // 2. the per-call gate (what every paid call is judged by)
      expect(readBenchCaps(env) !== null, 'readBenchCaps').toBe(expected)
      // 3. the runner, with the environment the app reads (process.env) equal to the one that was checked
      const proc: Record<string, string | undefined> = { ...GOOD_ENV, BENCH_SPEND_TURN_CAP_USD: turn, BENCH_SPEND_RUN_CAP_USD: run }
      applyEnv(proc)
      if (mode === undefined) delete process.env.BENCH_TRIAL_MODE; else process.env.BENCH_TRIAL_MODE = mode
      const runnerEnv = { ...proc, ...(mode === undefined ? {} : { BENCH_TRIAL_MODE: mode }) }
      const { opts } = options({ chat: turnTransport().chat, turnCapUsd: Number(turn), runCapUsd: Number(run), confirmSpend: { capUsd: Number(run) } }, runnerEnv)
      let accepted = true
      try { createBenchRunner(opts) } catch (e) { if (!(e instanceof BenchRefusal)) throw e; accepted = false }
      expect(accepted, 'runner').toBe(expected)
    })
  }
})

describe('BENCH_CONFIRM_SPEND must equal the run cap exactly', () => {
  const reasons = (over: Record<string, string | undefined>) => preflight(fullEnv({ BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75', ...over }), REPO, []).reasons.join(' | ')
  it('equal → no confirmation reason', () => { expect(reasons({})).not.toContain('BENCH_CONFIRM_SPEND') })
  it.each(['1.74', '0.65', '1.7500001', '1.750', ' ', 'abc', undefined])('confirmation %j for a 1.75 run: refused', (c) => {
    // "1.750" is the same decimal as 1.75 (the comparison is on the exact decimal value, not the text) — the only equal spelling here
    const r = reasons({ BENCH_CONFIRM_SPEND: c })
    if (c === '1.750') expect(r).not.toContain('BENCH_CONFIRM_SPEND')
    else expect(r).toContain('BENCH_CONFIRM_SPEND is missing or is not exactly the run cap')
  })
})

describe('the request-cap variables: a missing or misspelled one is refused BY NAME', () => {
  it('all three present and valid → no reason', () => { expect(requestCapReasons(CAP)).toEqual([]) })
  it('flag only: both values named as missing', () => {
    const r = requestCapReasons({ CONSULT_REQUEST_CAP: '1' }).join(' | ')
    expect(r).toContain('CONSULT_REQUEST_CAP_PER_TURN')
    expect(r).toContain('CONSULT_REQUEST_CAP_PER_RUN')
    expect(r).not.toContain('CONSULT_REQUEST_CAP is not ON')
  })
  it('per-run missing only: only the per-run variable is named', () => {
    const r = requestCapReasons({ CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15' }).join(' | ')
    expect(r).toContain('CONSULT_REQUEST_CAP_PER_RUN')
    expect(r).not.toContain('CONSULT_REQUEST_CAP_PER_TURN')
  })
  it('a misspelled variable (CONSULT_REQUEST_CAP_PER_TURNS) leaves the real one missing → refused by the preflight AND refused by the launcher (it is not dropped silently)', () => {
    const typo = { CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURNS: '15', CONSULT_REQUEST_CAP_PER_RUN: '450' }
    expect(requestCapReasons(typo).join(' ')).toContain('CONSULT_REQUEST_CAP_PER_TURN is missing')
    const launcher = launcherRefusals(typo as Record<string, string>) as string[]
    expect(launcher.some(x => x.includes('CONSULT_REQUEST_CAP_PER_TURNS'))).toBe(true)
  })
})

describe('the launcher passes the settings on, exactly', () => {
  const parent = { ...CAP, BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75', PATH: 'x', SOME_OTHER_THING: 'must not pass' }
  it('the child gets the mode, the three request-cap variables and both caps and the confirmation; an unrelated variable is not passed', () => {
    const child = buildChildEnv(parent, { confirm: false, nonce: 'n'.repeat(32), preflightOnly: true }) as Record<string, string>
    for (const k of ['BENCH_TRIAL_MODE', 'BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'BENCH_CONFIRM_SPEND', 'CONSULT_REQUEST_CAP', 'CONSULT_REQUEST_CAP_PER_TURN', 'CONSULT_REQUEST_CAP_PER_RUN']) expect(child[k], k).toBe((parent as Record<string, string>)[k])
    expect(child.SOME_OTHER_THING).toBeUndefined()
    expect(launcherRefusals(parent as Record<string, string>)).toEqual([])
  })
  it('the launcher flag list equals the runner flag list, and BENCH_TRIAL_MODE / BENCH_CONFIRM_SPEND are in the trial list (one source of names in three places)', () => {
    expect([...FLAG_ENV_NAMES].sort()).toEqual([...BENCH_FLAG_NAMES].sort())
    expect(TRIAL_ENV_NAMES).toEqual(expect.arrayContaining(['BENCH_TRIAL_MODE', 'BENCH_CONFIRM_SPEND']))
  })
  it('BENCH_LIVE_TRIAL set in the shell is refused (the launcher sets it itself, for the child only)', () => {
    expect((launcherRefusals({ ...parent, BENCH_LIVE_TRIAL: 'x' } as Record<string, string>) as string[]).join(' ')).toContain('BENCH_LIVE_TRIAL')
  })
})

describe('a mode that differs between the environment that was CHECKED and the one the app READS fails closed', () => {
  it('the preflight saw dev-multi (1.75 accepted) but process.env has no mode: the per-call gate reads process.env, finds the acceptance maximum and REFUSES the paid call (no_caps)', () => {
    const checked = fullEnv({ BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75' })
    expect(preflight(checked, REPO, []).caps).toEqual({ turnUsd: 0.05, runUsd: 1.75 })
    vi.stubEnv('BENCH_SPEND_GATE', '1'); vi.stubEnv('BENCH_SPEND_TURN_CAP_USD', '0.05'); vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '1.75'); vi.stubEnv('BENCH_TRIAL_MODE', undefined)
    expect(() => reserveSpend('llm:test', 0.01)).toThrow(/caps are missing or invalid/)
  })
  it('the checked environment has NO mode: the preflight refuses 1.75 (the acceptance maximum applies; the preflight reads the environment it is given, not process.env)', () => {
    const checked = fullEnv({ BENCH_TRIAL_MODE: undefined, BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75' })
    expect(preflight(checked, REPO, []).caps).toBeNull()
  })
})
