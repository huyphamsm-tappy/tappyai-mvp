'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { Badge } from '@/components/ui/badge'
import type { HomeDepartmentSummary } from '@/lib/controller/org'

// Controller V2 — reusable department overview card. Registry-driven, HONEST: a
// department with owned modules shows its real module count; a placeholder shows
// an intentional "foundation ready" state — never a fabricated KPI.
export function DepartmentCard({ dept, emphasis = false }: { dept: HomeDepartmentSummary; emphasis?: boolean }) {
  const { t } = useTranslation()
  const defined = dept.status === 'defined'

  return (
    <article
      className={`group flex flex-col rounded-admin-md border bg-card p-4 transition-colors ${
        emphasis ? 'border-interactive/40' : 'border-border hover:border-interactive/30'
      }`}
      style={emphasis ? { boxShadow: 'inset 3px 0 0 0 #007AFF' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t(dept.nameKey)}</h3>
        <Badge variant={defined ? 'default' : 'muted'}>
          {defined ? t('admin.home.dept.defined') : t('admin.home.dept.placeholder')}
        </Badge>
      </div>

      {defined && dept.moduleCount > 0 ? (
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{dept.moduleCount}</span>
          <span className="text-xs text-muted-foreground">{t('admin.home.dept.modulesLabel')}</span>
        </div>
      ) : (
        // Premium, intentional empty state — NOT a generic "coming soon".
        <div className="mt-3 flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-foreground/80">{t('admin.home.dept.readyTitle')}</span>
          <p className="text-xs leading-snug text-muted-foreground">{t('admin.home.dept.readyNote')}</p>
        </div>
      )}
    </article>
  )
}
