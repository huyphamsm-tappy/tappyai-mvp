// @vitest-environment node
// Unwind (28/10) - the twelve CONSULT_UNWIND_S1A..S4B flags are REGISTERED in the launcher and the trial (Owner, prompt "một mạch": names only, as 69449de), passed to the child with
// their value, shown at Gate 1 / in the preflight with the state the product REALLY has, and the launcher's refusal of any other setting-like name is exactly as strong as before.
// CONSULT_UNWIND_S5 (Exa) is NOT registered: the bench network wall does not reach api.exa.ai. MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import * as flags from '@/lib/config/consultFlags'
import { WAVE2_FLAGS, wave2FlagState } from './liveTrial'
import { conditionReport } from './preflightReport'
import { FLAG_ENV_NAMES, WAVE2_FLAG_NAMES, buildChildEnv, gate1Summary, launcherRefusals, wave2Line } from './liveTrialLauncher.mjs'

const IDS = ['S1A', 'S1B', 'S1C', 'S1D', 'S2A', 'S2B', 'S2C', 'S3A', 'S3B', 'S3C', 'S4A', 'S4B'] as const
const fn = (id: string) => (flags as unknown as Record<string, (env: Record<string, string | undefined>) => boolean>)[`consultUnwind${id[0]}${id.slice(1).toLowerCase()}On`]
const U = Object.fromEntries(IDS.map(id => [`CONSULT_UNWIND_${id}`, fn(id)])) as Record<string, (env: Record<string, string | undefined>) => boolean>
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave3/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const ALL_ON = Object.fromEntries(Object.keys(U).map(k => [k, '1']))
const CHILD = { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true }
const preflightLine = (name: string) => conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith(name))!
const notPassed = (k: string) => `${k} is set but is not one of the variables the trial passes on`
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap()
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

describe('Unwind flags: registered in every list the trial keeps', () => {
  it('the twelve names are the product\'s own flag functions, and each is in the four lists; the lists agree as wholes, each name once', () => {
    for (const [k, on] of Object.entries(U)) {
      expect(typeof on, k).toBe('function')
      expect((flags as unknown as Record<string, string>)[`${k}_FLAG`], k).toBe(k)
      expect(WAVE2_FLAGS, k).toContain(k); expect(WAVE2_FLAG_NAMES, k).toContain(k); expect(BENCH_FLAG_NAMES, k).toContain(k); expect(FLAG_ENV_NAMES, k).toContain(k)
    }
    expect([...WAVE2_FLAG_NAMES]).toEqual([...WAVE2_FLAGS])
    expect([...FLAG_ENV_NAMES].sort()).toEqual([...BENCH_FLAG_NAMES].sort())
    for (const list of [WAVE2_FLAGS, WAVE2_FLAG_NAMES, BENCH_FLAG_NAMES, FLAG_ENV_NAMES]) expect(new Set(list).size).toBe(list.length)
  })
  it('S5 (Exa) is not registered, and set it is refused by name and never reaches the child', () => {
    for (const list of [WAVE2_FLAGS, WAVE2_FLAG_NAMES, BENCH_FLAG_NAMES, FLAG_ENV_NAMES]) expect(list).not.toContain('CONSULT_UNWIND_S5')
    const env = { ...EXT, CONSULT_UNWIND_S5: '1' }
    expect(launcherRefusals(env).join(' | ')).toContain(notPassed('CONSULT_UNWIND_S5'))
    expect('CONSULT_UNWIND_S5' in buildChildEnv(env, CHILD)).toBe(false)
  })
  it('set to "1": the child gets "1" and the launcher does not refuse it; unset stays unset', () => {
    for (const k of Object.keys(U)) {
      expect(buildChildEnv({ ...EXT, [k]: '1' }, CHILD)[k], k).toBe('1')
      expect(launcherRefusals({ ...EXT, [k]: '1' }).join(' | '), k).not.toContain(notPassed(k))
      expect(k in buildChildEnv({ ...EXT }, CHILD), k).toBe(false)
    }
    expect(launcherRefusals({ ...EXT, ...ALL_ON })).toEqual([])
  })
})

describe('Unwind flags: the refusal of any other setting is not weakened', () => {
  it('near look-alikes and other families are still refused by name and never reach the child', () => {
    for (const k of ['CONSULT_UNWIND_S1', 'CONSULT_UNWIND_S1E', 'CONSULT_UNWIND_S2A2', 'CONSULT_UNWIND', 'CONSULT_UNWIND_S4C', 'CONSULT_UNWIND_ALL', 'TAPPY_NEW_SWITCH', 'LLM_SOMETHING_NEW', 'BENCH_NEW_KNOB']) {
      const env = { ...EXT, ...ALL_ON, [k]: '1' }
      expect(launcherRefusals(env).join(' | '), k).toContain(notPassed(k))
      expect(k in buildChildEnv(env, CHILD), k).toBe(false)
    }
  })
  it('a value other than 0 / 1 fails the preflight by name', () => {
    for (const k of Object.keys(U)) {
      vi.unstubAllEnvs()
      for (const [n, v] of Object.entries({ ...EXT, [k]: 'yes' })) vi.stubEnv(n, v)
      const w2 = preflightLine('wave-2 behaviour flags')
      expect(w2.ok, k).toBe(false)
      expect(w2.detail, k).toContain(`${k} must be exactly 1, 0 or unset`)
    }
  })
})

describe('Unwind flags: the state shown is the state the product really has', () => {
  it('trial state, Gate 1 line and the product functions agree for every level x value; not tied to the level', () => {
    for (const l of [undefined, '0', '2', '4']) for (const w of [undefined, '0', '1', 'true']) {
      const env: Record<string, string | undefined> = { ...(l === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: l }), ...(w === undefined ? {} : Object.fromEntries(Object.keys(U).map(k => [k, w]))) }
      const st = wave2FlagState(env)
      const line = wave2Line({ ...EXT, ...env })
      for (const [k, on] of Object.entries(U)) {
        expect(st[k] === 'ON', `${k} level=${l} flag=${w}`).toBe(on(env))
        const shown = new RegExp(`${k}=\\S+ \\(([^)]*)\\)`).exec(line)![1]!
        expect(shown.startsWith('BẬT'), `${k} line level=${l} flag=${w}: ${shown}`).toBe(on(env))
      }
    }
  })
  it('Gate 1 and the preflight of the dev run shape (L2 + every unwind flag)', () => {
    const env = { ...EXT, CONSULT_CAPABILITY_LEVEL: '2', CONSULT_FINAL_SYNTHESIS: '1', ...ALL_ON }
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    const gate = gate1Summary(env, null).join('\n')
    for (const k of Object.keys(U)) expect(gate, k).toContain(`${k}=1 (BẬT)`)
    const w2 = preflightLine('wave-2 behaviour flags')
    expect(w2.ok).toBe(true)
    for (const k of Object.keys(U)) expect(w2.detail, k).toContain(`${k}=1 (ON)`)
  })
})
