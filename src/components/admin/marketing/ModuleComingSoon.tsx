'use client'

import { Construction } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Controller V2.4 — the Marketing V1 FOUNDATION placeholder.
//
// Every Marketing module is registered — permission, route, navigation, and
// department ownership are all real — but none has a table, an API or any CRUD
// behind it yet. This is what those routes render.
//
// 🔑 WHY A REAL PAGE RATHER THAN NO ROUTE. A registered module whose route
// 404s cannot be PDP-tested, and a card that leads nowhere is the "pretend
// functionality" the contract forbids. A guarded page that says plainly it is
// unbuilt is honest in both directions: the guard is real, and the emptiness is
// stated rather than mocked up.
//
// ⚠️ The copy here is PROPOSED and NOT yet Owner-approved. The approved empty
// state — "No modules are available for this department yet." — is a
// DEPARTMENT-level sentence and would be untrue on a module page, so it is not
// reused here. Replace this wording once the Owner rules on it.
export function ModuleComingSoon({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()

  return (
    <div className="max-w-[1400px] space-y-6">
      <h1 className="text-lg font-semibold text-foreground">{t(titleKey)}</h1>

      <div className="flex flex-col items-center gap-3 rounded-admin-md border border-border bg-card px-6 py-12 text-center">
        <span
          aria-hidden="true"
          className="grid h-11 w-11 place-items-center rounded-admin-sm border border-border bg-muted text-muted-foreground"
        >
          <Construction className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold text-foreground">{t('admin.module.comingSoon.title')}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t('admin.module.comingSoon.body')}</p>
      </div>
    </div>
  )
}
