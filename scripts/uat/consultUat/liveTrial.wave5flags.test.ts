// @vitest-environment node
// Wave 5 - CONSULT_PICK_PAGE_READ (W5-2) and CONSULT_READ_PAGE_LATE (W5-1) are REGISTERED in the launcher and the trial (Owner, 28/10: names only), passed to the child with their value,
// shown at Gate 1 / in the preflight with the state the product REALLY has, and the launcher's refusal of any other setting-like name is exactly as strong as before. MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { consultPickPageReadOn, consultReadPageLateOn, CONSULT_PICK_PAGE_READ_FLAG, CONSULT_READ_PAGE_LATE_FLAG } from '@/lib/config/consultFlags'
import { WAVE2_FLAGS, wave2FlagState } from './liveTrial'
import { conditionReport } from './preflightReport'
import { FLAG_ENV_NAMES, WAVE2_FLAG_NAMES, buildChildEnv, gate1Summary, launcherRefusals, wave2Line } from './liveTrialLauncher.mjs'

const W5 = { [CONSULT_PICK_PAGE_READ_FLAG]: consultPickPageReadOn, [CONSULT_READ_PAGE_LATE_FLAG]: consultReadPageLateOn } as const
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave3/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const CHILD = { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true }
const preflightLine = (name: string) => conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith(name))!
const notPassed = (k: string) => `${k} is set but is not one of the variables the trial passes on`
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap()
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

describe('Wave 5 flags: registered in every list the trial keeps', () => {
  it('the two names are the product\'s own flag names, and each is in the trial list, the launcher list, the declared benchmark flags and the launcher allow-list', () => {
    expect(Object.keys(W5)).toEqual(['CONSULT_PICK_PAGE_READ', 'CONSULT_READ_PAGE_LATE'])
    for (const k of Object.keys(W5)) {
      expect(WAVE2_FLAGS, k).toContain(k); expect(WAVE2_FLAG_NAMES, k).toContain(k); expect(BENCH_FLAG_NAMES, k).toContain(k); expect(FLAG_ENV_NAMES, k).toContain(k)
    }
    // the lists still agree with each other as a whole (each name once)
    expect([...WAVE2_FLAG_NAMES]).toEqual([...WAVE2_FLAGS])
    expect([...FLAG_ENV_NAMES].sort()).toEqual([...BENCH_FLAG_NAMES].sort())
    for (const list of [WAVE2_FLAGS, WAVE2_FLAG_NAMES, BENCH_FLAG_NAMES, FLAG_ENV_NAMES]) expect(new Set(list).size).toBe(list.length)
  })
  it('set to "1": the child gets "1" and the launcher does not refuse it; unset stays unset (nothing is added for the child)', () => {
    for (const k of Object.keys(W5)) {
      expect(buildChildEnv({ ...EXT, [k]: '1' }, CHILD)[k], k).toBe('1')
      expect(launcherRefusals({ ...EXT, [k]: '1' }).join(' | '), k).not.toContain(notPassed(k))
      expect(k in buildChildEnv({ ...EXT }, CHILD), k).toBe(false)
    }
    const both = buildChildEnv({ ...EXT, CONSULT_PICK_PAGE_READ: '1', CONSULT_READ_PAGE_LATE: '1' }, CHILD)
    expect([both.CONSULT_PICK_PAGE_READ, both.CONSULT_READ_PAGE_LATE]).toEqual(['1', '1'])
  })
})

describe('Wave 5 flags: the refusal of any other setting is not weakened', () => {
  it('an unknown CONSULT_* name - including near look-alikes of the two new names - is still refused by name and never reaches the child', () => {
    for (const k of ['CONSULT_SOMETHING_ELSE_NEW', 'CONSULT_PICK_PAGE_READS', 'CONSULT_PICK_PAGE', 'CONSULT_READ_PAGE_LATER', 'CONSULT_READ_PAGE', 'CONSULT_READ_PAGE_LATE_2']) {
      const env = { ...EXT, CONSULT_PICK_PAGE_READ: '1', CONSULT_READ_PAGE_LATE: '1', [k]: '1' }
      expect(launcherRefusals(env).join(' | '), k).toContain(notPassed(k))
      expect(k in buildChildEnv(env, CHILD), k).toBe(false)
    }
    // other setting families keep being refused too (the rule is the same for every prefix it covers)
    for (const k of ['TAPPY_NEW_SWITCH', 'LLM_SOMETHING_NEW', 'BENCH_NEW_KNOB']) expect(launcherRefusals({ ...EXT, [k]: '1' }).join(' | '), k).toContain(notPassed(k))
    // and a clean configuration with the two flags set has no refusal at all
    expect(launcherRefusals({ ...EXT, CONSULT_PICK_PAGE_READ: '1', CONSULT_READ_PAGE_LATE: '1' })).toEqual([])
  })
  it('a value other than 0 / 1 fails the preflight by name', () => {
    for (const k of Object.keys(W5)) {
      vi.unstubAllEnvs()
      for (const [n, v] of Object.entries({ ...EXT, CONSULT_FINAL_SYNTHESIS: '1', [k]: 'yes' })) vi.stubEnv(n, v)
      const w2 = preflightLine('wave-2 behaviour flags')
      expect(w2.ok, k).toBe(false)
      expect(w2.detail, k).toContain(`${k} must be exactly 1, 0 or unset`)
    }
  })
})

describe('Wave 5 flags: the state shown is the state the product really has', () => {
  it('trial state, Gate 1 line and the product functions agree (with CONSULT_FINAL_SYNTHESIS=1, as in every run that sets W5-1), for every level x value', () => {
    for (const l of [undefined, '0', '2', '4']) for (const w of [undefined, '0', '1', 'true']) {
      const env: Record<string, string | undefined> = { CONSULT_FINAL_SYNTHESIS: '1', ...(l === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: l }), ...(w === undefined ? {} : { CONSULT_PICK_PAGE_READ: w, CONSULT_READ_PAGE_LATE: w }) }
      const st = wave2FlagState(env)
      const line = wave2Line({ ...EXT, ...env })
      for (const [k, on] of Object.entries(W5)) {
        expect(st[k] === 'ON', `${k} level=${l} flag=${w}`).toBe(on(env))
        const shown = new RegExp(`${k}=\\S+ \\(([^)]*)\\)`).exec(line)![1]!
        expect(shown.startsWith('BẬT'), `${k} line level=${l} flag=${w}: ${shown}`).toBe(on(env))
      }
    }
  })
  it('not tied to the level: unset at L4 is OFF (TẮT), "1" at L0 is ON (BẬT)', () => {
    for (const k of Object.keys(W5)) {
      expect(wave2Line({ ...EXT, CONSULT_CAPABILITY_LEVEL: '4' }), k).toContain(`${k}=unset (TẮT)`)
      expect(wave2Line({ ...EXT, CONSULT_FINAL_SYNTHESIS: '1', [k]: '1' }), k).toContain(`${k}=1 (BẬT)`)
    }
  })
  it('Gate 1 and the preflight of a W5-R2-shaped run (L2 + CONSULT_PICK_PAGE_READ=1) and a W5-R3-W51-shaped run (L2 + CONSULT_READ_PAGE_LATE=1)', () => {
    for (const [on, off] of [['CONSULT_PICK_PAGE_READ', 'CONSULT_READ_PAGE_LATE'], ['CONSULT_READ_PAGE_LATE', 'CONSULT_PICK_PAGE_READ']]) {
      vi.unstubAllEnvs()
      const env = { ...EXT, CONSULT_CAPABILITY_LEVEL: '2', CONSULT_FINAL_SYNTHESIS: '1', [on!]: '1' }
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
      const gate = gate1Summary(env, null).join('\n')
      expect(gate, on).toContain(`${on}=1 (BẬT)`)
      expect(gate, on).toContain(`${off}=unset (TẮT)`)
      expect(gate, on).toContain('CONSULT_CHAT_DOMAIN_AGREEMENT=unset (TẮT)')
      expect(gate, on).toContain('mức hiệu lực L2')
      const w2 = preflightLine('wave-2 behaviour flags')
      expect(w2.ok, on).toBe(true)
      expect(w2.detail, on).toContain(`${on}=1 (ON)`)
      expect(w2.detail, on).toContain(`${off}=unset (OFF)`)
    }
  })
})
