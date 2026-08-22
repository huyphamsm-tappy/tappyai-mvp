'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type {
  CohortPoint,
  EngagementResult,
  FunnelResult,
  GrowthResult,
  RetentionMilestone,
  RetentionResult,
} from '@/lib/admin/analytics/userAnalyticsService'

// Module 04 User Analytics — presentation only.
//
// Every number is computed by `userAnalyticsService` and returned by the API.
// This component performs no aggregation, no ratio maths and no thresholds:
// two implementations of "what stickiness means" is how a dashboard starts
// disagreeing with itself.
//
// THE STATES CARRY THE MEANING. `empty` (the rollup has not run) and a genuine
// zero look identical if you only render numbers, and a `null` ratio is not
// `0%`. The server distinguishes all three; this component keeps them
// distinguishable on screen.

type View = 'growth' | 'engagement' | 'funnel' | 'retention'
type Payload = GrowthResult | EngagementResult | FunnelResult | RetentionResult

const VIEWS: View[] = ['growth', 'engagement', 'funnel', 'retention']

/** A value that has no denominator renders as an explanation, never as 0%. */
function Ratio({ value, noneKey }: { value: number | null; noneKey: string }) {
  const { t } = useTranslation()
  if (value === null) return <span className="text-sm text-muted-foreground">{t(noneKey)}</span>
  const pct = (value * 100).toFixed(1)
  return (
    <span className="text-2xl font-bold tabular-nums text-foreground">
      {value > 0 ? `+${pct}%` : `${pct}%`}
    </span>
  )
}

/**
 * One retention cell. A milestone with no rate shows an em dash and a tooltip,
 * NOT `0%` — the cohort is empty, or the day has not closed yet. The retained
 * COUNT is still shown, because that part was measured.
 */
function RetentionCell({ m, noneLabel }: { m: RetentionMilestone; noneLabel: string }) {
  if (m.rate === null) {
    return (
      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums" title={noneLabel}>
        —
      </td>
    )
  }
  return (
    <td className="px-3 py-2 text-right tabular-nums text-foreground">
      {(m.rate * 100).toFixed(1)}%
      <span className="text-muted-foreground ml-1 text-xs">({m.retained})</span>
    </td>
  )
}

function CohortTable({ cohorts }: { cohorts: readonly CohortPoint[] }) {
  const { t } = useTranslation()
  const none = t('admin.userAnalytics.retention.notMeasurable')
  return (
    // The table scrolls inside its own box: on a phone the five columns must not
    // make the whole admin page scroll sideways.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="px-3 py-2 font-medium">{t('admin.userAnalytics.retention.cohort')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('admin.userAnalytics.retention.size')}</th>
            <th className="px-3 py-2 text-right font-medium">D1</th>
            <th className="px-3 py-2 text-right font-medium">D7</th>
            <th className="px-3 py-2 text-right font-medium">D30</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohortDate} className="border-border/50 border-b last:border-0">
              <td className="px-3 py-2 tabular-nums">{c.cohortDate}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.cohortSize.toLocaleString()}</td>
              <RetentionCell m={c.d1} noneLabel={none} />
              <RetentionCell m={c.d7} noneLabel={none} />
              <RetentionCell m={c.d30} noneLabel={none} />
            </tr>
          ))}
        </tbody>
      </table>
      {/* Which retention is on screen, stated rather than assumed — `25` §4
          requires the bracket/rolling distinction to be labelled. */}
      <p className="text-muted-foreground mt-3 text-xs">{t('admin.userAnalytics.retention.method')}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-admin-md border border-border bg-card p-4">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
    </div>
  )
}

export function UserAnalyticsDashboard() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('growth')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics/users?view=${view}`)
      const json = await res.json()
      // A non-2xx is surfaced as the error state rather than an empty one — the
      // API already distinguishes them and the distinction must survive here.
      setData(res.ok ? json.data : { status: 'error' as const })
    } catch {
      setData({ status: 'error' as const } as Payload)
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => { void load() }, [load])

  const status = data?.status
  const latestGrowth = data && 'series' in data && view === 'growth'
    ? (data as GrowthResult).series.at(-1)
    : undefined
  const latestEngagement = data && 'series' in data && view === 'engagement'
    ? (data as EngagementResult).series.at(-1)
    : undefined

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.userAnalytics.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('admin.userAnalytics.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Button key={v} variant={v === view ? 'default' : 'outline'} onClick={() => setView(v)}>
            {t(`admin.userAnalytics.tab.${v}`)}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-muted-foreground text-sm">{t('admin.common.loading')}</p>
          ) : status === 'error' ? (
            <p className="text-destructive text-sm">{t('admin.userAnalytics.error')}</p>
          ) : status === 'empty' ? (
            // NOT a grid of zeros — nothing has been measured yet.
            <p className="text-muted-foreground text-sm">{t('admin.userAnalytics.empty')}</p>
          ) : view === 'growth' && latestGrowth ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Stat label={t('admin.userAnalytics.growth.total')} value={latestGrowth.totalUsers.toLocaleString()} />
                <Stat label={t('admin.userAnalytics.growth.new')} value={latestGrowth.newUsers.toLocaleString()} />
              </div>
              <div className="rounded-admin-md border border-border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground">
                  {t('admin.userAnalytics.growth.mom')}
                </div>
                <div className="mt-1">
                  <Ratio
                    value={(data as GrowthResult).momGrowthRate}
                    noneKey="admin.userAnalytics.growth.momNone"
                  />
                </div>
              </div>
            </div>
          ) : view === 'engagement' && latestEngagement ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label={t('admin.userAnalytics.engagement.dau')} value={latestEngagement.dau.toLocaleString()} />
                <Stat label={t('admin.userAnalytics.engagement.wau')} value={latestEngagement.wau.toLocaleString()} />
                <Stat label={t('admin.userAnalytics.engagement.mau')} value={latestEngagement.mau.toLocaleString()} />
              </div>
              <div className="rounded-admin-md border border-border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground">
                  {t('admin.userAnalytics.engagement.stickiness')}
                </div>
                <div className="mt-1">
                  <Ratio
                    value={latestEngagement.stickiness}
                    noneKey="admin.userAnalytics.engagement.stickinessNone"
                  />
                </div>
              </div>
            </div>
          ) : view === 'retention' ? (
            <CohortTable cohorts={(data as RetentionResult).cohorts} />
          ) : view === 'funnel' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Stat label={t('admin.userAnalytics.funnel.free')} value={(data as FunnelResult).free.toLocaleString()} />
                <Stat label={t('admin.userAnalytics.funnel.pro')} value={(data as FunnelResult).pro.toLocaleString()} />
              </div>
              <div className="rounded-admin-md border border-border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground">
                  {t('admin.userAnalytics.funnel.conversion')}
                </div>
                <div className="mt-1">
                  <Ratio
                    value={(data as FunnelResult).conversionRate}
                    noneKey="admin.userAnalytics.funnel.conversionNone"
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t('admin.userAnalytics.empty')}</p>
          )}
        </CardContent>
      </Card>

      {/* Named rather than silently missing. An operator looking for retention
          should learn WHY it is absent, not conclude the module is broken. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.userAnalytics.notShipped.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>{t('admin.userAnalytics.notShipped.rollingRetention')}</li>
            <li>{t('admin.userAnalytics.notShipped.churn')}</li>
            <li>{t('admin.userAnalytics.notShipped.session')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
