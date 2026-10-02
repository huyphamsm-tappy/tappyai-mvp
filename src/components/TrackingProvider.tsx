'use client'

import { useTrack } from '@/hooks/useTrack'
import { useAuthEvents } from '@/hooks/useAuthEvents'
import { useG1Session } from '@/hooks/useG1Session'

// Mounts in layout to auto-track page views + authentication events + the G1
// growth session bootstrap (attribution, first_visit, return) across the app
export default function TrackingProvider() {
  useTrack()
  useAuthEvents()
  useG1Session()
  return null
}
