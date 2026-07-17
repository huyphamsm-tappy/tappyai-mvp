'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatInt } from '@/lib/admin/analytics/authAnalyticsClient'
import type { DailyTrendPoint } from '@/lib/admin/analytics/authAnalyticsService'

// Lightweight daily-trend chart (div bars — same dependency-free approach as the
// existing /admin/analytics page; no chart library). Presentational + responsive.
export function AuthTrendChart({ points, loading, error }: {
  points: DailyTrendPoint[]
  loading?: boolean
  error?: string | null
}) {
  const max = Math.max(1, ...points.map((p) => p.logins_success))
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Daily logins (success)</CardTitle></CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="text-sm text-red-500">{error}</div>
        ) : loading && points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this range.</p>
        ) : (
          <div className="flex items-end gap-1 h-40 overflow-x-auto" data-testid="auth-trend-bars">
            {points.map((p) => (
              <div key={p.date} className="flex-1 min-w-[16px] flex flex-col items-center gap-1" title={`${p.date}: ${p.logins_success} logins, ${p.signups} signups`}>
                <span className="text-[10px] text-muted-foreground">{formatInt(p.logins_success)}</span>
                <div className="w-full bg-primary rounded-sm" style={{ height: `${Math.max((p.logins_success / max) * 120, p.logins_success > 0 ? 4 : 0)}px` }} />
                <span className="text-[10px] text-muted-foreground/70 truncate w-full text-center">{p.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
