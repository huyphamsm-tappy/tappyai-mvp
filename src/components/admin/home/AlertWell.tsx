'use client'

import { AlertTriangle, CircleAlert, Info, ShieldCheck } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { AlertSeverity, ControllerAlert } from '@/lib/controller/alerts'

// Controller V2 — Phase 7 / B5: the ALERT WELL (01_ARCH §8, "what needs
// attention now").
//
// It replaces the NotConnected placeholder that held this slot: the slot existed
// because there was no real source, and there is one now. Presentation only —
// the server derived, ordered and permission-filtered this list.

const ICON: Record<AlertSeverity, typeof Info> = {
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
}

// UI standards §8: never colour alone. Each severity carries an icon AND a text
// label, so the meaning survives greyscale, colour-blindness and a screen reader.
const TONE: Record<AlertSeverity, string> = {
  error: 'text-destructive',
  warning: 'text-[#FF9500]',
  info: 'text-muted-foreground',
}

export function AlertWell({ alerts }: { alerts: readonly ControllerAlert[] }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-admin-md border border-border bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('admin.home.alerts.title')}</span>
        <ShieldCheck
          className={alerts.length === 0 ? 'h-4 w-4 text-[#34C759]' : 'h-4 w-4 text-muted-foreground/50'}
          aria-hidden
        />
      </div>

      {alerts.length === 0 ? (
        // UI standards §10: a meaningful empty state. "Nothing needs attention"
        // is a real answer, and the one an operator most wants to see.
        <p className="text-sm text-muted-foreground">{t('admin.home.alerts.none')}</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const Icon = ICON[a.severity]
            return (
              <li key={a.id} className="flex items-start gap-2 text-sm">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[a.severity]}`} aria-hidden />
                <span className="min-w-0">
                  <span className="sr-only">{t(`admin.home.alerts.severity.${a.severity}`)}: </span>
                  <span className="font-medium">{a.moduleName}</span>
                  <span className="text-muted-foreground"> — {t(`admin.home.alerts.${a.kind}`)}</span>
                  {a.detail && <span className="ml-1 font-mono text-xs text-muted-foreground/80">{a.detail}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
