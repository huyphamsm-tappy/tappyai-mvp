// @vitest-environment node
// LIVE TRIAL - REAL NETWORK, REAL MONEY. This file is SKIPPED unless BENCH_LIVE_TRIAL has exactly the confirmation text below; a plain `vitest run` and CI
// never run its body. It is meant to be run ONLY by the launcher (liveTrialLauncher.mjs), in a node process of its own: the launcher sets BENCH_LIVE_TRIAL and
// BENCH_TRIAL_ISOLATED (a random per-run nonce) for the child only, passes on an allow-list of environment variables, reads the child's output in memory and prints only
// the summary, and ENDS the child's whole process tree once the summary is out. Started any other way (BENCH_LIVE_TRIAL set but no nonce in BENCH_TRIAL_ISOLATED) this
// file REFUSES in beforeAll, before the route is imported and before anything is read or sent.
//
// It runs ONE development question through the REAL chat route of this process and the REAL network (through fetch AND node:https / node:http only https
// requests to api.openai.com /v1/chat/completions and google.serper.dev /search /maps /shopping are let through - anything else is blocked before it is sent, counted and
// reported as NOT CLEAN; transports that use neither fetch nor node:http(s) are not covered), through the same core the dry rehearsal runs (liveTrial.ts). When the trial
// is over the network is NOT given back (afterTrial: 'deny'): every later request fails before it is sent, until the process ends. The console is filtered before it prints.
//
// ENVIRONMENT NOTE: this file runs under the app project's vitest setup, which pins CONSULTATIVE_V1 and CONSULT_V2 to "0" when they are unset
// (src/test/consultativeFlag.setup.ts), BEFORE any code here runs. The production default of both is ON, so SET THEM EXPLICITLY to the production values.
// Because the setup overwrites the flags, the flags alone cannot show whether the Owner set them: the confirmation variables BENCH_EXPECT_CONSULTATIVE_V1 and
// BENCH_EXPECT_CONSULT_V2 exist for that reason. The Owner copies the Vercel production value of each flag into BOTH the flag and its confirmation; the trial is
// refused before anything is read or sent if a confirmation is missing, is not exactly 0 or 1, or differs from the flag the route will see. The summary prints
// the values that were in effect.
//
// WHAT THIS IS: a check of the ISOLATED LEGACY PATH. The benchmark-must-be-OFF flags (V4, V5, agent runtime, Responses API, Anthropic models…) are held OFF
// by the preflight; the route is exercised with a SIMULATED signed-in user (Supabase, age check and rate limit are simulated exactly as in the other route
// tests), so guest limits, memory and subscription are NOT measured. It does not prove equivalence with production. Costs are the ledger's ESTIMATES.
//
// HOW TO RUN (the Owner, never an agent): see D:/TappyAI-review-artifacts/consultative-round2g/trial-env-sheet.md. In short, in a PowerShell session set the variables listed
// there (never BENCH_LIVE_TRIAL), then:   node scripts/uat/consultUat/liveTrialLauncher.mjs
// VARIABLES (names only; values come from the Owner's own session): OPENAI_API_KEY, SERPER_API_KEY, BENCH_SPEND_GATE, BENCH_SPEND_TURN_CAP_USD,
// BENCH_SPEND_RUN_CAP_USD, BENCH_CONFIRM_SPEND, BENCH_EXPECT_CONSULTATIVE_V1, BENCH_EXPECT_CONSULT_V2, BENCH_TRIAL_QUESTION_FILE, BENCH_TRIAL_OUT_DIR, the benchmark flags.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { formatSummary, runLiveTrial } from './liveTrial'
import { parseDevQuestions } from './devQuestions'
import { REFUSED_BEGIN, REFUSED_END, SUMMARY_BEGIN, SUMMARY_END, marker } from './liveTrialLauncher.mjs'

const h = vi.hoisted(() => {
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => b, delete: () => b, then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0001' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

describe.skipIf(process.env.BENCH_LIVE_TRIAL !== 'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY')('LIVE trial: ONE development question through the real route (real network, real money)', () => {
  let POST: (req: never) => Promise<Response>
  // The launcher gives every run a random nonce (BENCH_TRIAL_ISOLATED). Not started by the launcher: refuse BEFORE anything is imported, read or sent (the launcher is what
  // ends this process and filters its output). A hand-typed value such as "1" is not a nonce.
  const nonce = process.env.BENCH_TRIAL_ISOLATED ?? ''
  const isolated = /^[0-9a-f]{32}$/.test(nonce)
  beforeAll(async () => {
    if (!isolated) throw new Error('the live trial runs only through the launcher: node scripts/uat/consultUat/liveTrialLauncher.mjs (nothing was imported, read or sent)')
    ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) // the route is imported BEFORE the fetch wrapper is installed
  }, 120_000)

  // Round 3c: BENCH_TRIAL_MODE=dev-multi runs the development turns of BENCH_TRIAL_QUESTION_FILE in this one process (devQuestions.ts validates them).
  const devMulti = process.env.BENCH_TRIAL_MODE === 'dev-multi'
  it.skipIf(devMulti)('runs the single trial turn in its own process, writes the evidence to drive D and prints a summary that contains no secret', async () => {
    const outcome = await runLiveTrial({ env: process.env, post: POST, afterTrial: 'deny' })
    if (outcome.kind === 'refused') {
      // eslint-disable-next-line no-console
      console.info(`${marker(REFUSED_BEGIN, nonce)}\n${outcome.reasons.join('\n')}\n${marker(REFUSED_END, nonce)}`)
      throw new Error('the trial was refused before anything was sent')
    }
    // eslint-disable-next-line no-console
    console.info(`${marker(SUMMARY_BEGIN, nonce)}\n${formatSummary(outcome.summary)}\n${marker(SUMMARY_END, nonce)}`)
    expect(outcome.summary.turnOk, 'the turn is not OK: stop and have the result reviewed').toBe(true)
    expect(outcome.summary.trialClean, 'NOT CLEAN: a host was blocked, a redirect was seen or the counts disagree - this is not a complete result').toBe(true)
  }, 240_000)

  it.skipIf(!devMulti)('runs the development turns in one process (BENCH_TRIAL_MODE=dev-multi): a run cap across turns, each turn closed on its own, one summary', async () => {
    const parsed = parseDevQuestions(readFileSync(process.env.BENCH_TRIAL_QUESTION_FILE!.trim(), 'utf8'))
    if (!parsed.ok) {
      // eslint-disable-next-line no-console
      console.info(`${marker(REFUSED_BEGIN, nonce)}\n${parsed.reasons.join('\n')}\n${marker(REFUSED_END, nonce)}`)
      throw new Error('the development questions were refused before anything was sent')
    }
    const outcome = await runLiveTrial({ env: process.env, post: POST, afterTrial: 'deny', turns: parsed.turns })
    if (outcome.kind === 'refused') {
      // eslint-disable-next-line no-console
      console.info(`${marker(REFUSED_BEGIN, nonce)}\n${outcome.reasons.join('\n')}\n${marker(REFUSED_END, nonce)}`)
      throw new Error('the development run was refused before anything was sent')
    }
    // eslint-disable-next-line no-console
    console.info(`${marker(SUMMARY_BEGIN, nonce)}\n${formatSummary(outcome.summary)}\n${marker(SUMMARY_END, nonce)}`)
    expect(outcome.summary.trialClean, 'NOT CLEAN: a host was blocked, a redirect was seen, late requests were refused, or the counts disagree').toBe(true)
  }, 3_600_000)
})
