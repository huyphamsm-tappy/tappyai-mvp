'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, MessageCircle, User, Compass, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/', icon: Home, label: 'Trang chủ' },
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/reviews', icon: Compass, label: 'Khám phá' },
  { href: '/deals', icon: Tag, label: 'Deals' },
  { href: '/profile', icon: User, label: 'Tôi' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

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
      <div className="max-w-2xl mx-auto px-2">
        <div className="flex items-center justify-around h-16">
          {tabs.map(({ href, icon: Icon, label }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <button
                key={href}
                onClick={() => handleTabClick(href)}
                className={cn('flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all duration-150', isActive ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600')}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} className={cn('transition-all', isActive && 'scale-110')} />
                <span className={cn('text-xs font-medium', isActive && 'font-semibold')}>{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
