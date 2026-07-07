'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface HeaderProps {
  user?: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  showBack?: boolean
  backHref?: string
  title?: string
}

export default function Header({ user, showBack, backHref, title }: HeaderProps) {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const firstName = user?.full_name?.split(' ').pop() || user?.email?.split('@')[0] || 'bạn'

  // Greeting depends on the local time-of-day, so it must be computed on the
  // client only — computing it during render would differ between the server
  // timezone (UTC) and the browser timezone and cause a hydration mismatch
  // (React #425/#422). Start empty so SSR and first client render agree.
  // Recomputes on locale change so the greeting language follows the toggle.
  const [greeting, setGreeting] = useState('')
  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? t('header.morning') : hour < 18 ? t('header.afternoon') : t('header.evening'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  // Dark mode toggle
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved ? saved === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])
  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div className="container-content h-14 flex items-center justify-between gap-3">
        {showBack ? (
          backHref ? (
            <Link href={backHref} className="flex items-center gap-1 text-primary-500 font-medium text-sm -ml-1">
              <ChevronLeft size={20} />
              {t('common.back')}
            </Link>
          ) : (
            <button onClick={() => router.back()} className="flex items-center gap-1 text-primary-500 font-medium text-sm -ml-1">
              <ChevronLeft size={20} />
              {t('common.back')}
            </button>
          )
        ) : (
          <Link href="/" className="flex items-center">
            <Image src="/logo.png" alt="TappyAI" width={120} height={40} className="h-9 w-auto" />
          </Link>
        )}

        {title && (
          <h1 className="font-semibold text-gray-900 dark:text-white truncate flex-1 text-center">
            {title}
          </h1>
        )}

        {user && !showBack && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
              {greeting}, <span className="font-medium text-gray-900 dark:text-white">{firstName}</span>
            </span>
            <button onClick={toggleDark} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link href="/profile" className="flex items-center">
              {user.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.full_name || 'Avatar'}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-primary-500/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">
                    {firstName[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </Link>
          </div>
        )}

        {user && showBack && title && (
          <Link href="/profile" className="flex-shrink-0">
            {user.avatar_url ? (
              <Image src={user.avatar_url} alt="Avatar" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">{firstName[0]?.toUpperCase()}</span>
              </div>
            )}
          </Link>
        )}
      </div>
    </header>
  )
}
