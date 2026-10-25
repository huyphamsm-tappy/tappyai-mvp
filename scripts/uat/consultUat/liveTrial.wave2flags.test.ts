// @vitest-environment node
// Wave 2 · P1.5 · the new behaviour flags are REGISTERED (passed to the child, declared in the benchmark list), their VALUES are checked by the preflight (unset, 0 or 1), and the
// state they REALLY have is printed - in the summary, the result file, the preflight report and Gate 1 - never an assumed ON. Any other unknown variable is still refused.
// MOCK ONLY: no key, no real host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { consultAnswerAttributionOn, consultFinalSynthesisOn, consultGeneralAssistantOn } from '@/lib/config/consultFlags'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { WAVE2_FLAGS, formatSummary, runLiveTrial, wave2FlagReasons, wave2FlagState } from './liveTrial'
import { conditionReport } from './preflightReport'
import { FLAG_ENV_NAMES, WAVE2_FLAG_NAMES, buildChildEnv, gate1Summary, launcherRefusals, wave2Line } from './liveTrialLauncher.mjs'
import type { UatTurn } from './questions'

const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const TURN: UatTurn[] = [{ id: 'F1', conversation: 'F1', turn: 1, text: 'Cau hoi kiem thu rieng cho cac co hanh vi.' }]
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap()
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'BENCH_RESET_FREE_QUOTA_PER_TURN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests() })

describe('registration: the flags travel to the child and are part of the declared benchmark flags; look-alikes are still refused', () => {
  it('the six names (three behaviour flags + the Wave 2C trace flag + the two Wave 2D flags) are the same everywhere', () => {
    expect([...WAVE2_FLAGS]).toEqual(['CONSULT_FINAL_SYNTHESIS', 'CONSULT_ANSWER_ATTRIBUTION', 'CONSULT_GENERAL_ASSISTANT', 'CONSULT_TRACE_DIAGNOSTICS', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_THREAD_AWARE_ASK'])
    expect(WAVE2_FLAG_NAMES).toEqual([...WAVE2_FLAGS])
    for (const k of WAVE2_FLAGS) { expect(BENCH_FLAG_NAMES).toContain(k); expect(FLAG_ENV_NAMES).toContain(k) }
  })
  it('Wave 2C: the trace flag reaches the child with its value; nothing else is loosened (KV_* / UPSTASH_* are still not passed on; an unknown setting is still refused)', () => {
    const child = buildChildEnv({ ...EXT, CONSULT_TRACE_DIAGNOSTICS: '1', KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kvtoken', UPSTASH_REDIS_REST_URL: 'https://u.example', UPSTASH_REDIS_REST_TOKEN: 'utoken' }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })
    expect(child.CONSULT_TRACE_DIAGNOSTICS).toBe('1')
    for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) expect(k in child, k).toBe(false)
    expect('CONSULT_TRACE_DIAGNOSTICS' in buildChildEnv({ ...EXT }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })).toBe(false) // unset stays unset
    expect(launcherRefusals({ ...EXT, CONSULT_TRACE_DIAGNOSTICS: '1', CONSULT_SOMETHING_ELSE_NEW: '1' }).join(' | ')).toContain('CONSULT_SOMETHING_ELSE_NEW is set but is not one of the variables the trial passes on')
  })
  it('Wave 2D · C: the search-now gate reaches the child with its value; nothing else is loosened; look-alikes (a letter more or less, an _ON suffix) are refused; unset stays unset', () => {
    const child = buildChildEnv({ ...EXT, CONSULT_SEARCH_NOW_INTENT_GATE: '1', KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kvtoken', UPSTASH_REDIS_REST_URL: 'https://u.example', UPSTASH_REDIS_REST_TOKEN: 'utoken' }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })
    expect(child.CONSULT_SEARCH_NOW_INTENT_GATE).toBe('1')
    for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) expect(k in child, k).toBe(false)
    expect('CONSULT_SEARCH_NOW_INTENT_GATE' in buildChildEnv({ ...EXT }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })).toBe(false)
    expect(launcherRefusals({ ...EXT, CONSULT_SEARCH_NOW_INTENT_GATE: '1' })).toEqual([])
    for (const bad of ['CONSULT_SEARCH_NOW_INTENT_GAT', 'CONSULT_SEARCH_NOW_INTENT_GATES', 'CONSULT_SEARCH_NOW_INTENT_GATE_ON', 'CONSULT_SEARCH_NOW_GATE', 'CONSULT_SEARCHNOW_INTENT_GATE']) expect(launcherRefusals({ ...EXT, [bad]: '1' }).join(' | '), bad).toContain(`${bad} is set but is not one of the variables the trial passes on`)
    expect(launcherRefusals({ ...EXT, CONSULT_SEARCH_NOW_INTENT_GATE: '1', CONSULT_SOMETHING_ELSE_NEW: '1' }).join(' | ')).toContain('CONSULT_SOMETHING_ELSE_NEW is set but is not one of the variables the trial passes on')
  })
  it('Wave 2D · A: the thread-aware ask flag reaches the child with its value; nothing else is loosened; look-alikes are refused; unset stays unset; both Wave 2D flags can be set together', () => {
    const child = buildChildEnv({ ...EXT, CONSULT_THREAD_AWARE_ASK: '1', CONSULT_SEARCH_NOW_INTENT_GATE: '0', KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kvtoken', UPSTASH_REDIS_REST_URL: 'https://u.example', UPSTASH_REDIS_REST_TOKEN: 'utoken' }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })
    expect(child.CONSULT_THREAD_AWARE_ASK).toBe('1'); expect(child.CONSULT_SEARCH_NOW_INTENT_GATE).toBe('0')
    for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) expect(k in child, k).toBe(false)
    expect('CONSULT_THREAD_AWARE_ASK' in buildChildEnv({ ...EXT }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })).toBe(false)
    expect(launcherRefusals({ ...EXT, CONSULT_THREAD_AWARE_ASK: '1', CONSULT_SEARCH_NOW_INTENT_GATE: '1' })).toEqual([])
    for (const bad of ['CONSULT_THREAD_AWARE_AS', 'CONSULT_THREAD_AWARE_ASKS', 'CONSULT_THREAD_AWARE_ASK_ON', 'CONSULT_THREAD_ASK', 'CONSULT_THREADAWARE_ASK']) expect(launcherRefusals({ ...EXT, [bad]: '1' }).join(' | '), bad).toContain(`${bad} is set but is not one of the variables the trial passes on`)
    expect(launcherRefusals({ ...EXT, CONSULT_THREAD_AWARE_ASK: '1', CONSULT_SOMETHING_ELSE_NEW: '1' }).join(' | ')).toContain('CONSULT_SOMETHING_ELSE_NEW is set but is not one of the variables the trial passes on')
  })
  it('buildChildEnv passes a flag that is set (value kept) and does not invent one that is not', () => {
    const child = buildChildEnv({ ...EXT, CONSULT_FINAL_SYNTHESIS: '1', CONSULT_GENERAL_ASSISTANT: '0' }, { confirm: false, nonce: 'a'.repeat(32), preflightOnly: true })
    expect(child.CONSULT_FINAL_SYNTHESIS).toBe('1'); expect(child.CONSULT_GENERAL_ASSISTANT).toBe('0'); expect('CONSULT_ANSWER_ATTRIBUTION' in child).toBe(false)
  })
  it('the launcher accepts them by name and refuses look-alikes and other unknown settings', () => {
    expect(launcherRefusals({ ...EXT, CONSULT_FINAL_SYNTHESIS: '1', CONSULT_ANSWER_ATTRIBUTION: '1', CONSULT_GENERAL_ASSISTANT: '1' })).toEqual([])
    // Wave 2C: the trace flag is accepted by name; its look-alikes are refused like any other unknown setting
    expect(launcherRefusals({ ...EXT, CONSULT_TRACE_DIAGNOSTICS: '1' })).toEqual([])
    for (const bad of ['CONSULT_TRACE_DIAGNOSTIC', 'CONSULT_TRACE_DIAGNOSTICS_ON', 'CONSULT_TRACE_DIAGNOSTICSS']) expect(launcherRefusals({ ...EXT, [bad]: '1' }).join(' | '), bad).toContain(`${bad} is set but is not one of the variables the trial passes on`)
    for (const bad of ['CONSULT_FINAL_SYNTHESIS_ON', 'CONSULT_ANSWER_ATTRIBUTE', 'CONSULT_GENERAL_ASSISTANTS', 'CONSULT_SOMETHING_NEW']) {
      expect(launcherRefusals({ ...EXT, [bad]: '1' }).join(' | '), bad).toContain(`${bad} is set but is not one of the variables the trial passes on`)
    }
  })
})

describe('the values are checked by the preflight: unset, 0 or 1 only', () => {
  for (const ok of [undefined, '0', '1']) it(`${JSON.stringify(ok)} is accepted`, () => { for (const k of WAVE2_FLAGS) expect(wave2FlagReasons({ [k]: ok })).toEqual([]) })
  for (const bad of ['', 'yes', 'true', 'on', '2', ' 1', '1 ']) it(`${JSON.stringify(bad)} is refused by name (the other flags are not blamed)`, () => {
    for (const k of WAVE2_FLAGS) expect(wave2FlagReasons({ [k]: bad })).toEqual([`${k} must be exactly 1, 0 or unset (any other value is refused, not guessed at)`])
  })
  it('the report marks an odd value KHÔNG ĐẠT on the flags line and does not repeat it on the "every other check" line', () => {
    for (const [k, v] of Object.entries({ ...EXT, CONSULT_GENERAL_ASSISTANT: 'yes' })) vi.stubEnv(k, v)
    const c = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null })
    const line = c.find(x => x.name.startsWith('wave-2 behaviour flags'))!
    expect(line.ok).toBe(false); expect(line.detail).toContain('CONSULT_GENERAL_ASSISTANT must be exactly 1, 0 or unset')
    expect(c.find(x => x.name.startsWith('every other check'))!.detail).not.toContain('CONSULT_GENERAL_ASSISTANT')
  })
})

describe('the state shown is the state the configuration really has', () => {
  it('the product reads a flag as ON only for the value 1', () => {
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', '2']) { expect(consultFinalSynthesisOn({ CONSULT_FINAL_SYNTHESIS: v })).toBe(false); expect(consultAnswerAttributionOn({ CONSULT_ANSWER_ATTRIBUTION: v })).toBe(false); expect(consultGeneralAssistantOn({ CONSULT_GENERAL_ASSISTANT: v })).toBe(false) }
    expect(consultFinalSynthesisOn({ CONSULT_FINAL_SYNTHESIS: '1' })).toBe(true); expect(consultAnswerAttributionOn({ CONSULT_ANSWER_ATTRIBUTION: '1' })).toBe(true); expect(consultGeneralAssistantOn({ CONSULT_GENERAL_ASSISTANT: '1' })).toBe(true)
    // and the bench, the launcher and the product agree
    for (const v of [undefined, '0', '1', 'yes']) for (const k of WAVE2_FLAGS) expect(wave2FlagState({ [k]: v })[k]).toBe(v === '1' ? 'ON' : 'OFF')
  })
  it('the preflight line and Gate 1 print ON/OFF per flag from the environment (unset is OFF, 1 is ON), in every combination', () => {
    const combos: Array<Record<string, string | undefined>> = [{}, { CONSULT_FINAL_SYNTHESIS: '1' }, { CONSULT_ANSWER_ATTRIBUTION: '1', CONSULT_GENERAL_ASSISTANT: '0' }, { CONSULT_FINAL_SYNTHESIS: '1', CONSULT_ANSWER_ATTRIBUTION: '1', CONSULT_GENERAL_ASSISTANT: '1' }]
    for (const f of combos) {
      for (const k of WAVE2_FLAGS) vi.stubEnv(k, undefined)
      for (const [k, v] of Object.entries({ ...EXT, ...f })) vi.stubEnv(k, v)
      const line = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null }).find(x => x.name.startsWith('wave-2 behaviour flags'))!.detail
      const gate = gate1Summary({ ...EXT, ...f }, null).join('\n')
      for (const k of WAVE2_FLAGS) {
        const on = f[k] === '1'
        expect(line, `${k} ${JSON.stringify(f)}`).toContain(`${k}=${f[k] ?? 'unset'} (${on ? 'ON' : 'OFF'})`)
        expect(gate).toContain(`${k}=${f[k] ?? 'unset'} (${on ? 'BẬT' : 'TẮT'})`)
      }
      expect(wave2Line({ ...EXT, ...f })).toMatch(/^cờ hành vi Wave 2 \(mặc định TẮT; chỉ giá trị 1 là BẬT\)/)
    }
  })
  it('through runLiveTrial: the summary text, the summary object and the result file carry the real values (unset stays unset)', async () => {
    for (const [k, v] of Object.entries({ ...EXT, CONSULT_FINAL_SYNTHESIS: '1', CONSULT_GENERAL_ASSISTANT: '0' })) vi.stubEnv(k, v)
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation(() => undefined))
    const fs = memFs()
    let out
    try { out = await runLiveTrial({ env: process.env, post: (async () => new Response('', { status: 200 })) as never, fetchImpl: (async () => new Response('{}')) as typeof fetch, fs, repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
    if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
    expect(out.summary.flagsInEffect).toMatchObject({ CONSULT_FINAL_SYNTHESIS: '1', CONSULT_ANSWER_ATTRIBUTION: null, CONSULT_GENERAL_ASSISTANT: '0' })
    expect(formatSummary(out.summary)).toMatch(/CONSULT_FINAL_SYNTHESIS=1 CONSULT_ANSWER_ATTRIBUTION=unset CONSULT_GENERAL_ASSISTANT=0/)
    const file = JSON.parse([...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))![1])
    expect(file.flags).toMatchObject({ CONSULT_FINAL_SYNTHESIS: '1', CONSULT_ANSWER_ATTRIBUTION: null, CONSULT_GENERAL_ASSISTANT: '0' })
  })
  it('a run with an odd flag value is refused before anything is sent', async () => {
    for (const [k, v] of Object.entries({ ...EXT, CONSULT_ANSWER_ATTRIBUTION: 'maybe' })) vi.stubEnv(k, v)
    const post = vi.fn(async () => new Response('', { status: 200 }))
    const out = await runLiveTrial({ env: process.env, post: post as never, fetchImpl: (async () => new Response('{}')) as typeof fetch, fs: memFs(), repoRoot: 'D:/TappyAI-wt/wt-integration', now: () => 1_000, turns: TURN, afterTrial: 'restore' } as never)
    expect(out.kind).toBe('refused'); if (out.kind === 'refused') expect(out.reasons.join(' | ')).toContain('CONSULT_ANSWER_ATTRIBUTION must be exactly 1, 0 or unset')
    expect(post).not.toHaveBeenCalled()
  })
})
