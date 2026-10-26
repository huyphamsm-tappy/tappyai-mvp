// @vitest-environment node
// Wave 2I - the two new behaviour flags are REGISTERED in the launcher and the trial: accepted by name, passed to the child with their value, checked by the preflight
// (unset, 0 or 1), shown in the preflight line and Gate 1 with their real state. Look-alikes are still refused; host allow-list and caps are untouched. MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { consultKnowledgeTurnToolsOn } from '@/lib/config/consultFlags'
import { WAVE2_FLAGS, WAVE2_FLAG_NEEDS, wave2FlagReasons, wave2FlagState } from './liveTrial'
import { conditionReport } from './preflightReport'
import { FLAG_ENV_NAMES, WAVE2_FLAG_NAMES, WAVE2_FLAG_NEEDS as WAVE2_FLAG_NEEDS_LAUNCHER, buildChildEnv, gate1Summary, launcherRefusals, wave2Line } from './liveTrialLauncher.mjs'

const NEW_FLAGS = ['CONSULT_ABORT_ABANDONED_FIRST_PART', 'CONSULT_KNOWLEDGE_TURN_TOOLS'] as const
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2i/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const KV = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kvtoken', UPSTASH_REDIS_REST_URL: 'https://u.example', UPSTASH_REDIS_REST_TOKEN: 'utoken' }
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap()
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'BENCH_RESET_FREE_QUOTA_PER_TURN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

describe('Wave 2I flags: registered everywhere', () => {
  it('both names are in the trial list, the launcher list, the declared benchmark flags and the launcher allow-list', () => {
    for (const k of NEW_FLAGS) {
      expect([...WAVE2_FLAGS], k).toContain(k)
      expect(WAVE2_FLAG_NAMES, k).toContain(k)
      expect(BENCH_FLAG_NAMES, k).toContain(k)
      expect(FLAG_ENV_NAMES, k).toContain(k)
    }
    expect(WAVE2_FLAG_NAMES).toEqual([...WAVE2_FLAGS])
  })
  it('each reaches the child with its value and nothing else is loosened (KV_* / UPSTASH_* still not passed on); unset stays unset', () => {
    for (const k of NEW_FLAGS) {
      const child = buildChildEnv({ ...EXT, [k]: '1', ...KV }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })
      expect(child[k]).toBe('1')
      for (const kv of Object.keys(KV)) expect(kv in child, kv).toBe(false)
      expect(k in buildChildEnv({ ...EXT }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })).toBe(false)
      expect(buildChildEnv({ ...EXT, [k]: '0' }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })[k]).toBe('0')
    }
  })
  it('the launcher accepts them by name (alone, and together with the Wave 2C/2D flags) and refuses look-alikes and other unknown settings', () => {
    expect(launcherRefusals({ ...EXT, CONSULT_ABORT_ABANDONED_FIRST_PART: '1', CONSULT_KNOWLEDGE_TURN_TOOLS: '1', CONSULT_SEARCH_NOW_INTENT_GATE: '1', CONSULT_TRACE_DIAGNOSTICS: '1' })).toEqual([])
    for (const bad of ['CONSULT_ABORT_ABANDONED_FIRST_PAR', 'CONSULT_ABORT_ABANDONED_FIRST_PARTS', 'CONSULT_ABORT_ABANDONED_FIRST_PART_ON', 'CONSULT_ABORT_ABANDONED', 'CONSULT_ABORT_ABANDON_FIRST_PART',
      'CONSULT_KNOWLEDGE_TURN_TOOL', 'CONSULT_KNOWLEDGE_TURN_TOOLS_ON', 'CONSULT_KNOWLEDGE_TOOLS', 'CONSULT_KNOWLEDGETURN_TOOLS']) {
      expect(launcherRefusals({ ...EXT, [bad]: '1' }).join(' | '), bad).toContain(`${bad} is set but is not one of the variables the trial passes on`)
    }
    expect(launcherRefusals({ ...EXT, CONSULT_KNOWLEDGE_TURN_TOOLS: '1', CONSULT_SOMETHING_ELSE_NEW: '1' }).join(' | ')).toContain('CONSULT_SOMETHING_ELSE_NEW is set but is not one of the variables the trial passes on')
  })
})

describe('Wave 2I flags: values and shown state', () => {
  for (const k of NEW_FLAGS) {
    for (const ok of [undefined, '0', '1']) it(`${k}=${JSON.stringify(ok)} is accepted by the preflight`, () => { expect(wave2FlagReasons({ [k]: ok })).toEqual([]) })
    for (const bad of ['', 'yes', 'true', 'on', '2', ' 1', '1 ']) it(`${k}=${JSON.stringify(bad)} is refused by name`, () => {
      expect(wave2FlagReasons({ [k]: bad })).toEqual([`${k} must be exactly 1, 0 or unset (any other value is refused, not guessed at)`])
    })
  }
  it('the state is ON only for "1" (the knowledge-turn flag also needs the search-now gate: without it "1" is INERT)', () => {
    for (const v of [undefined, '0', '1', 'yes']) {
      expect(wave2FlagState({ CONSULT_ABORT_ABANDONED_FIRST_PART: v }).CONSULT_ABORT_ABANDONED_FIRST_PART).toBe(v === '1' ? 'ON' : 'OFF')
      expect(wave2FlagState({ CONSULT_KNOWLEDGE_TURN_TOOLS: v, CONSULT_SEARCH_NOW_INTENT_GATE: '1' }).CONSULT_KNOWLEDGE_TURN_TOOLS).toBe(v === '1' ? 'ON' : 'OFF')
      expect(wave2FlagState({ CONSULT_KNOWLEDGE_TURN_TOOLS: v }).CONSULT_KNOWLEDGE_TURN_TOOLS).toBe(v === '1' ? 'INERT' : 'OFF')
    }
    for (const g of [undefined, '0', 'true', ' 1']) expect(wave2FlagState({ CONSULT_KNOWLEDGE_TURN_TOOLS: '1', CONSULT_SEARCH_NOW_INTENT_GATE: g }).CONSULT_KNOWLEDGE_TURN_TOOLS).toBe('INERT')
  })
  it('the "needs" table of the trial and of the launcher are the same, and mirror the product (consultKnowledgeTurnToolsOn)', () => {
    expect(WAVE2_FLAG_NEEDS_LAUNCHER).toEqual(WAVE2_FLAG_NEEDS)
    expect(WAVE2_FLAG_NEEDS).toEqual({ CONSULT_KNOWLEDGE_TURN_TOOLS: 'CONSULT_SEARCH_NOW_INTENT_GATE' })
    for (const g of [undefined, '1']) for (const k of [undefined, '1']) {
      const env = { CONSULT_SEARCH_NOW_INTENT_GATE: g, CONSULT_KNOWLEDGE_TURN_TOOLS: k }
      expect(consultKnowledgeTurnToolsOn(env)).toBe(wave2FlagState(env).CONSULT_KNOWLEDGE_TURN_TOOLS === 'ON')
    }
  })
  it('F6: K=1 WITHOUT the gate: Gate 1 and the preflight say "KHÔNG CÓ HIỆU LỰC (cần CONSULT_SEARCH_NOW_INTENT_GATE=1)", never ON / BẬT; the launcher does not switch the gate on for the Owner', () => {
    const env = { ...EXT, CONSULT_KNOWLEDGE_TURN_TOOLS: '1' }
    for (const k of WAVE2_FLAGS) vi.stubEnv(k, undefined)
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    const gate = gate1Summary(env, null).join('\n')
    const line = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith('wave-2 behaviour flags'))!
    expect(gate).toContain('CONSULT_KNOWLEDGE_TURN_TOOLS=1 (KHÔNG CÓ HIỆU LỰC — cần CONSULT_SEARCH_NOW_INTENT_GATE=1)')
    expect(gate).not.toContain('CONSULT_KNOWLEDGE_TURN_TOOLS=1 (BẬT)')
    expect(line.detail).toContain('CONSULT_KNOWLEDGE_TURN_TOOLS=1 (INERT: KHÔNG CÓ HIỆU LỰC, cần CONSULT_SEARCH_NOW_INTENT_GATE=1)')
    expect(line.detail).not.toContain('CONSULT_KNOWLEDGE_TURN_TOOLS=1 (ON)')
    expect(line.detail).toContain('CONSULT_SEARCH_NOW_INTENT_GATE=unset (OFF)') // the gate was not turned on behind the Owner's back
    const child = buildChildEnv(env, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })
    expect(child.CONSULT_KNOWLEDGE_TURN_TOOLS).toBe('1')
    expect('CONSULT_SEARCH_NOW_INTENT_GATE' in child).toBe(false)
    expect(wave2Line(env)).toContain('CONSULT_KNOWLEDGE_TURN_TOOLS=1 (KHÔNG CÓ HIỆU LỰC — cần CONSULT_SEARCH_NOW_INTENT_GATE=1)')
  })
  it('K=1 WITH the gate is ON / BẬT; the abort flag alone is ON / BẬT (it needs nothing)', () => {
    const env = { ...EXT, CONSULT_KNOWLEDGE_TURN_TOOLS: '1', CONSULT_SEARCH_NOW_INTENT_GATE: '1', CONSULT_ABORT_ABANDONED_FIRST_PART: '1' }
    expect(wave2Line(env)).toContain('CONSULT_KNOWLEDGE_TURN_TOOLS=1 (BẬT)')
    expect(wave2Line(env)).toContain('CONSULT_ABORT_ABANDONED_FIRST_PART=1 (BẬT)')
    expect(wave2Line({ ...EXT, CONSULT_ABORT_ABANDONED_FIRST_PART: '1' })).toContain('CONSULT_ABORT_ABANDONED_FIRST_PART=1 (BẬT)')
    expect(wave2Line({ ...EXT, CONSULT_ABORT_ABANDONED_FIRST_PART: '1' })).toContain('CONSULT_KNOWLEDGE_TURN_TOOLS=unset (TẮT)')
  })
  it('the preflight line and Gate 1 print the real state of both flags (unset = OFF, 1 = ON)', () => {
    for (const f of [{}, { CONSULT_ABORT_ABANDONED_FIRST_PART: '1' }, { CONSULT_KNOWLEDGE_TURN_TOOLS: '1', CONSULT_SEARCH_NOW_INTENT_GATE: '1' }]) {
      for (const k of WAVE2_FLAGS) vi.stubEnv(k, undefined)
      for (const [k, v] of Object.entries({ ...EXT, ...f })) vi.stubEnv(k, v)
      const line = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith('wave-2 behaviour flags'))!
      const gate = gate1Summary({ ...EXT, ...f }, null).join('\n')
      expect(line.ok).toBe(true)
      for (const k of NEW_FLAGS) {
        const on = (f as Record<string, string>)[k] === '1'
        expect(line.detail, k).toContain(`${k}=${(f as Record<string, string>)[k] ?? 'unset'} (${on ? 'ON' : 'OFF'})`)
        expect(gate, k).toContain(`${k}=${(f as Record<string, string>)[k] ?? 'unset'} (${on ? 'BẬT' : 'TẮT'})`)
      }
    }
  })
})
