'use client'
import { useCallback } from 'react'
import { track, EventType } from '@/lib/tracking/tracker'

export function useTrack() {
  const trackEvent = useCallback((event_type: EventType, metadata?: Record<string, unknown>) => {
    track(event_type, metadata)
  }, [])

  return { track: trackEvent }
}

// Simple function export for non-hook usage
export { track }
