'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, MessageCircle, User, Compass, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useNotifications } from '@/components/NotificationProvider'

const tabs = [
  { href: '/', icon: Home, labelKey: 'nav.home' },
  { href: '/chat', icon: MessageCircle, labelKey: 'nav.chat' },
  { href: '/reviews', icon: Compass, labelKey: 'nav.explore' },
  { href: '/deals', icon: Tag, labelKey: 'nav.deals' },
  { href: '/profile', icon: User, labelKey: 'nav.profile' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  // App-level unread count (ADR-014) — badge on the Explore tab is correct on
  // every route, including Home, because the store lives above the router.
  const { unreadCount } = useNotifications()

  // /reviews has its own TikNav — hide global nav to avoid duplicate "Trang chủ"
  if (pathname.startsWith('/reviews')) return null

  function handleTabClick(href: string) {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
    if (isActive) {
      // Already on this tab — scroll to top (reset to home of section)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      if (pathname !== href) {
        // On a sub-page, navigate back to section root
        router.push(href)
      }
    } else {
      router.push(href)
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-t border-gray-100 dark:border-gray-800">
      <div className="mx-auto w-full max-w-container-content px-2 sm:px-4 lg:px-6">
        <div className="flex items-center justify-around h-16">
          {tabs.map(({ href, icon: Icon, labelKey }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            // Explore (/reviews) hosts the Inbox — surface the unread badge there.
            const showBadge = href === '/reviews' && unreadCount > 0
            return (
              <button
                key={href}
                onClick={() => handleTabClick(href)}
                className={cn('flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all duration-150', isActive ? 'text-link' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600')}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} className={cn('transition-all', isActive && 'scale-110')} />
                  {showBadge && (
                    <span
                      key={unreadCount}
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#fe2c55] text-white text-[9px] font-bold leading-none flex items-center justify-center ring-2 ring-white dark:ring-gray-950 animate-in zoom-in-50 duration-200"
                      aria-label={t('nav.explore')}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className={cn('text-xs font-medium', isActive && 'font-semibold')}>{t(labelKey)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
