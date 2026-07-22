'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatInt } from '@/lib/admin/analytics/activationAnalyticsClient'
import type { ActivationTrendPoint } from '@/lib/admin/analytics/activationAnalyticsService'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Daily activation-rate trend — same dependency-free div-bar approach as
// AuthTrendChart (no new chart library). Built as a sibling rather than a
// literal import of AuthTrendChart: that component is hardcoded to
// AuthAnalytics' own field names (`logins_success`/`signups`) and title, so
// reusing it unmodified for a different metric would mislabel the chart.
// AuthBreakdownTable, by contrast, IS generic (`Column<T>`) and is reused
// verbatim elsewhere in this dashboard — this is the one visual pattern that
// needed a same-shape sibling instead of a literal import.
export function ActivationTrendChart({ points, loading, error }: {
  points: ActivationTrendPoint[]
  loading?: boolean
  error?: string | null
}) {
  const { t } = useTranslation()
  const max = Math.max(1, ...points.map((p) => p.activated_count))
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t('admin.activation.chart.dailyActivations')}</CardTitle></CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="text-sm text-red-500">{error}</div>
        ) : loading && points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.common.loading')}</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.common.noDataRange')}</p>
        ) : (
          <div className="flex items-end gap-1 h-40 overflow-x-auto" data-testid="activation-trend-bars">
            {points.map((p) => (
              <div key={p.date} className="flex-1 min-w-[16px] flex flex-col items-center gap-1" title={`${p.date}: ${p.activated_count} activated, ${p.signups} signups`}>
                <span className="text-[10px] text-muted-foreground">{formatInt(p.activated_count)}</span>
                <div className="w-full bg-primary rounded-sm" style={{ height: `${Math.max((p.activated_count / max) * 120, p.activated_count > 0 ? 4 : 0)}px` }} />
                <span className="text-[10px] text-muted-foreground/70 truncate w-full text-center">{p.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
