// Client data-layer for Activation Analytics — the shared way UI consumers
// (Dashboard, Founder, Investor) read the ONE API (/api/admin/analytics/activation).
// No business logic here: it only builds the query and unwraps the envelope.
// All calculations come from activationAnalyticsService via the API (SR-4).

import type {
  ActivationAnalyticsFilter, ActivationSummary, ActivationSourceBreakdown,
  ActivationPlatformBreakdown, ActivationTrendPoint,
} from '@/lib/admin/analytics/activationAnalyticsService'
import type { ActivationRule } from '@/lib/admin/analytics/activationRules/registry'

export type ActivationView = 'summary' | 'by_source' | 'by_platform' | 'trend' | 'rule'
export interface PageMeta { limit: number; offset: number; total: number; hasMore: boolean }

export interface FetchOpts { limit?: number; offset?: number }

// Pure: build the API query string from a view + filter (+ options).
export function buildActivationQuery(view: ActivationView, filter: ActivationAnalyticsFilter, opts: FetchOpts = {}): string {
  const p = new URLSearchParams()
  p.set('view', view)
  ;(['from', 'to', 'platform', 'rule_version'] as const).forEach((k) => {
    const v = filter[k]
    if (v) p.set(k, String(v))
  })
  if (opts.limit != null) p.set('limit', String(opts.limit))
  if (opts.offset != null) p.set('offset', String(opts.offset))
  return p.toString()
}

async function get<T>(view: ActivationView, filter: ActivationAnalyticsFilter, opts?: FetchOpts): Promise<{ data: T; meta?: { page: PageMeta } }> {
  const res = await fetch(`/api/admin/analytics/activation?${buildActivationQuery(view, filter, opts)}`)
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`)
  return json
}

export const activationAnalyticsClient = {
  summary: (f: ActivationAnalyticsFilter) => get<ActivationSummary>('summary', f).then((r) => r.data),
  bySource: (f: ActivationAnalyticsFilter, o?: FetchOpts) => get<ActivationSourceBreakdown[]>('by_source', f, o),
  byPlatform: (f: ActivationAnalyticsFilter, o?: FetchOpts) => get<ActivationPlatformBreakdown[]>('by_platform', f, o),
  trend: (f: ActivationAnalyticsFilter) => get<ActivationTrendPoint[]>('trend', f).then((r) => r.data),
  rule: (f: ActivationAnalyticsFilter) => get<ActivationRule>('rule', f).then((r) => r.data),
}

// Pure formatters — reused verbatim in spirit from authAnalyticsClient's
// formatters (same implementation; not re-exported cross-module to avoid a
// coupling between the two independent client modules for two call sites).
export const formatInt = (n: number | null | undefined): string =>
  new Intl.NumberFormat('vi-VN').format(Math.round(n ?? 0))
export const formatPct = (ratio: number | null | undefined): string =>
  `${(((ratio ?? 0) * 100)).toFixed(1)}%`
