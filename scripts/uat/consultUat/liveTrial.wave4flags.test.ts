// @vitest-environment node
// Wave 4 (C1) - CONSULT_KNOWLEDGE_PATH (R3) and CONSULT_PICK_TURN_TOOLS (R2) are REGISTERED in the launcher and the trial, passed to the child with their value, and Gate 1 / the preflight show the state
// the product REALLY has (unset follows the level from L2; a set flag decides for itself), next to LEGACY_STREAM_TRACE and BENCH_ALLOW_PUBLIC_PAGE_FETCH. MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { CAPABILITY_FLAG_LEVELS as PRODUCT_LEVELS, consultKnowledgePathOn, consultPickTurnToolsOn } from '@/lib/config/consultFlags'
import { WAVE2_FLAGS, wave2FlagState } from './liveTrial'
import { conditionReport } from './preflightReport'
import { CAPABILITY_FLAG_LEVELS as LAUNCHER_LEVELS, FLAG_ENV_NAMES, WAVE2_FLAG_NAMES, buildChildEnv, gate1Summary, launcherRefusals, wave2Line } from './liveTrialLauncher.mjs'

const W4 = { CONSULT_KNOWLEDGE_PATH: consultKnowledgePathOn, CONSULT_PICK_TURN_TOOLS: consultPickTurnToolsOn } as const
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave3/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const CHILD = { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true }
const preflightLine = (name: string) => conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith(name))!
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap()
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

describe('Wave 4 path flags: registered everywhere', () => {
  it('in the trial list, the launcher list, the declared benchmark flags, the allow-list; the level tables agree (L2)', () => {
    for (const k of Object.keys(W4)) {
      expect(WAVE2_FLAGS).toContain(k); expect(WAVE2_FLAG_NAMES).toContain(k); expect(BENCH_FLAG_NAMES).toContain(k); expect(FLAG_ENV_NAMES).toContain(k)
      expect(PRODUCT_LEVELS[k]).toBe(2)
    }
    expect(LAUNCHER_LEVELS).toEqual(PRODUCT_LEVELS)
  })
  it('the child gets the value as set; unset stays unset; a value other than 0 / 1 is refused by name', () => {
    for (const k of Object.keys(W4)) {
      expect(buildChildEnv({ ...EXT, [k]: '1' }, CHILD)[k]).toBe('1')
      expect(k in buildChildEnv({ ...EXT }, CHILD)).toBe(false)
      expect(launcherRefusals({ ...EXT, [k]: '1' }).join(' | ')).not.toContain(`${k} is set but is not one of`)
    }
  })
})

describe('Wave 4 path flags: the state shown is the state the product really has', () => {
  it('trial state, Gate 1 line and the product functions agree for every level x flag value', () => {
    for (const l of [undefined, '0', '1', '2', '3', '4', '9']) for (const w of [undefined, '0', '1']) {
      const env: Record<string, string | undefined> = { ...(l === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: l }), ...(w === undefined ? {} : { CONSULT_KNOWLEDGE_PATH: w, CONSULT_PICK_TURN_TOOLS: w }) }
      const st = wave2FlagState(env)
      const line = wave2Line({ ...EXT, ...env })
      for (const [k, on] of Object.entries(W4)) {
        expect(st[k] === 'ON', `${k} level=${l} flag=${w}`).toBe(on(env))
        const shown = new RegExp(`${k}=\\S+ \\(([^)]*)\\)`).exec(line)![1]!
        expect(shown.startsWith('BẬT'), `${k} line level=${l} flag=${w}: ${shown}`).toBe(on(env))
      }
    }
  })
  it('Gate 1 and the preflight at L2: both path flags ON by the level, next to the real state of LEGACY_STREAM_TRACE and BENCH_ALLOW_PUBLIC_PAGE_FETCH', () => {
    const env = { ...EXT, CONSULT_CAPABILITY_LEVEL: '2', LEGACY_STREAM_TRACE: '1', BENCH_ALLOW_PUBLIC_PAGE_FETCH: '1' }
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    const gate = gate1Summary(env, null).join('\n')
    expect(gate).toContain('CONSULT_KNOWLEDGE_PATH=unset (BẬT theo mức)')
    expect(gate).toContain('CONSULT_PICK_TURN_TOOLS=unset (BẬT theo mức)')
    expect(gate).toContain('LEGACY_STREAM_TRACE=1 (BẬT')
    expect(gate).toContain('BENCH_ALLOW_PUBLIC_PAGE_FETCH=1 (BẬT')
    const w2 = preflightLine('wave-2 behaviour flags')
    expect(w2.detail).toContain('CONSULT_KNOWLEDGE_PATH=unset (ON)')
    expect(w2.detail).toContain('CONSULT_PICK_TURN_TOOLS=unset (ON)')
    const bs = preflightLine('bench switches')
    expect(bs.detail).toContain('LEGACY_STREAM_TRACE=1 (BẬT)')
    expect(bs.detail).toContain('BENCH_ALLOW_PUBLIC_PAGE_FETCH=1 (BẬT)')
  })
  it('at L1 they are OFF (L1 does not switch them on); a flag set to 0 at L4 is OFF; set to 1 at L0 is ON', () => {
    expect(wave2Line({ ...EXT, CONSULT_CAPABILITY_LEVEL: '1' })).toContain('CONSULT_KNOWLEDGE_PATH=unset (TẮT)')
    expect(wave2Line({ ...EXT, CONSULT_CAPABILITY_LEVEL: '1' })).toContain('CONSULT_PICK_TURN_TOOLS=unset (TẮT)')
    expect(wave2Line({ ...EXT, CONSULT_CAPABILITY_LEVEL: '4', CONSULT_PICK_TURN_TOOLS: '0' })).toContain('CONSULT_PICK_TURN_TOOLS=0 (TẮT)')
    expect(wave2Line({ ...EXT, CONSULT_KNOWLEDGE_PATH: '1' })).toContain('CONSULT_KNOWLEDGE_PATH=1 (BẬT)')
  })
  it('a value other than 0 / 1 fails the preflight by name', () => {
    for (const [k, v] of Object.entries({ ...EXT, CONSULT_KNOWLEDGE_PATH: 'yes' })) vi.stubEnv(k, v)
    const w2 = preflightLine('wave-2 behaviour flags')
    expect(w2.ok).toBe(false)
    expect(w2.detail).toContain('CONSULT_KNOWLEDGE_PATH must be exactly 1, 0 or unset')
  })
})
