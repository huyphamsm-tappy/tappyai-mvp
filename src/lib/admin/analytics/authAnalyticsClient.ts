// Client data-layer for Authentication Analytics — the shared way UI consumers
// (Dashboard, Founder, Investor) read the ONE API (/api/admin/analytics/auth).
// No business logic here: it only builds the query and unwraps the envelope.
// All calculations come from authAnalyticsService via the API (SR-4).

import type {
  AuthAnalyticsFilter, AuthSummary, ProviderBreakdown, PlatformBreakdown,
  DailyTrendPoint, DimensionCount, AcquisitionDimension,
} from '@/lib/admin/analytics/authAnalyticsService'

export type AuthView = 'summary' | 'provider' | 'platform' | 'trend' | 'acquisition'
export interface PageMeta { limit: number; offset: number; total: number; hasMore: boolean }

export interface FetchOpts { dimension?: AcquisitionDimension; limit?: number; offset?: number }

// Pure: build the API query string from a view + filter (+ options).
export function buildAuthQuery(view: AuthView, filter: AuthAnalyticsFilter, opts: FetchOpts = {}): string {
  const p = new URLSearchParams()
  p.set('view', view)
  if (opts.dimension) p.set('dimension', opts.dimension)
  ;(['from', 'to', 'platform', 'method', 'app_version', 'country', 'language'] as const).forEach((k) => {
    const v = filter[k]
    if (v) p.set(k, String(v))
  })
  if (opts.limit != null) p.set('limit', String(opts.limit))
  if (opts.offset != null) p.set('offset', String(opts.offset))
  return p.toString()
}

async function get<T>(view: AuthView, filter: AuthAnalyticsFilter, opts?: FetchOpts): Promise<{ data: T; meta?: { page: PageMeta } }> {
  const res = await fetch(`/api/admin/analytics/auth?${buildAuthQuery(view, filter, opts)}`)
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`)
  return json
}

export const authAnalyticsClient = {
  summary: (f: AuthAnalyticsFilter) => get<AuthSummary>('summary', f).then((r) => r.data),
  provider: (f: AuthAnalyticsFilter, o?: FetchOpts) => get<ProviderBreakdown[]>('provider', f, o),
  platform: (f: AuthAnalyticsFilter, o?: FetchOpts) => get<PlatformBreakdown[]>('platform', f, o),
  trend: (f: AuthAnalyticsFilter) => get<DailyTrendPoint[]>('trend', f).then((r) => r.data),
  acquisition: (f: AuthAnalyticsFilter, o: FetchOpts) => get<DimensionCount[]>('acquisition', f, o),
}

// Pure formatters (locale-aware, VN default). Reused by all consumers.
export const formatInt = (n: number | null | undefined): string =>
  new Intl.NumberFormat('vi-VN').format(Math.round(n ?? 0))
export const formatPct = (ratio: number | null | undefined): string =>
  `${(((ratio ?? 0) * 100)).toFixed(1)}%`
