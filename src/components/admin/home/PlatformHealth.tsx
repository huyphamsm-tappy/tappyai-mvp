'use client'

import Image from 'next/image'
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
export function PlatformHealth({ appStatus, platform, note }: {
  appStatus: HealthStatus
  platform: ControllerHomeData['platform']
  /**
   * One line of plain-language read-out on the signals above (V2.1).
   *
   * It moved here from a card of its own, which occupied two thirds of the
   * Home's top row to render one of two possible sentences beside a 56px
   * mascot — the least information in the most prominent slot. `01_ARCH` §8
   * also lists where Tappy belongs (empty states, slow loads, milestones,
   * contextual tips) and adds "never as decoration"; a permanent banner is
   * none of those. As a footer to the signals it describes, it is a tip.
   */
  note?: string
}) {
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

      {note ? (
        <p className="mt-4 flex items-start gap-2.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          <Image src="/branding/otter-logo.png" alt="" width={18} height={18} className="mt-px shrink-0 rounded-full opacity-80" aria-hidden />
          <span>{note}</span>
        </p>
      ) : null}
    </section>
  )
}
