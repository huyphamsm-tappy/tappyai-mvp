'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatInt, formatPct } from '@/lib/admin/analytics/authAnalyticsClient'
import type { AuthSummary } from '@/lib/admin/analytics/authAnalyticsService'

// Presentational (props only — no fetch), so it's reusable by the Auth Dashboard,
// Founder Dashboard, and Investor Dashboard, and easy to unit-test.
export function AuthKpiCards({ summary, loading, error }: {
  summary: AuthSummary | null
  loading?: boolean
  error?: string | null
}) {
  const cards: { label: string; value: string }[] = summary
    ? [
        { label: 'Signups', value: formatInt(summary.signups) },
        { label: 'Logins (success)', value: formatInt(summary.logins_success) },
        { label: 'Logins (failed)', value: formatInt(summary.logins_failed) },
        { label: 'Login success rate', value: formatPct(summary.login_success_rate) },
        { label: 'First logins', value: formatInt(summary.first_logins) },
        { label: 'Signup → first login', value: formatPct(summary.first_login_conversion) },
      ]
    : []

  if (error) return <div role="alert" className="text-sm text-red-500">{error}</div>

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="auth-kpi-cards">
      {loading || !summary
        ? Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-8 w-16 rounded bg-muted animate-pulse" /></CardContent></Card>
          ))
        : cards.map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{c.value}</div></CardContent>
            </Card>
          ))}
    </div>
  )
}
