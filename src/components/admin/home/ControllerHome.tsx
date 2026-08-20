'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CommandHeader } from './CommandHeader'
import { PlatformHealth, type HealthStatus } from './PlatformHealth'
import { PlatformSignals } from './PlatformSignals'
import { AttentionPanel } from './AttentionPanel'
import { BusinessKpis } from './BusinessKpis'
import { QuickActions } from './QuickActions'
import { DepartmentGrid } from './DepartmentGrid'
import { NoWorkspace } from './NoWorkspace'
import type { ControllerHomeData } from './types'

// Controller V2 — Home / Command Center. Purely presentational: it renders the
// server-computed, PDP-gated + scope-filtered ControllerHomeData plus a single
// live /api/health probe. It branches on `mode` (owner → enterprise overview;
// department → scoped workspace; none → no-workspace empty state) WITHOUT
// duplicating pages, and creates NO authorization, audit, or navigation authority.
export function ControllerHome({ data }: { data: ControllerHomeData }) {
  const { t } = useTranslation()
  const [health, setHealth] = useState<HealthStatus>('checking')

  useEffect(() => {
    let alive = true
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => (r.ok ? 'operational' : 'degraded'))
      .catch(() => 'degraded')
      .then((s) => { if (alive) setHealth(s as HealthStatus) })
    return () => { alive = false }
  }, [])

  const insight = health === 'degraded' ? t('admin.home.ai.degraded') : t('admin.home.ai.ok')

  return (
    <div className="space-y-6 max-w-[1400px]">
      <CommandHeader data={data} />

      {/* Health + AI insight — shown in every mode */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PlatformHealth appStatus={health} platform={data.platform} />
        <div
          className="lg:col-span-2 rounded-admin-md border border-border bg-card p-5 flex items-center gap-4"
          style={{ boxShadow: 'inset 3px 0 0 0 #007AFF' }}
        >
          <Image src="/branding/otter-logo.png" alt="" width={56} height={56} className="shrink-0 rounded-full" aria-hidden />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#FF9500' }}>
              {t('admin.home.ai.title')}
            </div>
            <p className="mt-1 text-sm text-foreground">{insight}</p>
          </div>
        </div>
      </div>

      {data.mode === 'none' ? (
        <NoWorkspace />
      ) : (
        <>
          {/* Module 01 business KPIs from daily_snapshots (pre-computed) */}
          <BusinessKpis kpis={data.kpis} />

          {/* Performance signals (PDP-gated; null → restricted) */}
          <PlatformSignals signals={data.signals} platform={data.platform} />

          {/* Enterprise overview (owner: 15) / department workspace (member: own) */}
          <DepartmentGrid departments={data.departments} mode={data.mode} />

          {/* Attention + actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AttentionPanel attention={data.attention} />
            <QuickActions actions={data.quickActions} />
          </div>
        </>
      )}
    </div>
  )
}
