'use client'

import { useTrack } from '@/hooks/useTrack'

// Mounts in layout to auto-track page views across the whole app
export default function TrackingProvider() {
  useTrack()
  return null
}
