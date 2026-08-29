'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { navIcon } from '@/components/admin/layout/navIcons'
import type { HomeModuleLink } from './types'

// Controller V2.4 — the department's FUNCTIONS, on its scoped Home.
//
// 🔑 THIS IS NOT `DepartmentCard`, AND THAT IS THE WHOLE POINT.
//
// `DepartmentCard` is display-only by Owner Decision D11 — V2.1 deliberately
// stripped its hover state because a card that reacts to the pointer promises
// something it cannot deliver. That decision stands and is not reversed here.
// Navigation into a department's functions belongs to a SEPARATE component, and
// this is it: real links, focusable, with hover and focus affordances, keyed to
// routes the actor may actually open.
//
// Two components that look alike and behave oppositely is how a codebase drifts
// into reusing one for the other, so `DepartmentCard` is deliberately NOT
// imported here — exactly as `WorkspaceChooser` does it.
//
// ⚠️ WHAT A CARD HERE MEANS. The server put a module in `departmentModules`
// only when the department OWNS it and the PDP GRANTS it to this actor. So a
// card is never a promise the route will admit you on some other basis — the
// page behind it runs `requirePagePermission` regardless, and rendering no card
// hides nothing that authorization was not already refusing.
export function DepartmentModules({ modules }: { modules: HomeModuleLink[] }) {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="dept-modules-heading">
      <h2 id="dept-modules-heading" className="mb-3 text-sm font-semibold text-foreground">
        {t('admin.home.modules.title')}
      </h2>

      {modules.length === 0 ? (
        // Owner-approved copy, verbatim. Reached by a department that owns no
        // module this actor may open — today the twelve placeholder departments.
        // An honest sentence beats an empty grid that looks like a loading bug.
        <p className="rounded-admin-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {t('admin.home.modules.empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const Icon = navIcon(m.icon)
            return (
              <li key={m.moduleId}>
                <Link
                  href={m.route}
                  data-testid="department-module-card"
                  className="group flex items-center gap-3 rounded-admin-md border border-border bg-card p-4 transition-colors hover:border-ring hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-admin-sm border border-border bg-muted text-ring"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {t(m.label)}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-ring"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
