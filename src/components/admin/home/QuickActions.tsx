'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { navIcon } from '@/components/admin/layout/navIcons'
import type { ControllerHomeData } from './types'

// Quick actions = the modules THIS actor may open, derived from the Controller
// registry + PDP (computed server-side, passed as props). No client-side
// permission logic; a hidden module is one the PDP denied — direct-route access
// remains independently guarded.
export function QuickActions({ actions }: { actions: ControllerHomeData['quickActions'] }) {
  const { t } = useTranslation()
  if (actions.length === 0) return null
  return (
    <section className="rounded-admin-md border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{t('admin.home.actions.title')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((a) => {
          const Icon = navIcon(a.icon)
          return (
            <Link
              key={a.route}
              href={a.route}
              className="group flex items-center gap-3 rounded-admin-md border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-ring hover:bg-muted"
            >
              <Icon className="h-4 w-4 text-muted-foreground group-hover:text-ring" aria-hidden />
              <span className="flex-1 truncate">{t(a.label)}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-ring" aria-hidden />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
