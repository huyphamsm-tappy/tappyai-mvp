// activationAnalyticsService — the SINGLE source of truth for Activation
// Analytics business logic (SR-4), sibling to authAnalyticsService.ts (kept
// separate: distinct KPI domain per the Business KPI Dictionary, not a
// duplication). Every consumer (dashboards, APIs, reports, exports,
// notifications, Founder + Investor dashboards) calls THIS service.
//
// Data source (no duplicated aggregation — already rolled up):
//   • activation_daily_rollup (grain: VN-day × platform × signup_source × rule_version)
//
// Rule metadata is resolved through the Rule Provider (§2.4a), never a
// concrete Rule Source — this service does not import the registry directly.
//
// The admin client is imported lazily so the pure functions below stay
// dependency-free and unit-testable.

import type { SupabaseClient } from '@supabase/supabase-js'
import { inCodeActivationRuleProvider, type ActivationRuleProvider } from '@/lib/admin/analytics/activationRuleProvider'
import { evaluateActivationRule } from '@/lib/admin/analytics/activationRuleEngine'
import { toDomainEvent, type RawUserEventRow } from '@/lib/admin/analytics/activationEvaluationRunner'
import type { RuleEvaluationResult } from '@/lib/admin/analytics/activationRuleEngine'
import type { ActivationRule } from '@/lib/admin/analytics/activationRules/registry'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActivationAnalyticsFilter {
  from?: string          // 'YYYY-MM-DD' inclusive (VN day, signup date)
  to?: string            // 'YYYY-MM-DD' inclusive (VN day, signup date)
  platform?: string
  rule_version?: string  // defaults to the currently active rule (§2.8)
}

export interface ActivationRollupRow {
  snapshot_date: string
  platform: string
  signup_source: string
  rule_version: string
  signups_in_cohort: number
  activated_count: number
  activated_within_7d_count: number
  avg_time_to_activation_seconds: number | null
}

export interface ActivationSummary {
  signups: number
  activated_count: number
  activation_rate: number             // 0..1 (§2.4/§2.8 KPI)
  avg_time_to_activation_seconds: number | null
  rule_version: string | null
}

export interface ActivationSourceBreakdown {
  signup_source: string
  signups: number
  activated_count: number
  activation_rate: number
}

export interface ActivationPlatformBreakdown {
  platform: string
  signups: number
  activated_count: number
  activation_rate: number
}

export interface ActivationTrendPoint {
  date: string
  signups: number
  activated_count: number
  activation_rate: number
}

// ── Pure KPI + aggregation logic (the single home — SR-4) ────────────────────

export function activationRate(activated: number, signups: number): number {
  return signups === 0 ? 0 : activated / signups
}

/** Weighted average across rollup rows (weighted by each row's activated_count). */
export function avgTimeToActivation(rows: ActivationRollupRow[]): number | null {
  let weighted = 0
  let count = 0
  for (const r of rows) {
    if (r.avg_time_to_activation_seconds == null || r.activated_count === 0) continue
    weighted += r.avg_time_to_activation_seconds * r.activated_count
    count += r.activated_count
  }
  return count === 0 ? null : weighted / count
}

export function summarizeRollup(rows: ActivationRollupRow[], ruleVersion: string | null): ActivationSummary {
  const t = rows.reduce(
    (a, r) => ({ signups: a.signups + r.signups_in_cohort, activated_count: a.activated_count + r.activated_count }),
    { signups: 0, activated_count: 0 },
  )
  return {
    ...t,
    activation_rate: activationRate(t.activated_count, t.signups),
    avg_time_to_activation_seconds: avgTimeToActivation(rows),
    rule_version: ruleVersion,
  }
}

export function sourceBreakdown(rows: ActivationRollupRow[]): ActivationSourceBreakdown[] {
  const map = new Map<string, { signups: number; activated_count: number }>()
  for (const r of rows) {
    const cur = map.get(r.signup_source) ?? { signups: 0, activated_count: 0 }
    cur.signups += r.signups_in_cohort
    cur.activated_count += r.activated_count
    map.set(r.signup_source, cur)
  }
  return [...map]
    .map(([signup_source, v]) => ({ signup_source, ...v, activation_rate: activationRate(v.activated_count, v.signups) }))
    .sort((a, b) => b.signups - a.signups)
}

export function platformBreakdown(rows: ActivationRollupRow[]): ActivationPlatformBreakdown[] {
  const map = new Map<string, { signups: number; activated_count: number }>()
  for (const r of rows) {
    const cur = map.get(r.platform) ?? { signups: 0, activated_count: 0 }
    cur.signups += r.signups_in_cohort
    cur.activated_count += r.activated_count
    map.set(r.platform, cur)
  }
  return [...map]
    .map(([platform, v]) => ({ platform, ...v, activation_rate: activationRate(v.activated_count, v.signups) }))
    .sort((a, b) => b.signups - a.signups)
}

export function dailyTrend(rows: ActivationRollupRow[]): ActivationTrendPoint[] {
  const map = new Map<string, { signups: number; activated_count: number }>()
  for (const r of rows) {
    const cur = map.get(r.snapshot_date) ?? { signups: 0, activated_count: 0 }
    cur.signups += r.signups_in_cohort
    cur.activated_count += r.activated_count
    map.set(r.snapshot_date, cur)
  }
  return [...map]
    .map(([date, v]) => ({ date, ...v, activation_rate: activationRate(v.activated_count, v.signups) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Data access (thin; rule_version defaults to the active rule) ─────────────

async function client(injected?: SupabaseClient): Promise<SupabaseClient> {
  return injected ?? (await import('@/lib/supabase/admin')).createAdminClient()
}

function resolveRuleVersion(filter: ActivationAnalyticsFilter, provider: ActivationRuleProvider): string | null {
  if (filter.rule_version) return filter.rule_version
  return provider.getActiveRule()?.ruleVersion ?? null
}

export async function fetchRollup(
  filter: ActivationAnalyticsFilter,
  injected?: SupabaseClient,
  provider: ActivationRuleProvider = inCodeActivationRuleProvider,
): Promise<{ rows: ActivationRollupRow[]; ruleVersion: string | null }> {
  const ruleVersion = resolveRuleVersion(filter, provider)
  const c = await client(injected)
  let q = c.from('activation_daily_rollup').select(
    'snapshot_date, platform, signup_source, rule_version, signups_in_cohort, activated_count, activated_within_7d_count, avg_time_to_activation_seconds',
  )
  if (filter.from) q = q.gte('snapshot_date', filter.from)
  if (filter.to) q = q.lte('snapshot_date', filter.to)
  if (filter.platform) q = q.eq('platform', filter.platform)
  if (ruleVersion) q = q.eq('rule_version', ruleVersion)
  const { data, error } = await q
  if (error) { console.error('[activationAnalytics] fetchRollup:', error.message); return { rows: [], ruleVersion } }
  return { rows: (data ?? []) as ActivationRollupRow[], ruleVersion }
}

// ── Public reusable API (consumed by dashboards / APIs / reports / exports /
//    notifications / Founder + Investor dashboards) ────────────────────────────

export const activationAnalyticsService = {
  async getSummary(filter: ActivationAnalyticsFilter, c?: SupabaseClient): Promise<ActivationSummary> {
    const { rows, ruleVersion } = await fetchRollup(filter, c)
    return summarizeRollup(rows, ruleVersion)
  },
  async getBySource(filter: ActivationAnalyticsFilter, c?: SupabaseClient): Promise<ActivationSourceBreakdown[]> {
    return sourceBreakdown((await fetchRollup(filter, c)).rows)
  },
  async getByPlatform(filter: ActivationAnalyticsFilter, c?: SupabaseClient): Promise<ActivationPlatformBreakdown[]> {
    return platformBreakdown((await fetchRollup(filter, c)).rows)
  },
  async getDailyTrend(filter: ActivationAnalyticsFilter, c?: SupabaseClient): Promise<ActivationTrendPoint[]> {
    return dailyTrend((await fetchRollup(filter, c)).rows)
  },
  // Rule introspection (§7/§8) — resolved via the Provider, never the registry directly.
  getActiveRule(provider: ActivationRuleProvider = inCodeActivationRuleProvider): ActivationRule | null {
    return provider.getActiveRule()
  },
  getRuleById(id: string, provider: ActivationRuleProvider = inCodeActivationRuleProvider): ActivationRule | null {
    return provider.getRuleById(id)
  },
  // Diagnostic-only (§2.9/§7): computed live, never persisted. Not wired into
  // any dashboard in this phase.
  async getEvaluationResult(
    userId: string,
    ruleVersion?: string,
    c?: SupabaseClient,
    provider: ActivationRuleProvider = inCodeActivationRuleProvider,
  ): Promise<RuleEvaluationResult | null> {
    const rule = ruleVersion ? provider.getRuleById(ruleVersion) : provider.getActiveRule()
    if (!rule) return null
    const supabase = await client(c)
    const eventTypes = Array.from(new Set(rule.signals.map(s => s.eventType)))
    const { data, error } = await supabase
      .from('user_events')
      .select('event_type, metadata, session_id, client_timestamp')
      .eq('user_id', userId)
      .in('event_type', eventTypes)
    if (error) { console.error('[activationAnalytics] getEvaluationResult:', error.message); return null }
    return evaluateActivationRule(rule, ((data ?? []) as RawUserEventRow[]).map(toDomainEvent))
  },
}

export type ActivationAnalyticsService = typeof activationAnalyticsService
