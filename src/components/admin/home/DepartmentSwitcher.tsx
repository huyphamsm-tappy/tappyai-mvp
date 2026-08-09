'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { HomeDepartmentSummary } from '@/lib/controller/org'

// Controller V2 — scope selector (FOUNDATION-08). UX ONLY: it offers ONLY the
// departments the server authorized (Owner → all + a global option; a member →
// their own). It does not itself grant access — server authorization remains the
// boundary, and department routes/data still enforce the PDP + scope. Selection
// is local foundation state (no navigation target exists yet).
export function DepartmentSwitcher({
  isOwner,
  departments,
}: {
  isOwner: boolean
  departments: HomeDepartmentSummary[]
}) {
  const { t } = useTranslation()
  const GLOBAL = '__global__'
  const [selected, setSelected] = useState<string>(isOwner ? GLOBAL : departments[0]?.id ?? GLOBAL)

  // Nothing to switch between.
  if (!isOwner && departments.length <= 1) return null

  const options = isOwner
    ? [{ id: GLOBAL, nameKey: 'admin.home.switcher.all' as const }, ...departments]
    : departments

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{t('admin.home.switcher.label')}:</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-admin-sm border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        aria-label={t('admin.home.switcher.label')}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {t(o.nameKey)}
          </option>
        ))}
      </select>
    </label>
  )
}
