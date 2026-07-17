'use client'

import { useTrack } from '@/hooks/useTrack'
import { useAuthEvents } from '@/hooks/useAuthEvents'

// Mounts in layout to auto-track page views + authentication events across the app
export default function TrackingProvider() {
  useTrack()
  useAuthEvents()
  return null
}
