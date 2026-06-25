import { useCallback, useEffect } from 'react'
import { track, tracker, type EventType } from '@/lib/tracking/tracker'
import { usePathname } from 'next/navigation'

// Auto-tracks page views and provides a track() helper
export function useTrack() {
  const pathname = usePathname()

  // Track page view on route change
  useEffect(() => {
    track('page_view', { path: pathname })
  }, [pathname])

  // Flush on unmount / page unload
  useEffect(() => {
    const handleUnload = () => tracker?.flushSync()
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  const trackEvent = useCallback((event_type: EventType, metadata?: Record<string, unknown>) => {
    track(event_type, metadata)
  }, [])

  return { track: trackEvent }
}
