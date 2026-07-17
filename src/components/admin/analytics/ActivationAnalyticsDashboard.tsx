'use client'

import { useCallback, useEffect, useState } from 'react'
import { activationAnalyticsClient, formatInt, formatPct, type PageMeta } from '@/lib/admin/analytics/activationAnalyticsClient'
import type {
  ActivationAnalyticsFilter, ActivationSummary, ActivationSourceBreakdown,
  ActivationPlatformBreakdown, ActivationTrendPoint,
} from '@/lib/admin/analytics/activationAnalyticsService'
import type { ActivationRule } from '@/lib/admin/analytics/activationRules/registry'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ActivationKpiCards } from './ActivationKpiCards'
import { ActivationFilters } from './ActivationFilters'
import { ActivationTrendChart } from './ActivationTrendChart'
import { AuthBreakdownTable, type Column } from './AuthBreakdownTable'

const PAGE = 25

// Container: owns filter state, reads the ONE API via activationAnalyticsClient,
// and feeds the reusable presentational components (AuthBreakdownTable reused
// verbatim — it's generic; KPI cards/filters/trend are same-shape siblings).
// Founder/Investor dashboards can reuse the same client + components with
// their own layout (SR-3/SR-4).
export function ActivationAnalyticsDashboard() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ActivationAnalyticsFilter>({})

  const [summary, setSummary] = useState<ActivationSummary | null>(null)
  const [rule, setRule] = useState<ActivationRule | null>(null)
  const [platform, setPlatform] = useState<ActivationPlatformBreakdown[]>([])
  const [trend, setTrend] = useState<ActivationTrendPoint[]>([])
  const [source, setSource] = useState<ActivationSourceBreakdown[]>([])
  const [sourcePage, setSourcePage] = useState<PageMeta | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, r, p, t, src] = await Promise.all([
        activationAnalyticsClient.summary(filter),
        activationAnalyticsClient.rule(filter),
        activationAnalyticsClient.byPlatform(filter),
        activationAnalyticsClient.trend(filter),
        activationAnalyticsClient.bySource(filter, { limit: PAGE, offset: 0 }),
      ])
      setSummary(s); setRule(r); setPlatform(p.data); setTrend(t)
      setSource(src.data); setSourcePage(src.meta?.page ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.activation.error.analytics'))
    } finally {
      setLoading(false)
    }
  }, [filter, t])

  useEffect(() => { load() }, [load])

  const loadMoreSource = async () => {
    if (!sourcePage) return
    const next = await activationAnalyticsClient.bySource(filter, { limit: PAGE, offset: sourcePage.offset + PAGE })
    setSource((cur) => [...cur, ...next.data]); setSourcePage(next.meta?.page ?? null)
  }

  const sourceCols: Column<ActivationSourceBreakdown>[] = [
    { key: 'signup_source', label: t('admin.activation.table.source'), render: (r) => r.signup_source },
    { key: 'signups', label: t('admin.activation.table.signups'), align: 'right', render: (r) => formatInt(r.signups) },
    { key: 'activated', label: t('admin.activation.table.activated'), align: 'right', render: (r) => formatInt(r.activated_count) },
    { key: 'rate', label: t('admin.activation.table.rate'), align: 'right', render: (r) => formatPct(r.activation_rate) },
  ]
  const platformCols: Column<ActivationPlatformBreakdown>[] = [
    { key: 'platform', label: t('admin.activation.table.platform'), render: (r) => r.platform },
    { key: 'signups', label: t('admin.activation.table.signups'), align: 'right', render: (r) => formatInt(r.signups) },
    { key: 'activated', label: t('admin.activation.table.activated'), align: 'right', render: (r) => formatInt(r.activated_count) },
    { key: 'rate', label: t('admin.activation.table.rate'), align: 'right', render: (r) => formatPct(r.activation_rate) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.activation.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.activation.subtitle')}</p>
      </div>
      <ActivationFilters value={filter} onChange={setFilter} onReset={() => setFilter({})} />
      <ActivationKpiCards summary={summary} rule={rule} loading={loading} error={error} />
      <ActivationTrendChart points={trend} loading={loading} error={error} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AuthBreakdownTable title={t('admin.activation.table.bySource')} columns={sourceCols} rows={source} loading={loading} error={error} hasMore={sourcePage?.hasMore} onLoadMore={loadMoreSource} />
        <AuthBreakdownTable title={t('admin.activation.table.byPlatform')} columns={platformCols} rows={platform} loading={loading} error={error} />
      </div>
    </div>
  )
}
