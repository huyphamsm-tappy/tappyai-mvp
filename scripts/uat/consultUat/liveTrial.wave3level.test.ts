// @vitest-environment node
// Wave 3 (W6) - CONSULT_CAPABILITY_LEVEL and the four Wave 3 flags are REGISTERED in the launcher and the trial: accepted by name, passed to the child with their value, checked by the preflight, and shown in
// Gate 1 and the preflight with the state the configuration REALLY has (an unset Wave 3 flag follows the level; a set one decides for itself). Look-alikes are refused; host allow-list and caps are untouched.
// MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { CAPABILITY_FLAG_LEVELS as PRODUCT_LEVELS, capabilityLevel, consultDeterministicMathOn, consultResearchLoopOn, consultStructuredSynthesisOn, consultToolByNeedOn } from '@/lib/config/consultFlags'
import { WAVE2_FLAGS, capabilityLevelReasons, wave2FlagState } from './liveTrial'
import { conditionReport } from './preflightReport'
import { CAPABILITY_FLAG_LEVELS as LAUNCHER_LEVELS, FLAG_ENV_NAMES, WAVE2_FLAG_NAMES, buildChildEnv, capabilityLevelOf, gate1Summary, launcherRefusals, wave2Line } from './liveTrialLauncher.mjs'

const W3 = ['CONSULT_TOOL_BY_NEED', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_RESEARCH_LOOP', 'CONSULT_STRUCTURED_SYNTHESIS'] as const
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave3/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const CHILD = { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true }
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap()
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'BENCH_RESET_FREE_QUOTA_PER_TURN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

describe('Wave 3 level: registered everywhere', () => {
  it('the level variable and the four flags are in the trial list, the launcher lists, the declared benchmark flags and the allow-list', () => {
    expect(FLAG_ENV_NAMES).toContain('CONSULT_CAPABILITY_LEVEL')
    expect(BENCH_FLAG_NAMES).toContain('CONSULT_CAPABILITY_LEVEL')
    for (const k of W3) { expect([...WAVE2_FLAGS], k).toContain(k); expect(WAVE2_FLAG_NAMES, k).toContain(k); expect(BENCH_FLAG_NAMES, k).toContain(k); expect(FLAG_ENV_NAMES, k).toContain(k) }
    expect(WAVE2_FLAG_NAMES).toEqual([...WAVE2_FLAGS])
  })
  it('the level reaches the child with its value, unset stays unset, and nothing else is loosened', () => {
    expect(buildChildEnv({ ...EXT, CONSULT_CAPABILITY_LEVEL: '3' }, CHILD).CONSULT_CAPABILITY_LEVEL).toBe('3')
    expect('CONSULT_CAPABILITY_LEVEL' in buildChildEnv({ ...EXT }, CHILD)).toBe(false)
    expect(launcherRefusals({ ...EXT, CONSULT_CAPABILITY_LEVEL: '2' })).toEqual([])
    for (const bad of ['CONSULT_CAPABILITY', 'CONSULT_CAPABILITY_LEVELS', 'CONSULT_CAPABILITYLEVEL', 'CONSULT_LEVEL', 'CONSULT_CAPABILITY_LEVEL_ON']) {
      expect(launcherRefusals({ ...EXT, [bad]: '2' }).join(' | '), bad).toContain(`${bad} is set but is not one of the variables the trial passes on`)
    }
  })
  it('the level tables of the launcher and of the product are the same, and the launcher reads a level exactly as the product does', () => {
    expect(LAUNCHER_LEVELS).toEqual(PRODUCT_LEVELS)
    for (const v of [undefined, '0', '1', '2', '3', '4', '5', '01', ' 2', 'L2', '', 'x']) {
      expect(capabilityLevelOf(v === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: v }), JSON.stringify(v)).toBe(capabilityLevel(v === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: v }))
    }
  })
})

describe('Wave 3 level: the preflight refuses a bad value by name', () => {
  it('unset or a single character 0-4 is accepted; anything else is refused, never guessed at', () => {
    for (const v of [undefined, '0', '1', '2', '3', '4']) expect(capabilityLevelReasons(v === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: v }), String(v)).toEqual([])
    for (const v of ['5', '01', ' 2', '2 ', 'L2', '', 'true', '-1']) expect(capabilityLevelReasons({ CONSULT_CAPABILITY_LEVEL: v }).join(' '), JSON.stringify(v)).toContain('CONSULT_CAPABILITY_LEVEL must be a single character 0-4 or unset')
  })
})

describe('Wave 3 level: the state shown is the state the product really has', () => {
  it('trial state, Gate 1 line and the product functions agree for every level x flag value x gate', () => {
    const levels = [undefined, '0', '1', '2', '3', '4', '9']
    for (const l of levels) for (const g of [undefined, '1']) for (const w of [undefined, '0', '1']) {
      const env: Record<string, string | undefined> = { ...(l === undefined ? {} : { CONSULT_CAPABILITY_LEVEL: l }), ...(g === undefined ? {} : { CONSULT_SEARCH_NOW_INTENT_GATE: g }), ...(w === undefined ? {} : { CONSULT_RESEARCH_LOOP: w, CONSULT_TOOL_BY_NEED: w }) }
      const st = wave2FlagState(env)
      const product: Record<string, boolean> = { CONSULT_TOOL_BY_NEED: consultToolByNeedOn(env), CONSULT_DETERMINISTIC_MATH: consultDeterministicMathOn(env), CONSULT_RESEARCH_LOOP: consultResearchLoopOn(env), CONSULT_STRUCTURED_SYNTHESIS: consultStructuredSynthesisOn(env) }
      for (const k of W3) expect(st[k] === 'ON', `${k} level=${l} gate=${g} flag=${w}`).toBe(product[k])
      const line = wave2Line({ ...EXT, ...env })
      for (const k of W3) {
        const shown = new RegExp(`${k}=\\S+ \\(([^)]*)\\)`).exec(line)![1]!
        expect(shown.startsWith('BẬT'), `${k} line level=${l} gate=${g} flag=${w}: ${shown}`).toBe(product[k])
        if (st[k] === 'INERT') expect(shown).toContain('KHÔNG CÓ HIỆU LỰC')
      }
    }
  })
  it('Gate 1 and the preflight print the effective level and say which flags follow it; W2 at a level without the gate is INERT, never ON', () => {
    const env = { ...EXT, CONSULT_CAPABILITY_LEVEL: '3' }
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    const gate = gate1Summary(env, null).join('\n')
    expect(gate).toContain('mức năng lực CONSULT_CAPABILITY_LEVEL=3 (mức hiệu lực L3')
    expect(gate).toContain('CONSULT_DETERMINISTIC_MATH=unset (BẬT theo mức)')
    expect(gate).toContain('CONSULT_RESEARCH_LOOP=unset (BẬT theo mức)')
    expect(gate).toContain('CONSULT_STRUCTURED_SYNTHESIS=unset (BẬT theo mức)')
    expect(gate).toContain('CONSULT_TOOL_BY_NEED=unset (KHÔNG CÓ HIỆU LỰC — cần CONSULT_SEARCH_NOW_INTENT_GATE=1)')
    const line = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith('wave-2 behaviour flags'))!
    expect(line.detail).toContain('CONSULT_CAPABILITY_LEVEL=3 (mức hiệu lực L3)')
    expect(line.detail).toContain('CONSULT_TOOL_BY_NEED=unset (INERT: KHÔNG CÓ HIỆU LỰC, cần CONSULT_SEARCH_NOW_INTENT_GATE=1)')
    expect(line.detail).toContain('CONSULT_STRUCTURED_SYNTHESIS=unset (ON)')
  })
  it('a flag that is SET to 0 at a level is shown OFF (TẮT); an invalid level is refused by the preflight and shown as L0', () => {
    const env = { ...EXT, CONSULT_CAPABILITY_LEVEL: '3', CONSULT_RESEARCH_LOOP: '0' }
    expect(wave2Line(env)).toContain('CONSULT_RESEARCH_LOOP=0 (TẮT)')
    expect(wave2Line(env)).toContain('CONSULT_STRUCTURED_SYNTHESIS=unset (BẬT theo mức)')
    const bad = { ...EXT, CONSULT_CAPABILITY_LEVEL: '7' }
    expect(wave2Line(bad)).toContain('mức hiệu lực L0')
    for (const [k, v] of Object.entries(bad)) vi.stubEnv(k, v)
    const line = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith('wave-2 behaviour flags'))!
    expect(line.ok).toBe(false)
    expect(line.detail).toContain('CONSULT_CAPABILITY_LEVEL must be a single character 0-4 or unset')
  })
})
