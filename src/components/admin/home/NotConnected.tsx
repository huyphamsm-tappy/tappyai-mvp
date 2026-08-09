'use client'

import { PlugZap } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// A polished, honest "Not connected yet / Chưa kết nối" state for a
// command-center pillar whose backend data source does not exist yet. Designed
// so a real data source can be dropped in later without changing the Home
// layout — same footprint, same slot.
export function NotConnected({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col justify-between rounded-admin-md border border-dashed border-border bg-card/40 p-4 min-h-[104px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t(labelKey)}</span>
        <PlugZap className="h-4 w-4 text-muted-foreground/50 shrink-0" aria-hidden />
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          {t('admin.home.nc.title')}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground/60">{t('admin.home.nc.note')}</p>
      </div>
    </div>
  )
}
