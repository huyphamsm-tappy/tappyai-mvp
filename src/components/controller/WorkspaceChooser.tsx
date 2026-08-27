'use client'

import Link from 'next/link'
import { ArrowRight, Boxes } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Controller V2.2 — the post-authentication workspace chooser (Owner Decision
// D14). Shown to an actor holding MORE THAN ONE active department membership,
// and to nobody else: the Platform Owner is global, and a single membership is
// already the answer.
//
// 🔑 THIS IS THE EXACT OPPOSITE OF THE HOME'S DepartmentCard, ON PURPOSE.
//
// V2.1 had to STRIP the hover state from `DepartmentCard`, because a display-only
// card that lit up under the pointer led the Owner to try clicking it — an
// element that reacts to hover is promising something. These cards make that
// promise and keep it: they are real links, focusable, with hover, focus and
// pointer affordances.
//
// Two components that look alike and behave oppositely is how a codebase drifts
// into reusing one for the other, so `DepartmentCard` is deliberately NOT
// imported here and this file renders no <article>.
//
// ⚠️ CHOOSING GRANTS NOTHING. The link carries `?dept=<id>`; `/admin` validates
// it against the actor's own memberships (`resolveEntryContext`) and the PDP
// still authorizes every page and API afterwards. Per D14 the URL is the ONLY
// storage: no cookie, no localStorage, no preference row, no active_department.
// Refresh survives because the URL survives — nothing is written anywhere.

export interface WorkspaceOption {
  id: string
  /** i18n key for the department's display name — never a raw string. */
  nameKey: string
  /** Modules this department owns in the registry. Real, never fabricated. */
  moduleCount: number
}

export function WorkspaceChooser({ departments }: { departments: readonly WorkspaceOption[] }) {
  const { t } = useTranslation()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-5 py-12 sm:px-8">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#2E7BF6] to-[#1B4FD8] text-lg font-black text-white shadow-lg shadow-[#1B4FD8]/30"
        >
          T
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight text-foreground">{t('admin.shell.brand')}</span>
          <span className="text-lg font-semibold text-ring">{t('admin.shell.badge')}</span>
        </span>
      </div>

      <div className="w-full max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('admin.chooser.title')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('admin.chooser.subtitle')}</p>
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {departments.map((d) => (
            <li key={d.id}>
              <Link
                href={`/admin?dept=${encodeURIComponent(d.id)}`}
                className="group flex cursor-pointer items-center gap-4 rounded-admin-md border border-border bg-card p-4 transition-colors hover:border-ring hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{t(d.nameKey)}</span>
                  {/* A department that owns nothing yet says nothing — "0 modules"
                      would render an absence as a measurement. */}
                  {d.moduleCount > 0 ? (
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Boxes className="h-3.5 w-3.5" aria-hidden />
                      {d.moduleCount} {t('admin.home.dept.modulesLabel')}
                    </span>
                  ) : null}
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-ring"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-xs text-muted-foreground/60">{t('admin.login.footer')}</p>
    </main>
  )
}
