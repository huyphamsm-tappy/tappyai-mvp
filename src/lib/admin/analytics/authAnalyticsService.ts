// authAnalyticsService — the SINGLE source of truth for Authentication Analytics
// business logic (SR-4). Every consumer (dashboards, APIs, reports, exports,
// notifications, Founder + Investor dashboards) calls THIS service; no SQL, KPI
// math, or aggregation lives anywhere else.
//
// Data sources (no duplicated aggregation — both are already rolled up):
//   • auth_daily_rollup   (grain: VN-day × platform × method) — login/success/
//                           failure counts, first/returning logins, unique_users.
//   • user_acquisition    (per-user dimension) — signup attributes incl.
//                           app_version / country / language / source.
//
// Filter coverage (see FILTER MATRIX in the Step 4 report):
//   • rollup metrics  → from, to, platform, method
//   • acquisition     → from, to, platform, method, app_version, country, language
//
// The admin client is imported lazily so the pure functions below stay
// dependency-free and unit-testable.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthAnalyticsFilter {
  from?: string          // 'YYYY-MM-DD' inclusive (VN day)
  to?: string            // 'YYYY-MM-DD' inclusive (VN day)
  platform?: string
  method?: string
  app_version?: string   // acquisition only
  country?: string       // acquisition only
  language?: string      // acquisition only
}

export interface RollupRow {
  snapshot_date: string
  platform: string
  method: string
  signups: number
  logins_success: number
  logins_failed: number
  first_logins: number
  returning_logins: number
  unique_users: number
}

export interface AcquisitionRow {
  signup_method: string | null
  signup_platform: string | null
  signup_app_version: string | null
  signup_country: string | null
  signup_language: string | null
  acquisition_source: string | null
  signup_at: string | null
}

export interface AuthSummary {
  signups: number
  logins_success: number
  logins_failed: number
  first_logins: number
  returning_logins: number
  login_success_rate: number      // 0..1 (§7 KPI)
  first_login_conversion: number  // first_logins / signups, 0..1 (§7 KPI)
}

export interface ProviderBreakdown {
  method: string
  signups: number
  logins_success: number
  logins_failed: number
  login_success_rate: number
}

export interface PlatformBreakdown {
  platform: string
  signups: number
  logins_success: number
  logins_failed: number
  login_success_rate: number
}

export interface DailyTrendPoint {
  date: string
  signups: number
  logins_success: number
  logins_failed: number
  unique_users: number
}

export type AcquisitionDimension =
  | 'method' | 'platform' | 'app_version' | 'country' | 'language' | 'source'

export interface DimensionCount { key: string; users: number }

// ── Pure KPI + aggregation logic (the single home — SR-4) ────────────────────

export function loginSuccessRate(success: number, failed: number): number {
  const total = success + failed
  return total === 0 ? 0 : success / total
}

export function firstLoginConversion(firstLogins: number, signups: number): number {
  return signups === 0 ? 0 : firstLogins / signups
}

/** Sum the rollup rows into headline totals + KPIs.
 *  Note: unique_users is intentionally NOT summed here (summing per-day distinct
 *  counts over-counts a user active on multiple days) — see getDailyTrend for
 *  the correct per-day figure. */
export function summarizeRollup(rows: RollupRow[]): AuthSummary {
  const t = rows.reduce(
    (a, r) => ({
      signups: a.signups + r.signups,
      logins_success: a.logins_success + r.logins_success,
      logins_failed: a.logins_failed + r.logins_failed,
      first_logins: a.first_logins + r.first_logins,
      returning_logins: a.returning_logins + r.returning_logins,
    }),
    { signups: 0, logins_success: 0, logins_failed: 0, first_logins: 0, returning_logins: 0 }
  )
  return {
    ...t,
    login_success_rate: loginSuccessRate(t.logins_success, t.logins_failed),
    first_login_conversion: firstLoginConversion(t.first_logins, t.signups),
  }
}

function groupRollup<K extends 'method' | 'platform'>(rows: RollupRow[], key: K) {
  const map = new Map<string, { signups: number; logins_success: number; logins_failed: number }>()
  for (const r of rows) {
    const k = r[key]
    const cur = map.get(k) ?? { signups: 0, logins_success: 0, logins_failed: 0 }
    cur.signups += r.signups
    cur.logins_success += r.logins_success
    cur.logins_failed += r.logins_failed
    map.set(k, cur)
  }
  return map
}

export function providerBreakdown(rows: RollupRow[]): ProviderBreakdown[] {
  return [...groupRollup(rows, 'method')]
    .map(([method, v]) => ({ method, ...v, login_success_rate: loginSuccessRate(v.logins_success, v.logins_failed) }))
    .sort((a, b) => b.signups + b.logins_success - (a.signups + a.logins_success))
}

export function platformBreakdown(rows: RollupRow[]): PlatformBreakdown[] {
  return [...groupRollup(rows, 'platform')]
    .map(([platform, v]) => ({ platform, ...v, login_success_rate: loginSuccessRate(v.logins_success, v.logins_failed) }))
    .sort((a, b) => b.logins_success - a.logins_success)
}

export function dailyTrend(rows: RollupRow[]): DailyTrendPoint[] {
  const map = new Map<string, DailyTrendPoint>()
  for (const r of rows) {
    const cur = map.get(r.snapshot_date) ?? { date: r.snapshot_date, signups: 0, logins_success: 0, logins_failed: 0, unique_users: 0 }
    cur.signups += r.signups
    cur.logins_success += r.logins_success
    cur.logins_failed += r.logins_failed
    cur.unique_users += r.unique_users // per-day sum across platform×method (approx; see report)
    map.set(r.snapshot_date, cur)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const ACQ_FIELD: Record<AcquisitionDimension, keyof AcquisitionRow> = {
  method: 'signup_method',
  platform: 'signup_platform',
  app_version: 'signup_app_version',
  country: 'signup_country',
  language: 'signup_language',
  source: 'acquisition_source',
}

export function countAcquisitionByDimension(rows: AcquisitionRow[], dim: AcquisitionDimension): DimensionCount[] {
  const field = ACQ_FIELD[dim]
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = (r[field] as string | null) ?? 'unknown'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map].map(([key, users]) => ({ key, users })).sort((a, b) => b.users - a.users)
}

// ── Data access (thin; filters applied per source) ───────────────────────────

async function client(injected?: SupabaseClient): Promise<SupabaseClient> {
  return injected ?? (await import('@/lib/supabase/admin')).createAdminClient()
}

export async function fetchRollup(filter: AuthAnalyticsFilter, injected?: SupabaseClient): Promise<RollupRow[]> {
  const c = await client(injected)
  let q = c.from('auth_daily_rollup').select('snapshot_date, platform, method, signups, logins_success, logins_failed, first_logins, returning_logins, unique_users')
  if (filter.from) q = q.gte('snapshot_date', filter.from)
  if (filter.to) q = q.lte('snapshot_date', filter.to)
  if (filter.platform) q = q.eq('platform', filter.platform)
  if (filter.method) q = q.eq('method', filter.method)
  const { data, error } = await q
  if (error) { console.error('[authAnalytics] fetchRollup:', error.message); return [] }
  return (data ?? []) as RollupRow[]
}

export async function fetchAcquisition(filter: AuthAnalyticsFilter, injected?: SupabaseClient): Promise<AcquisitionRow[]> {
  const c = await client(injected)
  let q = c.from('user_acquisition').select('signup_method, signup_platform, signup_app_version, signup_country, signup_language, acquisition_source, signup_at')
  if (filter.from) q = q.gte('signup_at', `${filter.from}T00:00:00+07:00`)
  if (filter.to) q = q.lte('signup_at', `${filter.to}T23:59:59+07:00`)
  if (filter.platform) q = q.eq('signup_platform', filter.platform)
  if (filter.method) q = q.eq('signup_method', filter.method)
  if (filter.app_version) q = q.eq('signup_app_version', filter.app_version)
  if (filter.country) q = q.eq('signup_country', filter.country)
  if (filter.language) q = q.eq('signup_language', filter.language)
  const { data, error } = await q
  if (error) { console.error('[authAnalytics] fetchAcquisition:', error.message); return [] }
  return (data ?? []) as AcquisitionRow[]
}

// ── Public reusable API (consumed by dashboards / APIs / reports / exports /
//    notifications / Founder + Investor dashboards) ────────────────────────────

export const authAnalyticsService = {
  async getSummary(filter: AuthAnalyticsFilter, c?: SupabaseClient): Promise<AuthSummary> {
    return summarizeRollup(await fetchRollup(filter, c))
  },
  async getByProvider(filter: AuthAnalyticsFilter, c?: SupabaseClient): Promise<ProviderBreakdown[]> {
    return providerBreakdown(await fetchRollup(filter, c))
  },
  async getByPlatform(filter: AuthAnalyticsFilter, c?: SupabaseClient): Promise<PlatformBreakdown[]> {
    return platformBreakdown(await fetchRollup(filter, c))
  },
  async getDailyTrend(filter: AuthAnalyticsFilter, c?: SupabaseClient): Promise<DailyTrendPoint[]> {
    return dailyTrend(await fetchRollup(filter, c))
  },
  async getAcquisitionBreakdown(filter: AuthAnalyticsFilter, dim: AcquisitionDimension, c?: SupabaseClient): Promise<DimensionCount[]> {
    return countAcquisitionByDimension(await fetchAcquisition(filter, c), dim)
  },
}

export type AuthAnalyticsService = typeof authAnalyticsService
