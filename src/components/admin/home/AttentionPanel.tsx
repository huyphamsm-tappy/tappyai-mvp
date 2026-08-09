'use client'

import { Link2Off } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { NotConnected } from './NotConnected'
import type { ControllerHomeData } from './types'

// The "What needs my attention?" pillar. REAL: recent audit-log activity (C7),
// permission-gated — `null` means the actor lacks audit.log.read. An alerts /
// incidents feed has no backend yet → honest NotConnected slot.
export function AttentionPanel({ attention }: { attention: ControllerHomeData['attention'] }) {
  const { t, locale } = useTranslation()
  const events = attention.recentAudit

  return (
    <section className="rounded-admin-md border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{t('admin.home.attention.title')}</h2>

      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {t('admin.home.attention.recent')}
        </div>
        {events === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link2Off className="h-4 w-4" aria-hidden /> {t('admin.home.attention.restricted')}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.home.attention.none')}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">
                  <span className="font-mono text-xs text-[#007AFF]">{e.action}</span>
                  <span className="text-muted-foreground"> · {e.actorEmail}</span>
                </span>
                <time className="shrink-0 text-xs text-muted-foreground/70" dateTime={e.createdAt}>
                  {new Date(e.createdAt).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NotConnected labelKey="admin.home.nc.alerts" />
    </section>
  )
}
