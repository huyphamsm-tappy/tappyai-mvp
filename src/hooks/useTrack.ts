import { useCallback, useEffect, useRef } from 'react'
import { track, tracker, type EventType } from '@/lib/tracking/tracker'
import { usePathname } from 'next/navigation'

// Auto-tracks page views + time-on-page, provides a track() helper
export function useTrack() {
  const pathname = usePathname()
  const enteredAt = useRef<number>(Date.now())
  const lastPath = useRef<string>(pathname)

  // Track page view on route change; fire page_time for previous page
  useEffect(() => {
    const now = Date.now()
    const duration_ms = now - enteredAt.current

    // Fire time event for the page we're leaving (skip if <1s — likely fast redirect)
    if (duration_ms >= 1000) {
      track('page_time', { path: lastPath.current, duration_ms })
    }

    track('page_view', { path: pathname })
    enteredAt.current = now
    lastPath.current = pathname
  }, [pathname])

  // Flush on unmount / page unload; also send time for current page
  useEffect(() => {
    const handleUnload = () => {
      const duration_ms = Date.now() - enteredAt.current
      if (duration_ms >= 1000) {
        track('page_time', { path: lastPath.current, duration_ms })
      }
      tracker?.flushSync()
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  const trackEvent = useCallback((event_type: EventType, metadata?: Record<string, unknown>) => {
    track(event_type, metadata)
  }, [])

  return { track: trackEvent }
}
