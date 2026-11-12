'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageCircle, User, Compass, Tag, Bookmark, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { FAVORITES_CHANGED_EVENT, OPEN_SAVED_EVENT } from '@/lib/chat/v206Look'

// The desktop left rail of the chat workspace (the mockup's): a blue "Tạo mới" button on top, then the destinations as icon + label stacked vertically, "Đã lưu" opening the
// saved-places panel with the person's REAL count of saved places as a badge (no badge for none, or when the list cannot be read).
const ITEMS = [
  { href: '/', icon: Home, labelKey: 'nav.home' },
  { href: '/chat', icon: MessageCircle, labelKey: 'nav.chat' },
  { href: '/reviews', icon: Compass, labelKey: 'nav.explore' },
  { href: '/deals', icon: Tag, labelKey: 'nav.deals' },
  { href: '/profile', icon: User, labelKey: 'nav.profile' },
] as const

const ITEM_BASE = 'relative flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-medium tracking-tight transition-all'
const ITEM_IDLE = 'text-slate-400 hover:bg-blue-900/20 hover:text-white'
const ITEM_ACTIVE = 'border-l-2 border-blue-400 bg-gradient-to-r from-blue-600/30 via-blue-500/15 to-transparent text-blue-200 shadow-sm'

/** How many places the person saved (GET /api/favorites, owner-only); null when it cannot be read or they are signed out. */
function useSavedCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/favorites', { cache: 'no-store' })
      if (!res.ok) { setCount(null); return }
      const body = (await res.json()) as { favorites?: unknown[] }
      setCount(Array.isArray(body.favorites) ? body.favorites.length : null)
    } catch {
      /* keep what is shown */
    }
  }, [])
  useEffect(() => {
    void load()
    window.addEventListener(FAVORITES_CHANGED_EVENT, load)
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, load)
  }, [load])
  return count
}

export default function NavRail() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const saved = useSavedCount()
  return (
    <nav
      aria-label={t('chatWs.rail.label')}
      className="hidden lg:flex w-[110px] 2xl:w-[120px] shrink-0 flex-col items-center gap-3 rounded-2xl border border-blue-500/25 bg-[#091022]/90 px-2.5 py-4 shadow-xl shadow-blue-950/70"
    >
      <Link
        href="/chat"
        data-testid="rail-create"
        className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-600 to-indigo-600 px-2 py-3 text-white shadow-lg shadow-blue-600/30 transition-all hover:from-blue-500 hover:to-indigo-500"
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden />
        <span className="text-[11px] font-semibold tracking-wide">{t('chatWs.rail.create')}</span>
      </Link>

      <div className="flex w-full flex-col gap-1.5 pt-1">
        {ITEMS.map(({ href, icon: Icon, labelKey }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Fragment key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined} className={cn(ITEM_BASE, active ? ITEM_ACTIVE : ITEM_IDLE)}>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden className={active ? 'text-blue-400' : undefined} />
                <span>{t(labelKey)}</span>
              </Link>
              {/* "Đã lưu" sits right after Khám phá, as in the mockup */}
              {href === '/reviews' && (
                <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SAVED_EVENT))} data-testid="rail-saved" className={cn(ITEM_BASE, ITEM_IDLE)}>
                  <span className="relative flex items-center justify-center">
                    <Bookmark size={20} strokeWidth={1.8} aria-hidden />
                    {saved !== null && saved > 0 && (
                      <span data-testid="rail-saved-count" className="absolute -right-2.5 -top-1.5 min-w-[15px] rounded-full bg-blue-600 px-1 text-center text-[9px] font-bold leading-[15px] text-white">{saved > 99 ? '99+' : saved}</span>
                    )}
                  </span>
                  <span>{t('chatWs.rail.saved')}</span>
                </button>
              )}
            </Fragment>
          )
        })}
      </div>
    </nav>
  )
}
