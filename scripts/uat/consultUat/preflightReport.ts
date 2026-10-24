/**
 * Round 3f · the preflight report. It runs the same checks the real trial runs before anything is sent, one condition per line, and it sends
 * NOTHING: no network, no request, no spend. It never prints a value of a key; a key is reported SET or UNSET (and whether it contains whitespace).
 * Pure apart from the file that the caller reads and passes in (questionText).
 */
import { benchSpendGateOn, capToScaled, checkBenchCaps } from '@/lib/ai/budget/spendGate'
import { connectionRedirectReasons, consultativeConfirmationReasons, preflight } from './liveTrial'
import { parseDevQuestions } from './devQuestions'

export interface Condition { name: string; ok: boolean; detail: string }

export interface PreflightReportInput {
  env: Record<string, string | undefined>
  repoRoot: string
  execArgv?: readonly string[]
  /** The text of the question file (BENCH_TRIAL_QUESTION_FILE), read by the caller; null when it could not be read. */
  questionText: string | null
}

/** The only hosts and paths the trial may reach. Printed so that the Owner sees the list being enforced. */
export const ALLOW_LIST_TEXT = 'https api.openai.com/v1/chat/completions; google.serper.dev /search /maps /shopping (default port only)'

const KEY_VARS = ['OPENAI_API_KEY', 'SERPER_API_KEY'] as const

export function conditionReport(input: PreflightReportInput): Condition[] {
  const { env } = input
  const out: Condition[] = []
  const add = (name: string, reasons: string[], okDetail: string) => {
    out.push({ name, ok: reasons.length === 0, detail: reasons.length === 0 ? okDetail : reasons.join('; ') })
  }

  add('cost gate ON (BENCH_SPEND_GATE=1)', benchSpendGateOn(env) ? [] : ['BENCH_SPEND_GATE is not 1'], 'ON')

  const caps = checkBenchCaps(env.BENCH_SPEND_TURN_CAP_USD, env.BENCH_SPEND_RUN_CAP_USD)
  add('caps: turn <= 0.05, run <= 0.65, turn <= run', caps.ok ? [] : caps.reasons,
    caps.ok ? `turn ${caps.turnUsd} USD, run ${caps.runUsd} USD` : '')

  const confirm = capToScaled(env.BENCH_CONFIRM_SPEND)
  const run = capToScaled(env.BENCH_SPEND_RUN_CAP_USD)
  add('BENCH_CONFIRM_SPEND equals the RUN cap exactly',
    confirm === null || run === null || confirm !== run ? ['BENCH_CONFIRM_SPEND is missing or is not exactly the run cap'] : [],
    'equal to the run cap')

  add('mode is dev-multi (BENCH_TRIAL_MODE=dev-multi)',
    env.BENCH_TRIAL_MODE === 'dev-multi' ? [] : ['BENCH_TRIAL_MODE must be exactly dev-multi'], 'dev-multi')

  if (input.questionText === null) {
    add('question file read and checked', ['the question file could not be read'], '')
  } else {
    const parsed = parseDevQuestions(input.questionText)
    add('question file: parses, and no copy or near-copy of the benchmark (70% rule)',
      parsed.ok ? [] : parsed.reasons, `${parsed.ok ? parsed.turns.length : 0} turns`)
  }

  add('consultative confirmations match the flags as the route will see them',
    consultativeConfirmationReasons(env), 'matched')

  const route = (env.ROUTE_FLIGHT_HANG_KHONG_GUARD ?? '').trim().toLowerCase()
  add('ROUTE_FLIGHT_HANG_KHONG_GUARD is UNSET or OFF for this run',
    route === '' || route === '0' || route === 'off' || route === 'false' ? [] : ['ROUTE_FLIGHT_HANG_KHONG_GUARD is ON: this run must not have it on'],
    route === '' ? 'UNSET' : 'OFF')

  const offer = (env.ROUTE_TOOL_OFFER_GUARD ?? '').trim().toLowerCase()
  add('ROUTE_TOOL_OFFER_GUARD is UNSET or OFF for this run',
    offer === '' || offer === '0' || offer === 'off' || offer === 'false' ? [] : ['ROUTE_TOOL_OFFER_GUARD is ON: this run must not have it on'],
    offer === '' ? 'UNSET' : 'OFF')

  add('no proxy, preload, trust-store or TLS switch (the network is the one the allow-list judges)',
    connectionRedirectReasons(env, input.execArgv, input.repoRoot), 'none set')

  add('CI is not set', (env.CI ?? '') !== '' ? ['CI is set: the trial never runs in CI'] : [], 'UNSET')

  for (const k of KEY_VARS) {
    const v = env[k]
    const reasons: string[] = []
    if (v === undefined || v.trim() === '') reasons.push(`${k} is UNSET`)
    else if (/\s/.test(v.trim())) reasons.push(`${k} contains whitespace inside the value`)
    add(`${k} present (value never shown)`, reasons, 'SET')
  }

  // The complete set of checks the real trial runs (caps, confirmation, folder on drive D, flags, allow-list, network switches).
  const full = preflight(env, input.repoRoot, input.execArgv)
  add('every other check of the real trial (preflight, as the run does it)', full.reasons, 'all passed')

  out.push({ name: 'allow-list the run may reach', ok: true, detail: ALLOW_LIST_TEXT })
  return out
}

/** One line per condition. Contains no key value: keys are reported by name only. */
export function formatConditionReport(conditions: readonly Condition[]): string {
  const lines = conditions.map(c => `[${c.ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  const failed = conditions.filter(c => !c.ok).length
  lines.push(failed === 0 ? 'TỔNG: mọi điều kiện ĐẠT (preflight-only; không có request nào được gửi)' : `TỔNG: ${failed} điều kiện KHÔNG ĐẠT — không chạy`)
  return lines.join('\n')
}
