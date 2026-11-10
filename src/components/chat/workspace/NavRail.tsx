'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageCircle, User, Compass, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'

// The desktop left rail of the chat workspace: the same five destinations as the phone's bottom bar, stacked vertically.
const ITEMS = [
  { href: '/', icon: Home, labelKey: 'nav.home' },
  { href: '/chat', icon: MessageCircle, labelKey: 'nav.chat' },
  { href: '/reviews', icon: Compass, labelKey: 'nav.explore' },
  { href: '/deals', icon: Tag, labelKey: 'nav.deals' },
  { href: '/profile', icon: User, labelKey: 'nav.profile' },
] as const

export default function NavRail() {
  const pathname = usePathname()
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('chatWs.rail.label')}
      className="hidden lg:flex w-[110px] 2xl:w-[120px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-blue-500/25 bg-[#091022]/90 py-4 shadow-xl shadow-blue-950/70"
    >
      {ITEMS.map(({ href, icon: Icon, labelKey }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex w-[88px] flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-medium transition-colors',
              active ? 'bg-blue-600/30 text-sky-200 ring-1 ring-blue-400/40' : 'text-slate-400 hover:bg-blue-900/20 hover:text-slate-100',
            )}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} aria-hidden />
            <span>{t(labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
