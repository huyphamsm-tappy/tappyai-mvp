import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { vnToday } from '@/lib/config/product'
import { reconcileWindow, cohortWindow } from '@/lib/admin/analytics/rollupWindow'
import { acquisitionFromSignupEvent, upsertAcquisition, type AuthAnalyticsEvent } from '@/lib/admin/analytics/userAcquisitionService'
import { evaluateAndUpsertActivation, type RawUserEventRow } from '@/lib/admin/analytics/activationEvaluationRunner'
import { inCodeActivationRuleProvider } from '@/lib/admin/analytics/activationRuleProvider'

export const runtime = 'nodejs'
export const maxDuration = 60

// analytics-snapshot cron — Phase 1 Step 3 + Phase 2 Step 4. Runs 00:05 VN
// (17:05 UTC, ADR-008). Incremental + idempotent over a trailing VN-day window:
//   1. auth_daily_rollup       — recompute the window from user_events (fn_rollup_auth_daily).
//   2. user_acquisition        — ongoing population from signup events (reuses the
//      Step 2 service; first-write-wins protects existing rows).
//   3. last_login_at           — sync from auth.users.last_sign_in_at (fn_sync_last_login).
//   4. Activation (Phase 2)    — for users with new Rule-v1 signal events in the
//      window, evaluate + upsert activation state (reuses the Step 2 Engine/
//      Provider + Step 3 writer via the Step 4 runner); recompute
//      activation_daily_rollup (fn_rollup_activation_daily). Each step's error
//      is captured independently — a failure here never blocks steps 1–3.
// No APIs/dashboards/UI (those are later steps).

const RECONCILE_DAYS = 4 // today + 3 prior VN days

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { from, to } = reconcileWindow(vnToday(), RECONCILE_DAYS)

  // 1. auth_daily_rollup (idempotent recompute of the window)
  const { error: rollupError } = await supabase.rpc('fn_rollup_auth_daily', { p_from: from, p_to: to })

  // 2. user_acquisition — signups in the window → durable acquisition fields.
  //    Reuses the Step 2 mapper + writer (SR-4); idempotent (first-write-wins).
  const fromIso = new Date(`${from}T00:00:00+07:00`).toISOString()
  const { data: signups, error: signupErr } = await supabase
    .from('user_events')
    .select('user_id, anon_id, platform, app_version, device_type, country, language, client_timestamp, metadata')
    .eq('event_type', 'auth_signup_completed')
    .gte('created_at', fromIso)
    .not('user_id', 'is', null)
    .limit(5000)

  let acquisitionProcessed = 0
  for (const e of signups ?? []) {
    const input = acquisitionFromSignupEvent(e as AuthAnalyticsEvent)
    if (input) {
      const { error } = await upsertAcquisition(input, supabase)
      if (!error) acquisitionProcessed++
    }
  }

  // 3. last_login_at from auth.users (authoritative)
  const { error: lastLoginError } = await supabase.rpc('fn_sync_last_login')

  // 4. Activation (Phase 2 Step 4) — candidate users = anyone with a Rule-v1
  //    signal event in the window (reuses Step 1's domain events; no
  //    activation-specific event is queried here). Evaluated via the Step 4
  //    runner (Engine + Provider + Step 3 writer) — no evaluation/upsert logic
  //    duplicated here.
  const activeRule = inCodeActivationRuleProvider.getActiveRule()
  let activationProcessed = 0
  let activatedCount = 0
  let activationReadError: string | null = null

  if (activeRule) {
    const signalEventTypes = Array.from(new Set(activeRule.signals.map(s => s.eventType)))
    const { data: signalRows, error: signalErr } = await supabase
      .from('user_events')
      .select('user_id')
      .in('event_type', signalEventTypes)
      .gte('created_at', fromIso)
      .not('user_id', 'is', null)
      .limit(5000)
    activationReadError = signalErr?.message ?? null

    const candidateUserIds = Array.from(new Set((signalRows ?? []).map(r => r.user_id as string)))
    for (const userId of candidateUserIds) {
      const { data: events } = await supabase
        .from('user_events')
        .select('event_type, metadata, session_id, client_timestamp')
        .eq('user_id', userId)
        .in('event_type', signalEventTypes)
      const { activated } = await evaluateAndUpsertActivation(userId, (events ?? []) as RawUserEventRow[], supabase)
      activationProcessed++
      if (activated) activatedCount++
    }
  }

  // activation_daily_rollup (idempotent recompute of the window)
  const { error: activationRollupError } = await supabase.rpc('fn_rollup_activation_daily', { p_from: from, p_to: to })

  // 5. daily_snapshots (Module 01 Home Dashboard) — the same window, the same
  //    recompute-and-overwrite discipline as step 1, so a re-run reconciles
  //    late events instead of double-counting. TWO calls, not one:
  //
  //      * the rollup recomputes [from, to] and writes provisional rows;
  //      * finalisation closes every day OLDER than `from` (04 §7A).
  //
  //    They are separate so a failed recompute cannot silently finalise days it
  //    never reconciled. Like every step above, the error is captured rather
  //    than thrown — one failing rollup must not take the others down with it.
  const { error: snapshotRollupError } = await supabase.rpc('fn_rollup_daily_snapshots', { p_from: from, p_to: to })
  const { error: snapshotFinalizeError } = snapshotRollupError
    ? { error: null }
    : await supabase.rpc('fn_finalize_daily_snapshots', { p_before: from })

  // 6. cohort_metrics (Module 04 retention) — D1/D7/D30 per registration cohort.
  //
  //    `06` §6 specifies a SEPARATE `cohort-rollup` cron at 00:10 UTC. That is
  //    07:10 VN, seven hours INTO the Vietnamese day it would be measuring, so
  //    every count would be a partial day that changes by evening. This runs at
  //    00:05 VN instead, just after a VN day CLOSES — which is what ADR-008 is
  //    for — and adds no second cron.
  //
  //    The cohort window reaches 30 days FURTHER BACK than the activity window:
  //    a cohort from 30 days ago reaches its D30 milestone inside it. `vnToday`
  //    is passed explicitly so the function can tell a closed day from an open
  //    one without consulting the server clock.
  const cohorts = cohortWindow(vnToday(), RECONCILE_DAYS)
  const { error: cohortRollupError } = await supabase.rpc('fn_rollup_cohort_metrics', {
    p_from: cohorts.from,
    p_to: cohorts.to,
    p_today: to,
  })

  return NextResponse.json({
    ok: true,
    window: { from, to },
    cohortWindow: cohorts,
    rollupError: rollupError?.message ?? null,
    signupReadError: signupErr?.message ?? null,
    acquisitionProcessed,
    lastLoginError: lastLoginError?.message ?? null,
    activationReadError,
    activationProcessed,
    activatedCount,
    activationRollupError: activationRollupError?.message ?? null,
    snapshotRollupError: snapshotRollupError?.message ?? null,
    snapshotFinalizeError: snapshotFinalizeError?.message ?? null,
    cohortRollupError: cohortRollupError?.message ?? null,
  })
}
