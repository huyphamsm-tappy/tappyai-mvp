'use client'

import { useCallback, useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { authAnalyticsClient, formatInt, formatPct, type PageMeta } from '@/lib/admin/analytics/authAnalyticsClient'
import type {
  AuthAnalyticsFilter, AuthSummary, ProviderBreakdown, PlatformBreakdown,
  DailyTrendPoint, DimensionCount, AcquisitionDimension,
} from '@/lib/admin/analytics/authAnalyticsService'
import { AuthKpiCards } from './AuthKpiCards'
import { AuthFilters } from './AuthFilters'
import { AuthTrendChart } from './AuthTrendChart'
import { AuthBreakdownTable, type Column } from './AuthBreakdownTable'

const PAGE = 25
const DIMENSIONS: AcquisitionDimension[] = ['method', 'platform', 'app_version', 'country', 'language', 'source']

// Container: owns filter/dimension state, reads the ONE API via authAnalyticsClient,
// and feeds the reusable presentational components. Founder/Investor dashboards can
// reuse the same client + components with their own layout.
export function AuthAnalyticsDashboard() {
  const [filter, setFilter] = useState<AuthAnalyticsFilter>({})
  const [dimension, setDimension] = useState<AcquisitionDimension>('method')

  const [summary, setSummary] = useState<AuthSummary | null>(null)
  const [platform, setPlatform] = useState<PlatformBreakdown[]>([])
  const [trend, setTrend] = useState<DailyTrendPoint[]>([])
  const [provider, setProvider] = useState<ProviderBreakdown[]>([])
  const [providerPage, setProviderPage] = useState<PageMeta | null>(null)
  const [acq, setAcq] = useState<DimensionCount[]>([])
  const [acqPage, setAcqPage] = useState<PageMeta | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPrimary = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, p, t, pr] = await Promise.all([
        authAnalyticsClient.summary(filter),
        authAnalyticsClient.platform(filter, { limit: PAGE, offset: 0 }),
        authAnalyticsClient.trend(filter),
        authAnalyticsClient.provider(filter, { limit: PAGE, offset: 0 }),
      ])
      setSummary(s); setPlatform(p.data); setTrend(t)
      setProvider(pr.data); setProviderPage(pr.meta?.page ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [filter])

  const loadAcq = useCallback(async () => {
    try {
      const a = await authAnalyticsClient.acquisition(filter, { dimension, limit: PAGE, offset: 0 })
      setAcq(a.data); setAcqPage(a.meta?.page ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load acquisition')
    }
  }, [filter, dimension])

  useEffect(() => { loadPrimary() }, [loadPrimary])
  useEffect(() => { loadAcq() }, [loadAcq])

  const loadMoreProvider = async () => {
    if (!providerPage) return
    const next = await authAnalyticsClient.provider(filter, { limit: PAGE, offset: providerPage.offset + PAGE })
    setProvider((cur) => [...cur, ...next.data]); setProviderPage(next.meta?.page ?? null)
  }
  const loadMoreAcq = async () => {
    if (!acqPage) return
    const next = await authAnalyticsClient.acquisition(filter, { dimension, limit: PAGE, offset: acqPage.offset + PAGE })
    setAcq((cur) => [...cur, ...next.data]); setAcqPage(next.meta?.page ?? null)
  }

  const providerCols: Column<ProviderBreakdown>[] = [
    { key: 'method', label: 'Method', render: (r) => r.method },
    { key: 'signups', label: 'Signups', align: 'right', render: (r) => formatInt(r.signups) },
    { key: 'ok', label: 'Logins', align: 'right', render: (r) => formatInt(r.logins_success) },
    { key: 'fail', label: 'Failed', align: 'right', render: (r) => formatInt(r.logins_failed) },
    { key: 'rate', label: 'Success', align: 'right', render: (r) => formatPct(r.login_success_rate) },
  ]
  const platformCols: Column<PlatformBreakdown>[] = [
    { key: 'platform', label: 'Platform', render: (r) => r.platform },
    { key: 'signups', label: 'Signups', align: 'right', render: (r) => formatInt(r.signups) },
    { key: 'ok', label: 'Logins', align: 'right', render: (r) => formatInt(r.logins_success) },
    { key: 'rate', label: 'Success', align: 'right', render: (r) => formatPct(r.login_success_rate) },
  ]
  const acqCols: Column<DimensionCount>[] = [
    { key: 'key', label: dimension, render: (r) => r.key },
    { key: 'users', label: 'Users', align: 'right', render: (r) => formatInt(r.users) },
  ]

  return (
    <div className="space-y-6">
      <AuthFilters value={filter} onChange={setFilter} onReset={() => setFilter({})} />
      <AuthKpiCards summary={summary} loading={loading} error={error} />
      <AuthTrendChart points={trend} loading={loading} error={error} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AuthBreakdownTable title="By provider" columns={providerCols} rows={provider} loading={loading} error={error} hasMore={providerPage?.hasMore} onLoadMore={loadMoreProvider} />
        <AuthBreakdownTable title="By platform" columns={platformCols} rows={platform} loading={loading} error={error} />
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Acquisition by</span>
          <div className="w-40">
            <Select value={dimension} onValueChange={(v) => setDimension(v as AcquisitionDimension)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <AuthBreakdownTable title="Acquisition breakdown" columns={acqCols} rows={acq} loading={loading} error={error} hasMore={acqPage?.hasMore} onLoadMore={loadMoreAcq} />
      </div>
    </div>
  )
}
