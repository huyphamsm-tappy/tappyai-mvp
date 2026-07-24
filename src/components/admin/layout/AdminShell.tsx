'use client'

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BarChart3, Users, ShieldAlert, Megaphone,
  ScrollText, KeyRound, Settings as SettingsIcon, Activity, LogOut, UserCheck, Zap, Tag,
} from 'lucide-react'
import { hasRole, type AdminRole } from '@/lib/admin/roles'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Navigation model. `minRole` gates visibility (12_RBAC.md). `ready:false` items
// are future phases — shown disabled so the full structure is visible (UI/UX §4.2).
type NavItem = {
  href: string
  labelKey: string
  icon: ComponentType<{ className?: string }>
  minRole: AdminRole
  ready: boolean
}

const NAV: NavItem[] = [
  { href: '/admin', labelKey: 'admin.nav.dashboard', icon: LayoutDashboard, minRole: 'analyst', ready: true },
  { href: '/admin/analytics', labelKey: 'admin.nav.analytics', icon: BarChart3, minRole: 'analyst', ready: true },
  { href: '/admin/analytics/auth', labelKey: 'admin.nav.authAnalytics', icon: UserCheck, minRole: 'analyst', ready: true },
  { href: '/admin/analytics/activation', labelKey: 'admin.nav.activationAnalytics', icon: Zap, minRole: 'analyst', ready: true },
  { href: '/admin/users', labelKey: 'admin.nav.users', icon: Users, minRole: 'admin', ready: false },
  { href: '/admin/moderation', labelKey: 'admin.nav.moderation', icon: ShieldAlert, minRole: 'moderator', ready: false },
  { href: '/admin/engagement', labelKey: 'admin.nav.engagement', icon: Megaphone, minRole: 'admin', ready: false },
  { href: '/admin/audit', labelKey: 'admin.nav.auditLog', icon: ScrollText, minRole: 'admin', ready: true },
  { href: '/admin/deals', labelKey: 'admin.nav.deals', icon: Tag, minRole: 'admin', ready: true },
  { href: '/admin/rbac', labelKey: 'admin.nav.roles', icon: KeyRound, minRole: 'super_admin', ready: true },
  { href: '/admin/monitoring', labelKey: 'admin.nav.monitoring', icon: Activity, minRole: 'admin', ready: false },
  { href: '/admin/settings', labelKey: 'admin.nav.settings', icon: SettingsIcon, minRole: 'admin', ready: true },
]

const ROLE_LABEL_KEY: Record<AdminRole, string> = {
  super_admin: 'admin.role.superAdmin',
  admin: 'admin.role.admin',
  moderator: 'admin.role.moderator',
  analyst: 'admin.role.analyst',
}

export function AdminShell({
  role,
  email,
  children,
}: {
  role: AdminRole
  email: string
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
          <nav className="flex-1 p-3 space-y-1">
            {NAV.filter((item) => hasRole(role, item.minRole)).map((item) => {
              const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
              const Icon = item.icon
              if (!item.ready) {
                return (
                  <div
                    key={item.href}
                    className="flex items-center gap-3 rounded-admin-md px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed select-none"
                    title={t('admin.shell.comingLaterPhase')}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{t(item.labelKey)}</span>
                    <span className="text-[10px] uppercase tracking-wide">{t('admin.shell.comingSoon')}</span>
                  </div>
                )
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-admin-md px-3 py-2 text-sm transition-colors',
                    active ? 'bg-primary text-white' : 'text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
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
                      locale === code ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={locale === code}
                  >
                    {code.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="text-right">
                <div className="text-sm font-medium truncate max-w-[180px]">{email}</div>
                <div className="text-xs text-muted-foreground">{t(ROLE_LABEL_KEY[role])}</div>
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
