'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CommandHeader } from './CommandHeader'
import { PlatformHealth, type HealthStatus } from './PlatformHealth'
import { PlatformSignals } from './PlatformSignals'
import { AttentionPanel } from './AttentionPanel'
import { BusinessKpis } from './BusinessKpis'
import { QuickActions } from './QuickActions'
import { DepartmentGrid } from './DepartmentGrid'
import { DepartmentModules } from './DepartmentModules'
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

      {/* PLATFORM STATE — "is the thing I operate healthy right now". Shown in
          every mode, including `none`: an actor with no workspace can still be
          told the platform is up. The AI read-out is now this section's footer
          rather than a card of its own; see PlatformHealth's `note` prop. */}
      <PlatformHealth appStatus={health} platform={data.platform} note={insight} />

      {data.mode === 'none' ? (
        <NoWorkspace />
      ) : (
        <>
          {/* PRIMARY WORKSPACE — Module 01 business KPIs from daily_snapshots
              (pre-computed). Real numbers rank above structure. */}
          <BusinessKpis kpis={data.kpis} />

          {/* ORGANIZATION — enterprise overview (owner: 15) / department
              workspace (member: own). Display-only, by Owner Decision D11. */}
          <DepartmentGrid departments={data.departments} mode={data.mode} />

          {/* DEPARTMENT FUNCTIONS (V2.4). Shown only on a SCOPED Home — an actor
              who entered with `?dept=`. The enterprise Owner view has no single
              department to offer functions for, so this stays out of it and the
              Owner's Home is unchanged.

              Separate component from DepartmentCard on purpose: the grid above
              states WHO the department is and stays display-only per D11; this
              states WHAT it can do and is real navigation. */}
          {data.mode === 'department' && data.departmentModules !== undefined && (
            <DepartmentModules modules={data.departmentModules} />
          )}

          {/* CAPABILITY — what the Controller currently exposes: registry
              counts plus honest not-connected slots.

              🔑 ORDER CHANGED (V2.1): this used to sit ABOVE the department
              grid. Organization before capability is the command-center
              reading order — who the enterprise is, then what the tooling
              currently covers. Nothing about the data changed. */}
          <PlatformSignals signals={data.signals} platform={data.platform} />

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
