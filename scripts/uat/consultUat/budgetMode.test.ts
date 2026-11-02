// @vitest-environment node
// Closure round 2 · Part A — the run-cap MAXIMUM depends on the budget MODE. Acceptance (the default) keeps $0.65; the explicitly chosen extension mode
// (BENCH_TRIAL_MODE exactly `dev-multi`) may go up to $1.75; the per-turn maximum is $0.10 in every mode (Owner decision 26/10/2026, Wave 3-FIX R3-06; it was $0.05); an unknown or missing mode is the acceptance
// mode (fail-closed). MOCK-ONLY: no network, no key, no paid call. fetch is a tripwire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RUN_CAP_EXTENSION_USD, MAX_RUN_CAP_USD, MAX_TURN_CAP_USD, benchModeOf, checkBenchCaps, maxRunCapUsd, readBenchCaps, reserveSpend,
} from '@/lib/ai/budget/spendGate'
import { BENCH_FLAG_NAMES, BenchRefusal, __resetBenchProcessGuardForTests, createBenchRunner, runBench } from './liveRunner'
import { formatSummary, preflight, runLiveTrial, type TrialOutcome } from './liveTrial'
import { conditionReport, formatConditionReport } from './preflightReport'
import { GOOD_ENV, applyEnv, memFs, options, turnTransport } from './liveRunner.testkit'
import { UAT_TURNS, type UatTurn } from './questions'

const REPO = process.cwd()
const CAPS = { CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450' }

beforeEach(() => { __resetBenchProcessGuardForTests(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('TRIPWIRE: a real request must never be made') })) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); applyEnv({}); delete process.env.BENCH_TRIAL_MODE; __resetBenchProcessGuardForTests() })

describe('the constants', () => {
  it('turn maximum 0.10 in every mode; run maximum 0.65 (acceptance) and 1.75 (extension)', () => {
    expect(MAX_TURN_CAP_USD).toBe(0.10)
    expect(MAX_RUN_CAP_USD).toBe(0.65)
    expect(MAX_RUN_CAP_EXTENSION_USD).toBe(1.75)
    expect(maxRunCapUsd('acceptance')).toBe(0.65)
    expect(maxRunCapUsd('extension')).toBe(1.75)
  })
})

describe('benchModeOf: only the exact text dev-multi chooses the extension mode', () => {
  it('dev-multi → extension', () => { expect(benchModeOf({ BENCH_TRIAL_MODE: 'dev-multi' })).toBe('extension') })
  it.each([undefined, '', ' ', 'dev-multi ', ' dev-multi', 'Dev-Multi', 'DEV-MULTI', 'devmulti', 'dev_multi', 'extension', 'acceptance', '1', 'true', 'dev-multi\n'])('%j → acceptance (fail-closed)', (v) => {
    expect(benchModeOf({ BENCH_TRIAL_MODE: v })).toBe('acceptance')
  })
  it('no argument reads process.env', () => {
    vi.stubEnv('BENCH_TRIAL_MODE', 'dev-multi'); expect(benchModeOf()).toBe('extension')
    vi.stubEnv('BENCH_TRIAL_MODE', undefined); expect(benchModeOf()).toBe('acceptance')
  })
})

describe('checkBenchCaps by mode (judged on the exact decimal text)', () => {
  const okAcc: Array<[string, string]> = [['0.05', '0.65'], ['0.10', '0.65'], ['0.02', '0.02'], ['0.05', '0.649999999999']]
  const badAcc: Array<[string, string]> = [['0.05', '0.70'], ['0.05', '0.650000000001'], ['0.05', '1.75'], ['0.05', '1.74'], ['0.11', '0.65']]
  const okExt: Array<[string, string]> = [['0.05', '1.75'], ['0.10', '1.75'], ['0.05', '1.750'], ['0.05', '0.65'], ['0.02', '1.2'], ['0.05', '1.749999999999']]
  const badExt: Array<[string, string]> = [['0.05', '1.76'], ['0.05', '1.750000000001'], ['0.05', '1.8'], ['0.05', '2'], ['0.11', '1.75'], ['0.10000000001', '1.75'], ['0.05', '1.7500000000001'], ['0.05', '5e-2'], ['0.05', 'NaN'], ['0.05', ''], ['0.05', '-1.75'], ['0.2', '0.1']]
  it.each(okAcc)('acceptance accepts %s / %s', (t, r) => { expect(checkBenchCaps(t, r, 'acceptance').ok).toBe(true) })
  it.each(badAcc)('acceptance refuses %s / %s', (t, r) => { expect(checkBenchCaps(t, r, 'acceptance').ok).toBe(false) })
  it.each(okExt)('extension accepts %s / %s', (t, r) => { expect(checkBenchCaps(t, r, 'extension').ok).toBe(true) })
  it.each(badExt)('extension refuses %s / %s', (t, r) => { expect(checkBenchCaps(t, r, 'extension').ok).toBe(false) })
  it('a caller that does not say the mode gets the strict maximum (0.65): 1.75 is refused', () => {
    expect(checkBenchCaps('0.05', '0.65').ok).toBe(true)
    expect(checkBenchCaps('0.05', '1.75').ok).toBe(false)
  })
  it('the refusal names the maximum of the mode', () => {
    const a = checkBenchCaps('0.05', '1.75', 'acceptance')
    const e = checkBenchCaps('0.05', '1.76', 'extension')
    expect(!a.ok && a.reasons.join(' ')).toContain('maximum of $0.65')
    expect(!e.ok && e.reasons.join(' ')).toContain('maximum of $1.75')
  })
  it('numbers are read through their decimal text: 1.75 passes, 1.7500001 does not (extension)', () => {
    expect(checkBenchCaps(0.05, 1.75, 'extension').ok).toBe(true)
    expect(checkBenchCaps(0.05, 1.7500001, 'extension').ok).toBe(false)
  })
})

describe('readBenchCaps (what every paid call is judged by) reads the mode from the same environment', () => {
  const env = (mode: string | undefined, run: string) => ({ BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: run, BENCH_TRIAL_MODE: mode })
  it('extension 1.75 → accepted', () => { expect(readBenchCaps(env('dev-multi', '1.75'))).toEqual({ turnUsd: 0.05, runUsd: 1.75 }) })
  it('extension 1.76 → null', () => { expect(readBenchCaps(env('dev-multi', '1.76'))).toBeNull() })
  it.each([undefined, '', 'Dev-Multi', 'dev-multi '])('mode %j with 1.75 → null (acceptance maximum)', (m) => { expect(readBenchCaps(env(m, '1.75'))).toBeNull() })
  it('acceptance 0.65 → accepted; 0.70 → null', () => {
    expect(readBenchCaps(env(undefined, '0.65'))).toEqual({ turnUsd: 0.05, runUsd: 0.65 })
    expect(readBenchCaps(env(undefined, '0.70'))).toBeNull()
  })
  it('a paid call asks the same thing: with the mode missing and 1.75 in the environment, reserveSpend refuses (no_caps)', () => {
    vi.stubEnv('BENCH_SPEND_GATE', '1'); vi.stubEnv('BENCH_SPEND_TURN_CAP_USD', '0.05'); vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '1.75'); vi.stubEnv('BENCH_TRIAL_MODE', undefined)
    expect(() => reserveSpend('llm:test', 0.01)).toThrow(/caps are missing or invalid/)
  })
})

describe('the runner (assertBenchAllowed) enforces the mode on both entries', () => {
  /** An environment of the given mode whose caps are exactly turn / run, declared consistently. */
  function setup(mode: string | undefined, turn: number, run: number, confirm: number | null = run) {
    const env: Record<string, string | undefined> = { ...GOOD_ENV, BENCH_SPEND_TURN_CAP_USD: String(turn), BENCH_SPEND_RUN_CAP_USD: String(run) }
    applyEnv(env)
    if (mode === undefined) delete process.env.BENCH_TRIAL_MODE; else process.env.BENCH_TRIAL_MODE = mode
    const fullEnv = { ...env, ...(mode === undefined ? {} : { BENCH_TRIAL_MODE: mode }) }
    const t = turnTransport()
    return { ...options({ chat: t.chat, turnCapUsd: turn, runCapUsd: run, confirmSpend: confirm === null ? null : { capUsd: confirm } }, fullEnv), t }
  }
  it('acceptance (mode unset) still refuses anything above 0.65, including 1.75', async () => {
    for (const run of [0.7, 1, 1.75]) {
      const { opts, t } = setup(undefined, 0.05, run)
      await expect(runBench(opts)).rejects.toBeInstanceOf(BenchRefusal)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
      expect(t.requests).toHaveLength(0)
    }
  })
  it('acceptance (mode unset) accepts exactly 0.65', () => {
    const { opts } = setup(undefined, 0.05, 0.65)
    expect(() => createBenchRunner(opts)).not.toThrow()
  })
  it('extension accepts 1.75 and a lower cap', () => {
    for (const run of [1.75, 1.2, 0.65]) {
      __resetBenchProcessGuardForTests()
      const { opts } = setup('dev-multi', 0.05, run)
      expect(() => createBenchRunner(opts)).not.toThrow()
    }
  })
  it('extension refuses above 1.75, by name of the maximum, before any request', async () => {
    for (const run of [1.76, 2, 10, 1.7500000000001]) {
      __resetBenchProcessGuardForTests()
      const { opts, t } = setup('dev-multi', 0.05, run)
      await expect(runBench(opts)).rejects.toBeInstanceOf(BenchRefusal)
      await expect(runBench(opts)).rejects.toThrow(/1\.75|maximum/i)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
      expect(t.requests).toHaveLength(0)
    }
  })
  it('extension refuses a per-turn cap above 0.10 (the per-turn maximum is the same in every mode), and accepts 0.10', () => {
    for (const turn of [0.11, 0.101, 1]) {
      __resetBenchProcessGuardForTests()
      const { opts, t } = setup('dev-multi', turn, 1.75)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
      expect(t.requests).toHaveLength(0)
    }
    __resetBenchProcessGuardForTests()
    expect(() => createBenchRunner(setup('dev-multi', 0.10, 1.75).opts)).not.toThrow()
  })
  it('a mode that is not exactly dev-multi is the acceptance mode: 1.75 is refused', () => {
    for (const mode of ['Dev-Multi', 'dev-multi ', 'extension', '']) {
      __resetBenchProcessGuardForTests()
      const { opts } = setup(mode, 0.05, 1.75)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
    }
  })
  it('the confirmation must equal the run cap exactly: 1.74 for a 1.75 run, no confirmation, and 0.65 for a 1.75 run are all refused', () => {
    for (const confirm of [1.74, 0.65, null]) {
      __resetBenchProcessGuardForTests()
      const { opts } = setup('dev-multi', 0.05, 1.75, confirm)
      expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
    }
    __resetBenchProcessGuardForTests()
    const { opts } = setup('dev-multi', 0.05, 1.75, 1.75)
    expect(() => createBenchRunner(opts)).not.toThrow()
  })
  it('the environment (process.env) and the options must agree on the caps in the extension mode too', () => {
    const { opts } = setup('dev-multi', 0.05, 1.75)
    process.env.BENCH_SPEND_RUN_CAP_USD = '1.2'
    expect(() => createBenchRunner(opts)).toThrow(BenchRefusal)
  })
})

describe('the preflight reports the mode and holds every path to it', () => {
  const base = (over: Record<string, string | undefined>): Record<string, string | undefined> => ({
    BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75', BENCH_TRIAL_MODE: 'dev-multi',
    ...CAPS, CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULT_V2: '1',
    BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-closure2/mock-out', ...over,
  })
  const reasons = (over: Record<string, string | undefined>) => preflight(base(over), REPO, []).reasons.join(' | ')
  it('extension: 1.75 / 0.05 passes the caps check (no cap reason at all)', () => {
    const p = preflight(base({}), REPO, [])
    expect(p.caps).toEqual({ turnUsd: 0.05, runUsd: 1.75 })
    expect(p.reasons.some(r => /cap \(/.test(r))).toBe(false)
  })
  it('extension: 1.76 and a per-turn 0.11 are refused; a per-turn 0.10 is not', () => {
    expect(reasons({ BENCH_SPEND_RUN_CAP_USD: '1.76', BENCH_CONFIRM_SPEND: '1.76' })).toMatch(/run cap \(1\.76\) is above the maximum of \$1\.75/)
    expect(reasons({ BENCH_SPEND_TURN_CAP_USD: '0.11' })).toMatch(/per-turn cap \(0\.11\) is above the maximum of \$0\.1 /)
    expect(reasons({ BENCH_SPEND_TURN_CAP_USD: '0.10' })).not.toMatch(/per-turn cap/)
  })
  it('mode missing or wrong: 1.75 is refused with the acceptance maximum named', () => {
    for (const mode of [undefined, 'Dev-Multi']) expect(reasons({ BENCH_TRIAL_MODE: mode })).toMatch(/run cap \(1\.75\) is above the maximum of \$0\.65/)
  })
  it('a confirmation that differs from the run cap is refused', () => {
    expect(reasons({ BENCH_CONFIRM_SPEND: '1.7' })).toContain('BENCH_CONFIRM_SPEND is missing or is not exactly the run cap')
  })
  it('the report has a caps line that names the mode, and an information line with mode, run cap, per-turn cap, L1, L2 and how many conditions are not met; no key', () => {
    for (const k of Object.keys(base({}))) vi.stubEnv(k, base({})[k])
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-SECRET-mode-1')
    const cs = conditionReport({ env: process.env, repoRoot: REPO, execArgv: [], questionText: null })
    const capsLine = cs.find(c => c.name.startsWith('caps:'))!
    expect(capsLine.name).toBe('caps: turn <= 0.1, run <= 1.75 (extension mode), turn <= run')
    expect(capsLine.ok).toBe(true)
    const info = cs.find(c => c.name.startsWith('budget mode and limits'))!
    expect(info.ok).toBe(true)
    expect(info.detail).toMatch(/mode extension \(maximum run cap 1\.75 USD, per-turn 0\.1 USD\) \| run cap 1\.75 \| per-turn cap 0\.05 \| L1 15 \| L2 450 \| conditions not met: \d+/)
    expect(formatConditionReport(cs)).not.toContain('sk-test-SECRET-mode-1')
  })
  it('the report in the acceptance mode says 0.65', () => {
    for (const k of Object.keys(base({}))) vi.stubEnv(k, base({ BENCH_TRIAL_MODE: undefined, BENCH_SPEND_RUN_CAP_USD: '0.65', BENCH_CONFIRM_SPEND: '0.65' })[k])
    const cs = conditionReport({ env: process.env, repoRoot: REPO, execArgv: [], questionText: null })
    expect(cs.find(c => c.name.startsWith('caps:'))!.name).toBe('caps: turn <= 0.1, run <= 0.65 (acceptance mode), turn <= run')
    expect(cs.find(c => c.name.startsWith('budget mode and limits'))!.detail).toContain('mode acceptance (maximum run cap 0.65 USD')
  })
})

describe('TRIAL SUMMARY records the mode and the caps (mock provider, fake network)', () => {
  const mock = (): UatTurn[] => UAT_TURNS.slice(0, 3).map(t => ({ id: t.id, conversation: t.conversation, turn: t.turn, text: `[mock] ${t.id}` }))
  function provider() {
    let n = 0
    const post = async (req: unknown) => {
      n++
      await (req as { json(): Promise<unknown> }).json()
      await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' }).catch(() => undefined)
      const h = reserveSpend('llm:consult', 0.03)!
      h.settle(0.01, { tokensIn: 1, tokensOut: 1, cachedIn: 0 })
      return new Response(`0:"answer ${n}"\nd:{"finishReason":"stop"}\n`)
    }
    return { post, calls: () => n }
  }
  const env = (mode: string | undefined, run: string) => {
    for (const k of [...BENCH_FLAG_NAMES, 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE']) vi.stubEnv(k, undefined)
    const e: Record<string, string | undefined> = {
      BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: run, BENCH_CONFIRM_SPEND: run, ...CAPS, BENCH_TRIAL_MODE: mode,
      BENCH_TRIAL_QUESTION_FILE: 'D:/fake/question.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-closure2/mock-out',
      OPENAI_API_KEY: 'sk-test-SECRET-mode-2', SERPER_API_KEY: 'serper-SECRET-mode-3',
      CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
    }
    for (const [k, v] of Object.entries(e)) vi.stubEnv(k, v)
  }
  const run = (post: unknown): Promise<TrialOutcome> =>
    runLiveTrial({ env: process.env, post, fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch, fs: memFs(), repoRoot: REPO, now: () => 1_000, turns: mock(), afterTrial: 'deny' } as never)
  it('extension 1.75: runs, and the summary says mode extension, run cap 1.75, per-turn 0.05', async () => {
    env('dev-multi', '1.75')
    const m = provider()
    const out = await run(m.post)
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(m.calls()).toBe(3)
    expect(out.summary.budget).toEqual({ mode: 'extension', turnCapUsd: 0.05, runCapUsd: 1.75 })
    const text = formatSummary(out.summary)
    expect(text).toContain('budget mode: extension | run cap 1.75 USD (maximum of the mode 1.75) | per-turn cap 0.05 USD (maximum 0.1)')
    expect(text).toContain('request cap (a COUNT of Serper requests, not a price): per turn 15 | per run 450')
    expect(text).not.toContain('sk-test-SECRET-mode-2'); expect(text).not.toContain('serper-SECRET-mode-3')
  })
  it('acceptance (mode unset) with 1.75: REFUSED before any request', async () => {
    env(undefined, '1.75')
    const m = provider()
    const out = await run(m.post)
    expect(out.kind).toBe('refused')
    if (out.kind !== 'refused') return
    expect(out.reasons.join(' ')).toMatch(/run cap \(1\.75\) is above the maximum of \$0\.65/)
    expect(m.calls()).toBe(0)
  })
  it('acceptance (mode unset) with 0.65 runs, and the summary says mode acceptance', async () => {
    env(undefined, '0.65')
    const out = await run(provider().post)
    expect(out.kind).toBe('ran')
    if (out.kind !== 'ran') return
    expect(out.summary.budget.mode).toBe('acceptance')
    expect(formatSummary(out.summary)).toContain('budget mode: acceptance | run cap 0.65 USD (maximum of the mode 0.65)')
  })
  it('extension with 1.76: REFUSED before any request', async () => {
    env('dev-multi', '1.76')
    const m = provider()
    const out = await run(m.post)
    expect(out.kind).toBe('refused')
    expect(m.calls()).toBe(0)
  })
})
