import type { SupabaseClient } from '@supabase/supabase-js'

// userAnalyticsService — Module 04 User Analytics business logic (SR-4).
//
// SOURCES ARE ALREADY-ROLLED-UP TABLES, never raw events:
//   • daily_snapshots (M01) — grain VN day × platform: total/new/returning
//                             users and DAU/WAU/MAU.
//   • subscriptions         — per-user plan + status.
//
// `01_ARCH` §8: *"Dashboards read pre-computed rollups, never live aggregate
// queries."* That is why nothing here touches `user_events`. The rollup already
// bucketed each day into Asia/Ho_Chi_Minh (ADR-008), so `snapshot_date` is a VN
// calendar day and no timezone conversion happens in this layer — doing it
// again here would be a second implementation of the rule that could drift.
//
// ── WHAT MODULE 04 ASKS FOR AND WHAT IS NOT SHIPPED ─────────────────────────
//
// `03_Module_Architecture.md` M04 names five sections. Three are served here:
// Growth, Engagement, and the Subscription Funnel. The rest, each named so the
// omission is deliberate rather than forgotten:
//
//   RETENTION (D1/D7/D30 cohorts, monthly cohort table)
//     Requires `cohort_metrics`, whose authoritative DDL is `04` §7 and which
//     DOES NOT EXIST in this database. It is a production migration, and a
//     migration needs its own Owner authorization. Not faked, not computed live
//     off raw events behind §8's back.
//
//   CHURN RATE
//     No authoritative source defines churn — inactive for how long, measured
//     against which population? Picking one would be inventing the metric.
//
//   SESSIONS PER USER · AVERAGE SESSION DURATION
//     `user_events` carries `session_id` but no session end. Duration would have
//     to be approximated as last-minus-first event, which systematically
//     undercounts and is nowhere defined. An invented approximation rendered as
//     a KPI is exactly what these rules exist to prevent.
//
//   DEMOGRAPHICS · ACQUISITION
//     Already served by `authAnalyticsService.getAcquisitionBreakdown` over
//     `user_acquisition` (country, language, platform, source). Re-implementing
//     them here would be a second answer to one question.

// ── Types ───────────────────────────────────────────────────────────────────

/** One `daily_snapshots` row, restricted to what Module 04 reads. */
export interface GrowthRow {
  snapshot_date: string
  total_users: number
  new_users: number
  returning_users: number
  dau: number
  wau: number
  mau: number
}

export interface SubscriptionRow {
  plan: string | null
  status: string | null
}

export interface UserAnalyticsFilter {
  from?: string // 'YYYY-MM-DD' inclusive, VN day
  to?: string   // 'YYYY-MM-DD' inclusive, VN day
}

/**
 * `empty` = the rollup produced nothing (the pipeline has not run).
 * `error` = the table could not be read. They are different facts and send an
 * operator to different places, so they never collapse into one.
 */
export type AnalyticsStatus = 'ok' | 'empty' | 'error'

export interface GrowthPoint {
  date: string
  totalUsers: number
  newUsers: number
}

export interface GrowthResult {
  status: AnalyticsStatus
  series: GrowthPoint[]
  /** Month-over-month change in cumulative users. Null unless two ADJACENT months exist. */
  momGrowthRate: number | null
}

export interface EngagementPoint {
  date: string
  dau: number
  wau: number
  mau: number
  /** DAU/MAU. Null when MAU is 0 — an undefined ratio is not zero. */
  stickiness: number | null
}

export interface EngagementResult {
  status: AnalyticsStatus
  series: EngagementPoint[]
}

export interface FunnelResult {
  status: AnalyticsStatus
  free: number
  pro: number
  /** pro / totalUsers. Null when there is no population to divide by. */
  conversionRate: number | null
}

const EMPTY_GROWTH: GrowthResult = { status: 'empty', series: [], momGrowthRate: null }
const EMPTY_ENGAGEMENT: EngagementResult = { status: 'empty', series: [] }

const byDateAsc = <T extends { snapshot_date: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1))

// ── Pure derivation ─────────────────────────────────────────────────────────

/**
 * Month-over-month growth in cumulative users.
 *
 * Uses the LAST day present in each month: the cumulative total mid-month is a
 * partial month, and comparing it to a complete one reports a fall that never
 * happened. Returns null unless the two most recent months are ADJACENT and the
 * earlier one has a non-zero total — growth from nothing has no rate.
 */
function monthOverMonth(sorted: readonly GrowthRow[]): number | null {
  const lastOfMonth = new Map<string, GrowthRow>()
  for (const row of sorted) lastOfMonth.set(row.snapshot_date.slice(0, 7), row) // ascending ⇒ last wins

  const months = [...lastOfMonth.keys()].sort()
  if (months.length < 2) return null

  const [prevKey, currKey] = months.slice(-2)
  const prev = lastOfMonth.get(prevKey)!
  const curr = lastOfMonth.get(currKey)!

  // Adjacency, computed on the calendar rather than by string distance.
  const [py, pm] = prevKey.split('-').map(Number)
  const [cy, cm] = currKey.split('-').map(Number)
  if (cy * 12 + cm - (py * 12 + pm) !== 1) return null

  if (prev.total_users === 0) return null
  return curr.total_users / prev.total_users - 1
}

export function deriveGrowth(rows: readonly GrowthRow[]): GrowthResult {
  if (rows.length === 0) return EMPTY_GROWTH
  const sorted = byDateAsc(rows)
  return {
    status: 'ok',
    series: sorted.map((r) => ({
      date: r.snapshot_date,
      totalUsers: r.total_users,
      newUsers: r.new_users,
    })),
    momGrowthRate: monthOverMonth(sorted),
  }
}

export function deriveEngagement(rows: readonly GrowthRow[]): EngagementResult {
  if (rows.length === 0) return EMPTY_ENGAGEMENT
  return {
    status: 'ok',
    series: byDateAsc(rows).map((r) => ({
      date: r.snapshot_date,
      dau: r.dau,
      wau: r.wau,
      mau: r.mau,
      // Guarded rather than computed-then-checked: `0/0` is NaN and `n/0` is
      // Infinity, and both render as a KPI if they ever reach the UI.
      stickiness: r.mau > 0 ? r.dau / r.mau : null,
    })),
  }
}

/** Stripe and Apple IAP write these with inconsistent casing and stray spaces. */
const norm = (v: string | null): string => (v ?? '').trim().toLowerCase()

export function deriveFunnel(subs: readonly SubscriptionRow[], totalUsers: number): FunnelResult {
  // Only an ACTIVE pro subscription makes a Pro user. A cancelled row is
  // history, and counting it would inflate conversion permanently.
  const pro = subs.filter((s) => norm(s.plan) === 'pro' && norm(s.status) === 'active').length

  if (totalUsers <= 0) {
    return { status: 'empty', free: 0, pro, conversionRate: null }
  }

  return {
    status: 'ok',
    // Clamped: more active Pro rows than known users means one of the two
    // sources is stale. A negative population is unreadable as anything but a
    // bug, so it is never produced.
    free: Math.max(0, totalUsers - pro),
    pro,
    conversionRate: pro / totalUsers,
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

const SNAPSHOT_COLUMNS = 'snapshot_date, total_users, new_users, returning_users, dau, wau, mau'

/**
 * Read the snapshot window. Never throws — a Module 04 panel that 500s because
 * one table is unreachable is worse than one that says so.
 */
async function readSnapshots(
  supabase: SupabaseClient,
  filter: UserAnalyticsFilter
): Promise<GrowthRow[] | 'error'> {
  try {
    let q = supabase
      .from('daily_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .eq('platform', 'all')
      .order('snapshot_date', { ascending: false })
      .limit(400) // ~13 months of daily rows; bounds an unfiltered request

    if (filter.from) q = q.gte('snapshot_date', filter.from)
    if (filter.to) q = q.lte('snapshot_date', filter.to)

    const { data, error } = await q
    if (error) {
      console.error('[analytics][users] snapshot read failed:', error.message)
      return 'error'
    }
    return (data ?? []) as GrowthRow[]
  } catch (e) {
    console.error('[analytics][users] snapshot read threw:', e instanceof Error ? e.message : e)
    return 'error'
  }
}

export const userAnalyticsService = {
  async getGrowth(supabase: SupabaseClient, filter: UserAnalyticsFilter): Promise<GrowthResult> {
    const rows = await readSnapshots(supabase, filter)
    if (rows === 'error') return { status: 'error', series: [], momGrowthRate: null }
    return deriveGrowth(rows)
  },

  async getEngagement(supabase: SupabaseClient, filter: UserAnalyticsFilter): Promise<EngagementResult> {
    const rows = await readSnapshots(supabase, filter)
    if (rows === 'error') return { status: 'error', series: [] }
    return deriveEngagement(rows)
  },

  /**
   * The subscription funnel.
   *
   * `totalUsers` comes from the most recent snapshot rather than a `count(*)`
   * on `profiles`: the funnel's denominator must be the same population the
   * growth chart shows, or the two panels disagree on screen.
   */
  async getFunnel(supabase: SupabaseClient, filter: UserAnalyticsFilter): Promise<FunnelResult> {
    const rows = await readSnapshots(supabase, filter)
    if (rows === 'error') return { status: 'error', free: 0, pro: 0, conversionRate: null }

    const latest = byDateAsc(rows).at(-1)
    try {
      const { data, error } = await supabase.from('subscriptions').select('plan, status')
      if (error) {
        console.error('[analytics][users] subscription read failed:', error.message)
        return { status: 'error', free: 0, pro: 0, conversionRate: null }
      }
      return deriveFunnel((data ?? []) as SubscriptionRow[], latest?.total_users ?? 0)
    } catch (e) {
      console.error('[analytics][users] subscription read threw:', e instanceof Error ? e.message : e)
      return { status: 'error', free: 0, pro: 0, conversionRate: null }
    }
  },
}
