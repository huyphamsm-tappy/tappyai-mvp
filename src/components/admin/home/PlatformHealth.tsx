'use client'

import { Activity, Boxes, ShieldCheck } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { ControllerHomeData } from './types'

export type HealthStatus = 'checking' | 'operational' | 'degraded'

function Dot({ tone }: { tone: 'ok' | 'warn' | 'idle' }) {
  const color = tone === 'ok' ? '#34C759' : tone === 'warn' ? '#FF9500' : 'var(--muted-foreground, #8a8a8a)'
  return <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
}

// The "Is TappyAI healthy?" pillar — REAL signals only: the /api/health DB
// liveness probe (status lifted to the parent), the Controller kernel's own
// module-registry health, and the security foundation status.
export function PlatformHealth({ appStatus, platform }: { appStatus: HealthStatus; platform: ControllerHomeData['platform'] }) {
  const { t } = useTranslation()

  const appLabel =
    appStatus === 'operational' ? t('admin.home.health.operational')
    : appStatus === 'degraded' ? t('admin.home.health.degraded')
    : t('admin.home.health.checking')
  const appTone = appStatus === 'operational' ? 'ok' : appStatus === 'degraded' ? 'warn' : 'idle'

  const kernelHealthy = platform.modulesEnabled === platform.modulesAvailable && platform.modulesTotal > 0

  return (
    <section className="rounded-admin-md border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{t('admin.home.health.title')}</h2>
      <ul className="space-y-3">
        <li className="flex items-center gap-3">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm text-foreground">{t('admin.home.health.app')}</span>
          <Dot tone={appTone} />
          <span className="text-xs text-muted-foreground w-24 text-right">{appLabel}</span>
        </li>
        <li className="flex items-center gap-3">
          <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm text-foreground">{t('admin.home.health.kernel')}</span>
          <Dot tone={kernelHealthy ? 'ok' : 'warn'} />
          <span className="text-xs text-muted-foreground w-24 text-right">
            {platform.modulesAvailable}/{platform.modulesTotal} {t('admin.home.health.modulesActive')}
          </span>
        </li>
        <li className="flex items-center gap-3">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm text-foreground">{t('admin.home.health.security')}</span>
          <Dot tone="ok" />
          <span className="text-xs text-muted-foreground w-40 text-right">{t('admin.home.health.securityOk')}</span>
        </li>
      </ul>
    </section>
  )
}
