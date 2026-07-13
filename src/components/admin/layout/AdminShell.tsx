'use client'

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BarChart3, Users, ShieldAlert, Megaphone,
  ScrollText, KeyRound, Settings as SettingsIcon, Activity, LogOut,
} from 'lucide-react'
import { hasRole, type AdminRole } from '@/lib/admin/roles'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// Navigation model. `minRole` gates visibility (12_RBAC.md). `ready:false` items
// are future phases — shown disabled so the full structure is visible (UI/UX §4.2).
type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  minRole: AdminRole
  ready: boolean
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, minRole: 'analyst', ready: true },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, minRole: 'analyst', ready: true },
  { href: '/admin/users', label: 'Users', icon: Users, minRole: 'admin', ready: false },
  { href: '/admin/moderation', label: 'Moderation', icon: ShieldAlert, minRole: 'moderator', ready: false },
  { href: '/admin/engagement', label: 'Engagement', icon: Megaphone, minRole: 'admin', ready: false },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText, minRole: 'admin', ready: true },
  { href: '/admin/rbac', label: 'Roles', icon: KeyRound, minRole: 'super_admin', ready: true },
  { href: '/admin/monitoring', label: 'Monitoring', icon: Activity, minRole: 'admin', ready: false },
  { href: '/admin/settings', label: 'Settings', icon: SettingsIcon, minRole: 'admin', ready: true },
]

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  analyst: 'Analyst',
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

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card min-h-dvh sticky top-0">
          <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
            <span className="text-lg font-bold">TappyAI</span>
            <Badge variant="muted">Back Office</Badge>
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
                    title="Coming in a later phase"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[10px] uppercase tracking-wide">soon</span>
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
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card sticky top-0 z-10">
            <div className="md:hidden font-bold">TappyAI Back Office</div>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium truncate max-w-[180px]">{email}</div>
                <div className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</div>
              </div>
              <Link
                href="/reviews"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                title="Back to app"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">App</span>
              </Link>
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
