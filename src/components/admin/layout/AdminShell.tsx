'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { type AdminRole } from '@/lib/admin/roles'
import type { NavGroup } from '@/lib/controller/adminNavigation'
import { navIcon } from './navIcons'
import { ContextBar } from './ContextBar'
import { CommandPalette } from './CommandPalette'
import type { ControllerEnv } from '@/lib/controller/adminConfig'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n/useTranslation'


const ROLE_LABEL_KEY: Record<AdminRole, string> = {
  super_admin: 'admin.role.superAdmin',
  admin: 'admin.role.admin',
  moderator: 'admin.role.moderator',
  analyst: 'admin.role.analyst',
}

export function AdminShell({
  role,
  email,
  isOwner,
  navGroups,
  env,
  children,
}: {
  /** Display only — the role badge. Authorization + navigation are decided server-side. */
  role: AdminRole
  /** The Owner holds no role but outranks every one of them — see the badge. */
  isOwner: boolean
  email: string
  /**
   * Navigation derived server-side from the Controller registry + PDP
   * (@/lib/controller/adminNavigation). AdminShell is purely presentational: it
   * renders exactly what the Controller authorized. There is no client-side
   * permission logic and no static NAV[] — this is the single navigation
   * authority. Rendered hub-grouped since Phase 7 — the provider always carried
   * the groups; the shell used to discard them.
   */
  navGroups: readonly NavGroup[]
  /** Which deployment this is. UI standards §2: context is always in view. */
  env: ControllerEnv
  children: ReactNode
}) {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card min-h-dvh sticky top-0">
          <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
            <span className="text-lg font-bold">{t('admin.shell.brand')}</span>
            <Badge variant="muted">{t('admin.shell.badge')}</Badge>
          </div>
          <nav className="flex-1 p-3 space-y-4">
            {navGroups.map((group) => {
              // A hub with nothing visible renders nothing at all. deriveNavigation
              // already drops empty groups; this guard means the shell cannot
              // resurrect one as a bare heading if that ever changes.
              if (group.items.length === 0) return null
              const heading = t(group.label)
              return (
                <div key={group.hubId} role="group" aria-label={heading} className="space-y-1">
                  <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {heading}
                  </div>
                  {group.items.map((item) => {
                    const active =
                      pathname === item.route || (item.route !== '/admin' && pathname.startsWith(item.route))
                    const Icon = navIcon(item.icon)
                    return (
                      <Link
                        key={item.route}
                        href={item.route}
                        className={cn(
                          'flex items-center gap-3 rounded-admin-md px-3 py-2 text-sm transition-colors',
                          active ? 'bg-interactive text-white' : 'text-foreground hover:bg-muted'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {t(item.label)}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </nav>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card sticky top-0 z-10">
            <div className="md:hidden font-bold">{t('admin.shell.brand')} {t('admin.shell.badge')}</div>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              {/* B5 Context Bar. The locale control MOVED here rather than being
                  copied: two controls for one setting can disagree. */}
              <CommandPalette navGroups={navGroups} />
              <ContextBar env={env} />
              <div className="text-right">
                <div className="text-sm font-medium truncate max-w-[180px]">{email}</div>
                <div className="text-xs text-muted-foreground">{t(isOwner ? 'admin.role.owner' : ROLE_LABEL_KEY[role])}</div>
              </div>
              <Link
                href="/reviews"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                title={t('admin.shell.backToApp')}
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">{t('admin.shell.app')}</span>
              </Link>
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
