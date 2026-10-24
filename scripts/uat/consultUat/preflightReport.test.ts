// @vitest-environment node
// Round 3f · Việc 2: the preflight report sends nothing, names every condition, and never shows a key. MOCK-ONLY: the keys below are fake and
// shaped like nothing real; fetch and node:https are tripwires that count any call.
import http from 'node:http'
import https from 'node:https'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conditionReport, formatConditionReport, type Condition } from './preflightReport'

const ALL_KEYS_START = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_MODE', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULTATIVE_V1', 'CONSULT_V2', 'BENCH_EXPECT_CONSULT_V2', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'ROUTE_FLIGHT_HANG_KHONG_GUARD', 'ROUTE_TOOL_OFFER_GUARD', 'CONSULT_REQUEST_CAP', 'CONSULT_REQUEST_CAP_PER_TURN', 'CONSULT_REQUEST_CAP_PER_RUN', 'CI', 'HTTPS_PROXY', 'BENCH_LIVE_TRIAL']
const KEY_OPENAI = 'sk-test-SECRET-123'
const KEY_SERPER = 'serper-SECRET-456'
const GOOD: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.10', BENCH_CONFIRM_SPEND: '0.10',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '12', CONSULT_REQUEST_CAP_PER_RUN: '400',
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_TRIAL_QUESTION_FILE: 'D:/TappyAI-review-artifacts/consultative-round3d/dev-probe.txt',
  BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-round3e/trial-results',
  CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULT_V2: '1',
  OPENAI_API_KEY: KEY_OPENAI, SERPER_API_KEY: KEY_SERPER,
}
const QUESTION = 'D8|D8|1|giá vàng SJC mua vào bao nhiêu, nêu thời điểm và nguồn?'
const REPO = 'D:/TappyAI-wt/wt-integration'

let netCalls = 0
const originalFetch = globalThis.fetch
const savedNode = { hr: https.request, hg: https.get, tr: http.request, tg: http.get }
beforeEach(() => {
  netCalls = 0
  for (const k of ALL_KEYS_START) vi.stubEnv(k, undefined)
  globalThis.fetch = (async () => { netCalls++; throw new Error('TRIPWIRE: fetch') }) as typeof fetch
  for (const m of [https, http] as const) for (const f of ['request', 'get'] as const) (m as unknown as Record<string, unknown>)[f] = () => { netCalls++; throw new Error('TRIPWIRE: node network') }
})
afterEach(() => {
  vi.unstubAllEnvs(); globalThis.fetch = originalFetch
  https.request = savedNode.hr; https.get = savedNode.hg; http.request = savedNode.tr; http.get = savedNode.tg
})

// In the real child process the env the report reads IS process.env (the flag check compares against process.env), so the test sets process.env.
const ALL_KEYS = [...Object.keys(GOOD), 'ROUTE_FLIGHT_HANG_KHONG_GUARD', 'ROUTE_TOOL_OFFER_GUARD', 'CI', 'HTTPS_PROXY']
const report = (env: Record<string, string | undefined>, questionText: string | null = QUESTION): Condition[] => {
  for (const k of ALL_KEYS) vi.stubEnv(k, env[k])
  return conditionReport({ env: process.env, repoRoot: REPO, execArgv: [], questionText })
}
const failing = (cs: Condition[]) => cs.filter(c => !c.ok).map(c => c.name)

describe('a complete, correct configuration passes every condition and sends nothing', () => {
  it('every condition ĐẠT, and the network was never touched', () => {
    const cs = report({ ...GOOD })
    expect(failing(cs)).toEqual([])
    expect(netCalls).toBe(0)
  })
})

describe('each wrong setting is reported as its own failing condition (red → green per condition)', () => {
  const cases: Array<[string, Record<string, string | undefined>, string]> = [
    ['BENCH_CONFIRM_SPEND equals the RUN cap', { BENCH_CONFIRM_SPEND: '0.05' }, 'BENCH_CONFIRM_SPEND equals the RUN cap exactly'],
    ['the mode', { BENCH_TRIAL_MODE: undefined }, 'mode is dev-multi (BENCH_TRIAL_MODE=dev-multi)'],
    ['the cost gate', { BENCH_SPEND_GATE: '0' }, 'cost gate ON (BENCH_SPEND_GATE=1)'],
    // The run maximum depends on the budget mode (this GOOD env is the extension mode, BENCH_TRIAL_MODE=dev-multi: $1.75). The case that used to say "0.70 is above the
    // maximum" keeps its intent in the ACCEPTANCE mode (mode unset → $0.65, third row); in the extension mode the value that is above the maximum is 1.80 (first row).
    ['the run cap above the EXTENSION maximum (1.80 > 1.75)', { BENCH_SPEND_RUN_CAP_USD: '1.80', BENCH_CONFIRM_SPEND: '1.80' }, 'caps: turn <= 0.05, run <= 1.75 (extension mode), turn <= run'],
    ['the per-turn cap above 0.05 in the extension mode', { BENCH_SPEND_TURN_CAP_USD: '0.06', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75' }, 'caps: turn <= 0.05, run <= 1.75 (extension mode), turn <= run'],
    ['the run cap above the ACCEPTANCE maximum (mode unset, 0.70 > 0.65)', { BENCH_TRIAL_MODE: undefined, BENCH_SPEND_RUN_CAP_USD: '0.70', BENCH_CONFIRM_SPEND: '0.70' }, 'caps: turn <= 0.05, run <= 0.65 (acceptance mode), turn <= run'],
    ['a mode that is not exactly dev-multi ("Dev-Multi") is the acceptance mode: 0.70 is refused', { BENCH_TRIAL_MODE: 'Dev-Multi', BENCH_SPEND_RUN_CAP_USD: '0.70', BENCH_CONFIRM_SPEND: '0.70' }, 'caps: turn <= 0.05, run <= 0.65 (acceptance mode), turn <= run'],
    ['a consultative flag that differs from its confirmation', { CONSULT_V2: '0' }, 'consultative confirmations match the flags as the route will see them'],
    ['ROUTE_FLIGHT_HANG_KHONG_GUARD ON', { ROUTE_FLIGHT_HANG_KHONG_GUARD: '1' }, 'ROUTE_FLIGHT_HANG_KHONG_GUARD is UNSET or OFF for this run'],
    ['ROUTE_TOOL_OFFER_GUARD ON', { ROUTE_TOOL_OFFER_GUARD: '1' }, 'ROUTE_TOOL_OFFER_GUARD is UNSET or OFF for this run'],
    ['OPENAI_API_KEY UNSET', { OPENAI_API_KEY: undefined }, 'OPENAI_API_KEY present (value never shown)'],
    ['SERPER_API_KEY with whitespace inside', { SERPER_API_KEY: 'serper 456' }, 'SERPER_API_KEY present (value never shown)'],
    ['CI set', { CI: 'true' }, 'CI is not set'],
    ['a proxy variable set', { HTTPS_PROXY: 'http://proxy.invalid:8080' }, 'no proxy, preload, trust-store or TLS switch (the network is the one the allow-list judges)'],
    ['the output folder missing', { BENCH_TRIAL_OUT_DIR: undefined }, 'every other check of the real trial (preflight, as the run does it)'],
  ]
  for (const [label, change, name] of cases) {
    it(`${label}: the condition "${name}" is KHÔNG ĐẠT`, () => {
      const cs = report({ ...GOOD, ...change })
      expect(failing(cs)).toContain(name)
      expect(netCalls).toBe(0)
    })
  }
  it('a question file that is a copy of a benchmark question is KHÔNG ĐẠT (the copy check is in the report)', async () => {
    const { UAT_TURNS } = await import('./questions')
    const cs = report({ ...GOOD }, `D1|D1|1|${UAT_TURNS[0].text}`)
    expect(failing(cs).some(n => n.startsWith('question file'))).toBe(true)
  })
  it('a question file that could not be read is KHÔNG ĐẠT', () => {
    expect(failing(report({ ...GOOD }, null))).toContain('question file read and checked')
  })
})

describe('keys never appear in the report', () => {
  it('the formatted report contains neither fake key, and reports the key by name only', () => {
    const text = formatConditionReport(report({ ...GOOD }))
    expect(text).not.toContain(KEY_OPENAI)
    expect(text).not.toContain(KEY_SERPER)
    expect(text).toMatch(/OPENAI_API_KEY present \(value never shown\)/)
    expect(text).toMatch(/TỔNG: mọi điều kiện ĐẠT/)
  })
  it('a failing run still never shows a key, even when the failure line is about the key', () => {
    const text = formatConditionReport(report({ ...GOOD, SERPER_API_KEY: 'serper 456' }))
    expect(text).not.toContain(KEY_OPENAI)
    expect(text).not.toContain(KEY_SERPER)
    expect(text).toMatch(/TỔNG: \d+ điều kiện KHÔNG ĐẠT — không chạy/)
  })
})
