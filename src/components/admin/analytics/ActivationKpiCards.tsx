'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatInt, formatPct } from '@/lib/admin/analytics/activationAnalyticsClient'
import type { ActivationSummary } from '@/lib/admin/analytics/activationAnalyticsService'
import type { ActivationRule } from '@/lib/admin/analytics/activationRules/registry'

// Presentational (props only — no fetch), same shape as AuthKpiCards, so it's
// reusable by the Activation Dashboard, Founder Dashboard, and Investor
// Dashboard, and easy to unit-test. Includes a small "Activation Rule: vX"
// label sourced from `rule` (view=rule) — never hardcoded — so the dashboard
// stays honest about which rule produced the numbers (spec §9).
export function ActivationKpiCards({ summary, rule, loading, error }: {
  summary: ActivationSummary | null
  rule?: ActivationRule | null
  loading?: boolean
  error?: string | null
}) {
  const cards: { label: string; value: string }[] = summary
    ? [
        { label: 'Signups', value: formatInt(summary.signups) },
        { label: 'Activated', value: formatInt(summary.activated_count) },
        { label: 'Activation rate', value: formatPct(summary.activation_rate) },
        { label: 'Avg time to activation', value: formatDuration(summary.avg_time_to_activation_seconds) },
      ]
    : []

  if (error) return <div role="alert" className="text-sm text-red-500">{error}</div>

  return (
    <div className="space-y-2">
      {rule && <p className="text-xs text-muted-foreground">Activation Rule: {rule.name} ({rule.ruleVersion})</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="activation-kpi-cards">
        {loading || !summary
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><div className="h-8 w-16 rounded bg-muted animate-pulse" /></CardContent></Card>
            ))
          : cards.map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{c.value}</div></CardContent>
              </Card>
            ))}
      </div>
    </div>
  )
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}
