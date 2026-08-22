'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { displayName } from '@/lib/i18n/displayName'

interface HeaderProps {
  user?: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  showBack?: boolean
  /**
   * Fixed destination for Back. Renders a link, so it *pushes* that route —
   * only correct for a page with exactly one parent. A page reachable from
   * several places should omit this and let Back pop history instead.
   */
  backHref?: string
  /**
   * Where Back goes when there is no in-app history to pop — i.e. the tab
   * opened directly on this page via a deep link or an external URL. Only
   * consulted when `backHref` is absent; without it Back keeps its existing
   * plain `router.back()` behaviour.
   */
  backFallbackHref?: string
  title?: string
  /** Hide the brand logo (Home floats over the background image; Hero carries the branding). */
  hideLogo?: boolean
}

export default function Header({ user, showBack, backHref, backFallbackHref, title, hideLogo }: HeaderProps) {
  const router = useRouter()
  const { t, locale } = useTranslation()
  // C14 — one shared derivation; the fallback word comes from the dictionary, not a literal.
  const firstName = displayName(user, t)

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
  // Back pops history rather than pushing a destination, so the user returns to
  // wherever they actually came from. Only used when no fixed `backHref` is
  // given. history.length === 1 means this tab opened directly on the page (a
  // deep link, a shared URL, the Play Console listing), so there is nothing to
  // pop — back() would dead-end, and in an Android TWA it would close the app.
  // In that case go to the declared fallback instead, via replace() so the
  // dead-end entry is not left behind in history.
  const goBack = () => {
    if (backFallbackHref && typeof window !== 'undefined' && window.history.length <= 1) {
      router.replace(backFallbackHref)
      return
    }
    router.back()
  }

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
            <Link href={backHref} className="flex items-center gap-1 text-link font-medium text-sm -ml-1">
              <ChevronLeft size={20} />
              {t('common.back')}
            </Link>
          ) : (
            <button onClick={goBack} className="flex items-center gap-1 text-link font-medium text-sm -ml-1">
              <ChevronLeft size={20} />
              {t('common.back')}
            </button>
          )
        ) : hideLogo ? (
          // Empty spacer keeps the right-side controls justified to the right
          // when the logo is hidden (e.g. Home floats over the background).
          <div aria-hidden />
        ) : (
          <Link href="/" className="flex items-center">
            <Image src="/branding/otter-logo.png" alt="TappyAI" width={36} height={36} className="h-9 w-9 rounded-[22%] object-cover" />
          </Link>
        )}

        {title && (
          <h1 className="font-semibold text-gray-900 dark:text-white truncate flex-1 text-center">
            {title}
          </h1>
        )}

        {user && !showBack && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-content-secondary hidden sm:block">
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
