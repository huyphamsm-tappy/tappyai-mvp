import type { SupabaseClient } from '@supabase/supabase-js'

// Module 01 Home Dashboard — reading `daily_snapshots`.
//
// `03_Module_Architecture.md` M01: *"Data from `daily_snapshots` (pre-computed)
// — no live queries to raw tables."* This module is the only place the Home
// reads them, and the derivation below is separated from the query so the rules
// are testable without a database.
//
// THE THREE RULES, and why each exists. A dashboard's failure mode is not an
// exception — it is a plausible-looking number that an operator then acts on.
//
//   1. NO DATA IS NOT ZERO. An empty table means the pipeline has not run.
//      Rendering `DAU 0` would state a measurement that was never taken.
//   2. OLD DATA MUST SAY SO — and must still be shown. Hiding a stale number
//      looks identical to a broken page; showing its age lets an operator judge it.
//   3. A DELTA NEEDS TWO ADJACENT POINTS. `+100%` against nothing, or against a
//      snapshot four days old, is a fabricated trend.
//
// WHICH SIX METRICS, AND WHY NO NEW PERMISSION
// The six columns `daily_snapshots` carries are user-activity aggregates, which
// `12_RBAC.md` §3 places under **User Analytics** — granted to all four roles.
// They contain no PII and no revenue. So the page's own `dashboard.home.view`
// is the honest gate and no permission is invented. Business/revenue metrics
// ARE role-restricted in §3 — and are precisely the columns this table does not
// have, because no source for them exists.

/** One row as the table stores it. Only the fields the Home consumes. */
export interface DailySnapshotRow {
  snapshot_date: string
  total_users: number
  new_users: number
  returning_users: number
  dau: number
  wau: number
  mau: number
  is_final: boolean
}

export type HomeKpiKey = 'dau' | 'wau' | 'mau' | 'new_users' | 'returning_users' | 'total_users'

export interface HomeKpi {
  key: HomeKpiKey
  value: number
  /** Change against the immediately preceding day. Null when there is no adjacent snapshot. */
  deltaVsPrevious: number | null
}

export type HomeKpiStatus = 'ok' | 'empty' | 'stale' | 'error'

export interface HomeKpis {
  status: HomeKpiStatus
  /** The day these numbers describe. Null when there is nothing to describe. */
  snapshotDate: string | null
  /** 04 §7A — false while the day is still inside the reconciliation window. */
  isFinal: boolean
  /** How many VN days old the newest snapshot is. Null when there is none. */
  ageDays: number | null
  kpis: HomeKpi[]
}

/**
 * How old the newest snapshot may be before the Home calls it stale.
 *
 * Two days, not one. The cron runs at 00:05 VN, so between midnight and the run
 * the newest snapshot is already "yesterday"; a one-day threshold would report
 * stale every single morning and train operators to ignore the badge. Two
 * tolerates that gap plus one missed run.
 */
export const HOME_STALE_AFTER_DAYS = 2

const KPI_KEYS: readonly HomeKpiKey[] = ['dau', 'wau', 'mau', 'new_users', 'returning_users', 'total_users']

/** Whole VN days between two `YYYY-MM-DD` strings. Both are calendar days, so no timezone enters here. */
function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`)
  const b = Date.parse(`${toDate}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Turn snapshot rows into the Home's KPI block.
 *
 * `rows` may arrive in any order; the newest is chosen here rather than trusted
 * from the query, so a change to the query's ORDER BY cannot silently invert
 * the delta.
 */
export function deriveHomeKpis(rows: readonly DailySnapshotRow[], vnToday: string): HomeKpis {
  if (rows.length === 0) {
    // Rule 1. Not `{ dau: 0 }` — there is no measurement to report.
    return { status: 'empty', snapshotDate: null, isFinal: false, ageDays: null, kpis: [] }
  }

  const sorted = [...rows].sort((a, b) => (a.snapshot_date < b.snapshot_date ? 1 : -1))
  const latest = sorted[0]
  const previous = sorted[1]

  const ageDays = daysBetween(latest.snapshot_date, vnToday)

  // Rule 3: a delta is only a DAILY change if the two rows are adjacent days.
  const adjacent = previous && daysBetween(previous.snapshot_date, latest.snapshot_date) === 1
    ? previous
    : undefined

  return {
    // Rule 2: stale still carries its numbers — see `ageDays`.
    status: ageDays > HOME_STALE_AFTER_DAYS ? 'stale' : 'ok',
    snapshotDate: latest.snapshot_date,
    isFinal: latest.is_final,
    ageDays,
    kpis: KPI_KEYS.map((key) => ({
      key,
      value: latest[key],
      deltaVsPrevious: adjacent ? latest[key] - adjacent[key] : null,
    })),
  }
}

/** The columns the Home reads. Named, never `*`. */
const SNAPSHOT_COLUMNS = 'snapshot_date, total_users, new_users, returning_users, dau, wau, mau, is_final'

/**
 * Read the two most recent `platform = 'all'` snapshots and derive the KPIs.
 *
 * Two rows is exactly what a daily delta needs — reading more would be data the
 * caller has no use for. Never throws: a Home that 500s because one panel's
 * table is unreachable is worse than a Home that says the panel is unavailable.
 */
export async function fetchHomeKpis(
  supabase: SupabaseClient,
  vnToday: string
): Promise<HomeKpis> {
  try {
    const { data, error } = await supabase
      .from('daily_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .eq('platform', 'all')
      .order('snapshot_date', { ascending: false })
      .limit(2)

    if (error) {
      console.error('[home][snapshot] read failed:', error.message)
      return { status: 'error', snapshotDate: null, isFinal: false, ageDays: null, kpis: [] }
    }
    return deriveHomeKpis((data ?? []) as DailySnapshotRow[], vnToday)
  } catch (e) {
    console.error('[home][snapshot] read threw:', e instanceof Error ? e.message : e)
    return { status: 'error', snapshotDate: null, isFinal: false, ageDays: null, kpis: [] }
  }
}
