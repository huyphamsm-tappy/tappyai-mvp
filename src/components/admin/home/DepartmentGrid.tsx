'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { DepartmentCard } from './DepartmentCard'
import type { HomeDepartmentSummary, HomeMode } from '@/lib/controller/org'

// Controller V2 — enterprise/workspace department grid. Renders ONLY the
// departments the server placed in scope (Owner → all 15 as the "Enterprise
// Overview"; department user → their own as "Your Workspace"). Defined
// (capability-bearing) departments are surfaced first.
export function DepartmentGrid({ departments, mode }: { departments: HomeDepartmentSummary[]; mode: HomeMode }) {
  const { t } = useTranslation()
  const isOwner = mode === 'owner'
  const ordered = [...departments].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'defined' ? -1 : 1
    return t(a.nameKey).localeCompare(t(b.nameKey))
  })

  return (
    <section aria-labelledby="dept-grid-heading">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="dept-grid-heading" className="text-sm font-semibold text-foreground">
          {isOwner ? t('admin.home.grid.enterprise') : t('admin.home.grid.workspace')}
        </h2>
        {/* Enterprise-wide count belongs to the Owner view; a single-department
            workspace does not annotate itself with a "1 · 1 defined" tally. */}
        {isOwner && (
          <span className="text-xs text-muted-foreground">
            {ordered.length} · {ordered.filter((d) => d.status === 'defined').length} {t('admin.home.dept.defined').toLowerCase()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ordered.map((d) => (
          <DepartmentCard key={d.id} dept={d} emphasis={d.status === 'defined'} />
        ))}
      </div>
      {isOwner && <p className="mt-3 text-xs text-muted-foreground">{t('admin.home.dept.foundationNote')}</p>}
    </section>
  )
}
