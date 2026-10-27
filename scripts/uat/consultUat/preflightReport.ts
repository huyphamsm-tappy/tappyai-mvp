/**
 * Round 3f · the preflight report. It runs the same checks the real trial runs before anything is sent, one condition per line, and it sends
 * NOTHING: no network, no request, no spend. It never prints a value of a key; a key is reported SET or UNSET (and whether it contains whitespace).
 * Pure apart from the file that the caller reads and passes in (questionText).
 */
import { benchModeOf, benchSpendGateOn, capToScaled, checkBenchCaps, MAX_TURN_CAP_USD, maxRunCapUsd } from '@/lib/ai/budget/spendGate'
import { capabilityLevel } from '@/lib/config/consultFlags'
import { DDG_FALLBACK_HOSTS, OSM_FALLBACK_HOSTS, QUOTA_RESET_FLAG, WAVE2_FLAGS, WAVE2_FLAG_NEEDS, capabilityLevelReasons, wave2FlagReasons, wave2FlagState, benchSwitchState, connectionRedirectReasons, consultativeConfirmationReasons, openaiKeyShapeReasons, osmFallbackAllowed, preflight, quotaResetFlagReasons, quotaResetState, requestCapReasons } from './liveTrial'
import { parseDevQuestions, sha256OfText } from './devQuestions'

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
/** Added to the printed list in the extension mode only (BENCH_TRIAL_MODE=dev-multi): the three free OSM fallback endpoints of search_places, counted per host. */
export const DDG_ALLOW_TEXT = `; EXTENSION MODE ONLY, free DuckDuckGo fallback of web_search (counted per host, no cost, outside the request cap and the USD gate): ${DDG_FALLBACK_HOSTS.join(', ')} /html/ only`
export const OSM_ALLOW_TEXT = `; EXTENSION MODE ONLY, free OSM fallback of search_places (counted per host, no cost, outside the request cap and the USD gate): ${OSM_FALLBACK_HOSTS.join(', ')} on their exact paths`

const KEY_VARS = ['OPENAI_API_KEY', 'SERPER_API_KEY'] as const

export function conditionReport(input: PreflightReportInput): Condition[] {
  const { env } = input
  const out: Condition[] = []
  const add = (name: string, reasons: string[], okDetail: string) => {
    out.push({ name, ok: reasons.length === 0, detail: reasons.length === 0 ? okDetail : reasons.join('; ') })
  }

  add('cost gate ON (BENCH_SPEND_GATE=1)', benchSpendGateOn(env) ? [] : ['BENCH_SPEND_GATE is not 1'], 'ON')

  const mode = benchModeOf(env)
  const caps = checkBenchCaps(env.BENCH_SPEND_TURN_CAP_USD, env.BENCH_SPEND_RUN_CAP_USD, mode)
  add(`caps: turn <= ${MAX_TURN_CAP_USD}, run <= ${maxRunCapUsd(mode)} (${mode} mode), turn <= run`, caps.ok ? [] : caps.reasons,
    caps.ok ? `turn ${caps.turnUsd} USD, run ${caps.runUsd} USD` : '')

  add('Serper request cap armed in code (CONSULT_REQUEST_CAP=1 + a valid per-turn and per-run value, chosen by the owner)',
    requestCapReasons(env), `ON, per turn ${env.CONSULT_REQUEST_CAP_PER_TURN}, per run ${env.CONSULT_REQUEST_CAP_PER_RUN} (a count of requests, not a price)`)

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
    add('question file: parses, and no copy or near-copy of the benchmark (70% rule, judged on the user words only: judge notes are not counted)',
      parsed.ok ? [] : parsed.reasons, `${parsed.ok ? parsed.turns.length : 0} turns`)
    // Wave 2B: which file this is, so the owner can compare it with the SHA-256 on the approval form; the notes are named by id only, never shown.
    add('question file identity (informational): SHA-256, format version, judge notes withheld from the model',
      [], `sha256=${sha256OfText(input.questionText)} | ${parsed.ok ? `format v${parsed.formatVersion} | notes withheld: ${parsed.notes.length}${parsed.notes.length ? ` (${parsed.notes.map(n => n.id).join(', ')})` : ''}` : 'not parsed'}`)
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
    else if (k === 'OPENAI_API_KEY') reasons.push(...openaiKeyShapeReasons(env)) // the shape is judged here, on the key's own line; the Serper format is not verified
    add(`${k} present (value never shown)`, reasons, 'SET')
  }

  // The complete set of checks the real trial runs (caps, confirmation, folder on drive D, flags, allow-list, network switches).
  // The key-shape reason is reported once, on the key's own line above: it is not repeated in this one.
  const full = preflight(env, input.repoRoot, input.execArgv)
  const shape = new Set([...openaiKeyShapeReasons(env), ...quotaResetFlagReasons(env), ...wave2FlagReasons(env)])
  add('every other check of the real trial (preflight, as the run does it)', full.reasons.filter(r => !shape.has(r)), 'all passed')

  // Quota option (d): the value of the flag is checked here (unset, 0 or 1) and the state it gives is printed: ON only for mode dev-multi + flag 1. A 1 outside the extension mode has no effect.
  const quota = quotaResetState(env)
  const quotaReasons = quotaResetFlagReasons(env)
  const ignored = env[QUOTA_RESET_FLAG] === '1' && env.BENCH_TRIAL_MODE !== 'dev-multi'
  add('free-question quota reset per turn (information; the Free plan allows 10 questions a day)', quotaReasons,
    `${quota.on ? 'ON' : 'OFF'} (${quota.reason})${ignored ? ' | CẢNH BÁO: cờ không có hiệu lực ở chế độ này (chỉ BENCH_TRIAL_MODE=dev-multi); hạn mức Free vẫn áp dụng, run dừng ở lượt 11 nếu hơn 10 lượt' : quota.on ? ' | hạn mức Free được đặt lại mỗi lượt (chỉ đo tư vấn)' : ' | hạn mức Free 10 câu/ngày áp dụng như thật: run dừng ở lượt 11 nếu hơn 10 lượt'}`)

  // Wave 2: the product-behaviour flags (unset, 0 or 1; a value outside that is refused by name) and the state each really has.
  const w2 = wave2FlagState(env)
  add('wave-2 behaviour flags (information; each defaults to OFF = the old behaviour)', [...wave2FlagReasons(env), ...capabilityLevelReasons(env)], `CONSULT_CAPABILITY_LEVEL=${env.CONSULT_CAPABILITY_LEVEL ?? 'unset'} (mức hiệu lực L${capabilityLevel(env)}) | ` + WAVE2_FLAGS.map(k => `${k}=${env[k] ?? 'unset'} (${w2[k] === 'INERT' ? `INERT: KHÔNG CÓ HIỆU LỰC, cần ${WAVE2_FLAG_NEEDS[k]}=1` : w2[k]})`).join(' | '))

  // Wave 4 (C-PRE-0): the two bench-side switches and the state each really has (information only: neither can fail the preflight)
  const bs = benchSwitchState(env)
  add('bench switches (information)', [], `LEGACY_STREAM_TRACE=${env.LEGACY_STREAM_TRACE ?? 'unset'} (${bs.trace}) | BENCH_ALLOW_PUBLIC_PAGE_FETCH=${env.BENCH_ALLOW_PUBLIC_PAGE_FETCH ?? 'unset'} (${bs.page})`)

  const unmet = out.filter(c => !c.ok).length
  out.push({
    name: 'budget mode and limits in force (information)', ok: true,
    detail: `mode ${mode} (maximum run cap ${maxRunCapUsd(mode)} USD, per-turn ${MAX_TURN_CAP_USD} USD) | run cap ${env.BENCH_SPEND_RUN_CAP_USD ?? 'unset'} | per-turn cap ${env.BENCH_SPEND_TURN_CAP_USD ?? 'unset'} | L1 ${env.CONSULT_REQUEST_CAP_PER_TURN ?? 'unset'} | L2 ${env.CONSULT_REQUEST_CAP_PER_RUN ?? 'unset'} | conditions not met: ${unmet}`,
  })
  out.push({ name: 'allow-list the run may reach', ok: true, detail: ALLOW_LIST_TEXT + (osmFallbackAllowed(env) ? OSM_ALLOW_TEXT + DDG_ALLOW_TEXT : '') })
  return out
}

/** One line per condition. Contains no key value: keys are reported by name only. */
export function formatConditionReport(conditions: readonly Condition[]): string {
  const lines = conditions.map(c => `[${c.ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  const failed = conditions.filter(c => !c.ok).length
  lines.push(failed === 0 ? 'TỔNG: mọi điều kiện ĐẠT (preflight-only; không có request nào được gửi)' : `TỔNG: ${failed} điều kiện KHÔNG ĐẠT — không chạy`)
  return lines.join('\n')
}
