'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { recordNavigation } from '@/lib/nav/inAppBack'

/**
 * Keeps the per-tab list of in-app history entries that `goBack()` reads.
 * Renders nothing. Mounted once, in the root layout.
 *
 * The `popstate` listener is registered at mount, before the router's own, so
 * the flag is set by the time the pathname effect runs for that navigation.
 * See `src/lib/nav/inAppBack.ts` for why `document.referrer`, `history.length`
 * and a stamp on `history.state` were each the wrong signal.
 */
export default function NavHistoryTracker() {
  const pathname = usePathname()
  const popped = useRef(false)

  useEffect(() => {
    const onPop = () => { popped.current = true }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!pathname) return
    recordNavigation(pathname, { popped: popped.current })
    popped.current = false
  }, [pathname])

  return null
}
