// @vitest-environment node
// LIVE TRIAL - REAL NETWORK, REAL MONEY. This file is SKIPPED unless BENCH_LIVE_TRIAL has exactly the confirmation text below; a plain `vitest run` and CI
// never run its body. It runs ONE development question through the REAL chat route of this process and the REAL network (through fetch AND node:https /
// node:http only https requests to api.openai.com /v1/chat/completions and google.serper.dev /search /maps /shopping are let through - anything else is
// blocked before it is sent, counted and reported as NOT CLEAN; transports that use neither fetch nor node:http(s) are not covered), through the same core
// the dry rehearsal runs (liveTrial.ts).
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
// HOW TO RUN (the Owner, never an agent): see D:/TappyAI-review-artifacts/consultative-round2f/trial-env-sheet.md. In short, in a PowerShell session:
//   set the variables listed there, then
//   $env:BENCH_LIVE_TRIAL = 'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY'
//   npx vitest run --project app scripts/uat/consultUat/liveTrial.test.ts --reporter=verbose --silent=false
// VARIABLES (names only; values come from the Owner's own session): OPENAI_API_KEY, SERPER_API_KEY, BENCH_SPEND_GATE, BENCH_SPEND_TURN_CAP_USD,
// BENCH_SPEND_RUN_CAP_USD, BENCH_CONFIRM_SPEND, BENCH_EXPECT_CONSULTATIVE_V1, BENCH_EXPECT_CONSULT_V2, BENCH_TRIAL_QUESTION_FILE, BENCH_TRIAL_OUT_DIR, the benchmark flags,
// and BENCH_LIVE_TRIAL.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { formatSummary, runLiveTrial } from './liveTrial'

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
  beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000) // the route is imported BEFORE the fetch wrapper is installed

  it('runs the single trial turn, writes the evidence to drive D and prints a summary that contains no secret', async () => {
    const outcome = await runLiveTrial({ env: process.env, post: POST })
    if (outcome.kind === 'refused') throw new Error(`the trial was refused before anything was sent: ${outcome.reasons.join('; ')}`)
    // eslint-disable-next-line no-console
    console.info(formatSummary(outcome.summary))
    expect(outcome.summary.turnOk, 'the turn is not OK: stop and have the result reviewed').toBe(true)
    expect(outcome.summary.trialClean, 'NOT CLEAN: a host was blocked, a redirect was seen or the counts disagree - this is not a complete result').toBe(true)
  }, 240_000)
})
