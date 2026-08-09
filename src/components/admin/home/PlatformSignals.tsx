'use client'

import { KeyRound, Boxes, LayoutGrid } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { NotConnected } from './NotConnected'
import type { ControllerHomeData } from './types'

function Stat({ icon: Icon, label, value }: { icon: typeof KeyRound; label: string; value: string }) {
  return (
    <div className="rounded-admin-md border border-border bg-card p-4 min-h-[104px] flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" aria-hidden />
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  )
}

// The "How is TappyAI performing?" pillar. REAL platform-level counts the Home
// can compute directly; deep analytics (auth/activation/content) live in their
// own modules (drill-down). Metrics with no backend source render as honest
// NotConnected slots, ready to be populated later without layout changes.
export function PlatformSignals({ signals, platform }: {
  signals: ControllerHomeData['signals']
  platform: ControllerHomeData['platform']
}) {
  const { t } = useTranslation()
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t('admin.home.signals.title')}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat icon={KeyRound} label={t('admin.home.signals.roles')} value={signals.adminRoles === null ? '—' : String(signals.adminRoles)} />
        <Stat icon={Boxes} label={t('admin.home.signals.modules')} value={String(platform.modulesTotal)} />
        <Stat icon={LayoutGrid} label={t('admin.home.signals.hubs')} value={String(platform.hubsTotal)} />
        <NotConnected labelKey="admin.home.nc.dauMau" />
        <NotConnected labelKey="admin.home.nc.revenue" />
        <NotConnected labelKey="admin.home.nc.aiHealth" />
      </div>
    </section>
  )
}
