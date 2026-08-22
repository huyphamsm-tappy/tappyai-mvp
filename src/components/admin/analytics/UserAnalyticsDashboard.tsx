'use client'

import { useEffect, useState } from 'react'
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

const VIEWS: View[] = ['growth', 'engagement', 'funnel', 'retention']

// WHICH VIEW DOES A PAYLOAD BELONG TO?
//
// The four results are NOT a discriminated union: every one of them carries
// `status` and nothing else names the view, and `GrowthResult` and
// `EngagementResult` BOTH carry `series` — so a structural test such as
// `'series' in data` cannot tell them apart. It answers "does this object have
// a series?" when the question is "whose series is it?".
//
// The tag is therefore attached here, at the only place that knows the answer:
// the code that issued the request. `kind` collapses the three outcomes the
// screen distinguishes; `empty` and `error` carry no view-specific fields, so
// only `ok` needs a payload and only `ok` is narrowed per view.
type Received =
  | { view: View; kind: 'error' }
  | { view: View; kind: 'empty' }
  | { view: 'growth'; kind: 'ok'; data: GrowthResult }
  | { view: 'engagement'; kind: 'ok'; data: EngagementResult }
  | { view: 'funnel'; kind: 'ok'; data: FunnelResult }
  | { view: 'retention'; kind: 'ok'; data: RetentionResult }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null
const isNum = (v: unknown): v is number => typeof v === 'number'
/** A ratio is a number or an explicit `null` — never `undefined`, never 0-by-default. */
const isRatio = (v: unknown): boolean => v === null || isNum(v)

// Each guard checks EXACTLY the fields its view renders: no more, so it cannot
// reject a payload over a field nobody reads; no less, so it cannot admit one
// the renderer would then read as `undefined`.
function isGrowth(d: unknown): d is GrowthResult {
  return isRecord(d) && Array.isArray(d.series) && isRatio(d.momGrowthRate)
    && d.series.every((p) => isRecord(p) && isNum(p.totalUsers) && isNum(p.newUsers))
}
function isEngagement(d: unknown): d is EngagementResult {
  return isRecord(d) && Array.isArray(d.series)
    && d.series.every((p) =>
      isRecord(p) && isNum(p.dau) && isNum(p.wau) && isNum(p.mau) && isRatio(p.stickiness))
}
function isFunnel(d: unknown): d is FunnelResult {
  return isRecord(d) && isNum(d.free) && isNum(d.pro) && isRatio(d.conversionRate)
}
const isMilestone = (v: unknown): boolean => isRecord(v) && isNum(v.retained) && isRatio(v.rate)
function isRetention(d: unknown): d is RetentionResult {
  return isRecord(d) && Array.isArray(d.cohorts)
    && d.cohorts.every((c) =>
      isRecord(c) && typeof c.cohortDate === 'string' && isNum(c.cohortSize)
      && isMilestone(c.d1) && isMilestone(c.d7) && isMilestone(c.d30))
}

/**
 * Bind one response to the view that asked for it.
 *
 * A body that does not satisfy the requested view's contract is an ERROR, not
 * an empty dashboard and not a crash: something answered in the wrong shape,
 * and an operator must be told that rather than shown a screen that quietly
 * omits the numbers — or a blank one that reads as "nothing happened yet".
 */
function receive(view: View, ok: boolean, body: unknown): Received {
  if (!ok || !isRecord(body)) return { view, kind: 'error' }
  if (body.status === 'error') return { view, kind: 'error' }
  if (body.status === 'empty') return { view, kind: 'empty' }
  if (view === 'growth' && isGrowth(body)) return { view, kind: 'ok', data: body }
  if (view === 'engagement' && isEngagement(body)) return { view, kind: 'ok', data: body }
  if (view === 'funnel' && isFunnel(body)) return { view, kind: 'ok', data: body }
  if (view === 'retention' && isRetention(body)) return { view, kind: 'ok', data: body }
  return { view, kind: 'error' }
}

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
  const [received, setReceived] = useState<Received | null>(null)

  // One request per view. The cleanup marks this request abandoned, so a
  // response for a view the operator has already left is DROPPED instead of
  // overwriting the view they are actually looking at. Requests here are
  // per-view and uncached, so without this a slow answer for the previous tab
  // arrives last and wins.
  useEffect(() => {
    let abandoned = false
    void (async () => {
      try {
        const res = await fetch(`/api/admin/analytics/users?view=${view}`)
        const json: unknown = await res.json()
        if (abandoned) return
        // A non-2xx is surfaced as the error state rather than an empty one —
        // the API already distinguishes them and the distinction must survive.
        setReceived(receive(view, res.ok, isRecord(json) ? json.data : undefined))
      } catch {
        if (!abandoned) setReceived({ view, kind: 'error' })
      }
    })()
    return () => { abandoned = true }
  }, [view])

  // THE INVARIANT: nothing is rendered from a payload belonging to another
  // view — including on the render that happens the instant a tab is clicked,
  // before the new request has even been issued.
  //
  // There is deliberately no separate `loading` flag. "No answer for THIS view
  // yet" IS the loading state, and deriving it removes the ordering bug that
  // caused the crashes: the flag used to be raised inside the effect, one
  // render too late, leaving a window where the new view read the old payload.
  const current = received && received.view === view ? received : null

  function body() {
    if (!current) {
      return <p className="text-muted-foreground text-sm">{t('admin.common.loading')}</p>
    }
    if (current.kind === 'error') {
      return <p className="text-destructive text-sm">{t('admin.userAnalytics.error')}</p>
    }
    // NOT a grid of zeros — nothing has been measured yet.
    const nothingMeasured = (
      <p className="text-muted-foreground text-sm">{t('admin.userAnalytics.empty')}</p>
    )
    if (current.kind === 'empty') return nothingMeasured

    switch (current.view) {
      case 'growth': {
        const latest = current.data.series.at(-1)
        if (!latest) return nothingMeasured
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat label={t('admin.userAnalytics.growth.total')} value={latest.totalUsers.toLocaleString()} />
              <Stat label={t('admin.userAnalytics.growth.new')} value={latest.newUsers.toLocaleString()} />
            </div>
            <div className="rounded-admin-md border border-border bg-card p-4">
              <div className="text-sm font-medium text-muted-foreground">
                {t('admin.userAnalytics.growth.mom')}
              </div>
              <div className="mt-1">
                <Ratio
                  value={current.data.momGrowthRate}
                  noneKey="admin.userAnalytics.growth.momNone"
                />
              </div>
            </div>
          </div>
        )
      }
      case 'engagement': {
        const latest = current.data.series.at(-1)
        if (!latest) return nothingMeasured
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label={t('admin.userAnalytics.engagement.dau')} value={latest.dau.toLocaleString()} />
              <Stat label={t('admin.userAnalytics.engagement.wau')} value={latest.wau.toLocaleString()} />
              <Stat label={t('admin.userAnalytics.engagement.mau')} value={latest.mau.toLocaleString()} />
            </div>
            <div className="rounded-admin-md border border-border bg-card p-4">
              <div className="text-sm font-medium text-muted-foreground">
                {t('admin.userAnalytics.engagement.stickiness')}
              </div>
              <div className="mt-1">
                <Ratio
                  value={latest.stickiness}
                  noneKey="admin.userAnalytics.engagement.stickinessNone"
                />
              </div>
            </div>
          </div>
        )
      }
      case 'retention':
        return <CohortTable cohorts={current.data.cohorts} />
      case 'funnel':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat label={t('admin.userAnalytics.funnel.free')} value={current.data.free.toLocaleString()} />
              <Stat label={t('admin.userAnalytics.funnel.pro')} value={current.data.pro.toLocaleString()} />
            </div>
            <div className="rounded-admin-md border border-border bg-card p-4">
              <div className="text-sm font-medium text-muted-foreground">
                {t('admin.userAnalytics.funnel.conversion')}
              </div>
              <div className="mt-1">
                <Ratio
                  value={current.data.conversionRate}
                  noneKey="admin.userAnalytics.funnel.conversionNone"
                />
              </div>
            </div>
          </div>
        )
    }
  }

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
          {body()}
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
