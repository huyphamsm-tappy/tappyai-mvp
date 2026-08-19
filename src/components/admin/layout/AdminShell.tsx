'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { type AdminRole } from '@/lib/admin/roles'
import type { NavGroup } from '@/lib/controller/adminNavigation'
import { navIcon } from './navIcons'
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
   * authority. Groups are flattened to a single ordered list to preserve the
   * existing sidebar layout.
   */
  navGroups: readonly NavGroup[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const { t, locale, setLocale } = useTranslation()

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
              <div className="flex gap-1">
                {(['vi', 'en'] as const).map((code) => (
                  <button
                    key={code}
                    onClick={() => setLocale(code)}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium transition-colors',
                      locale === code ? 'bg-interactive text-white' : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={locale === code}
                  >
                    {code.toUpperCase()}
                  </button>
                ))}
              </div>
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
