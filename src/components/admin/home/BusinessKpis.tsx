'use client'

import { Activity, CalendarDays, CalendarRange, UserPlus, Repeat, Users } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { HomeKpi, HomeKpiKey, HomeKpis } from '@/lib/admin/analytics/homeSnapshotService'

// Module 01 Home Dashboard — the business KPI block.
//
// Renders `daily_snapshots` and NOTHING ELSE. Every number here was computed by
// the rollup and derived by `homeSnapshotService`; this component performs no
// aggregation, no thresholds and no trend maths of its own. Two implementations
// of "what DAU means" is how a dashboard starts disagreeing with itself.
//
// THE STATES ARE THE POINT. `empty` and a genuine zero day look identical if you
// only render numbers, and they are completely different facts — one means
// nobody was active, the other means nobody measured. The server distinguishes
// them; this component's job is to keep them distinguishable on screen.

const ICON: Record<HomeKpiKey, typeof Activity> = {
  dau: Activity,
  wau: CalendarDays,
  mau: CalendarRange,
  new_users: UserPlus,
  returning_users: Repeat,
  total_users: Users,
}

function Delta({ value }: { value: number | null }) {
  const { t } = useTranslation()
  // No adjacent snapshot ⇒ no trend. An em dash, never "+0" or "+100%".
  if (value === null) {
    return <span className="text-xs text-muted-foreground">{t('admin.home.kpi.noTrend')}</span>
  }
  const up = value > 0
  const flat = value === 0
  return (
    <span
      className={
        flat ? 'text-xs text-muted-foreground'
          : up ? 'text-xs text-success' : 'text-xs text-destructive'
      }
    >
      {/* The sign is spelled out rather than carried by colour alone (WCAG). */}
      {flat ? '±0' : `${up ? '+' : ''}${value.toLocaleString()}`}
    </span>
  )
}

function KpiCard({ kpi }: { kpi: HomeKpi }) {
  const { t } = useTranslation()
  const Icon = ICON[kpi.key]
  return (
    <div className="rounded-admin-md border border-border bg-card p-4 min-h-[104px] flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t(`admin.home.kpi.${kpi.key}`)}</span>
        <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" aria-hidden />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground tabular-nums">{kpi.value.toLocaleString()}</span>
        <Delta value={kpi.deltaVsPrevious} />
      </div>
    </div>
  )
}

export function BusinessKpis({ kpis }: { kpis: HomeKpis }) {
  const { t } = useTranslation()

  return (
    <section aria-label={t('admin.home.kpi.section')}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-foreground">{t('admin.home.kpi.section')}</h2>

        {kpis.snapshotDate && (
          <span className="text-xs text-muted-foreground">
            {t('admin.home.kpi.asOf')} {kpis.snapshotDate}
          </span>
        )}

        {/* 04 §7A: a day inside the reconciliation window may still change. An
            operator reporting a provisional number should know it is one. */}
        {kpis.status !== 'empty' && kpis.status !== 'error' && !kpis.isFinal && (
          <span className="text-xs text-muted-foreground">{t('admin.home.kpi.provisional')}</span>
        )}

        {kpis.status === 'stale' && (
          <span className="text-xs text-warning">
            {t('admin.home.kpi.stale')} ({kpis.ageDays}d)
          </span>
        )}
      </div>

      {kpis.status === 'empty' ? (
        // NOT a grid of zeros. The pipeline has not produced a measurement.
        <p className="rounded-admin-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('admin.home.kpi.empty')}
        </p>
      ) : kpis.status === 'error' ? (
        <p className="rounded-admin-md border border-dashed border-destructive/40 p-4 text-sm text-destructive">
          {t('admin.home.kpi.error')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.kpis.map((k) => (
            <KpiCard key={k.key} kpi={k} />
          ))}
        </div>
      )}
    </section>
  )
}
