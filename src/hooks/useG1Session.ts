'use client'

import { useEffect } from 'react'
import { captureAttribution } from '@/lib/analytics/attribution'
import { emitFirstVisit, emitReturnIfDue } from '@/lib/analytics/g1Events'

// G1 measurement spine — the per-session bootstrap. Mounted once by
// TrackingProvider next to page-view and auth tracking; it adds no second
// tracker. Order matters: attribution is captured BEFORE the first event so
// `first_visit` already carries the landing source.
export function useG1Session() {
  useEffect(() => {
    captureAttribution()
    emitFirstVisit()
    emitReturnIfDue()
  }, [])
}
