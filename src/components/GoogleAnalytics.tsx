'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { GA4_MEASUREMENT_ID, GTAG_SCRIPT_HOST, ga4Init } from '@/lib/analytics/ga4'

// Loads gtag.js for the configured GA4 property. Renders nothing (and loads nothing) when
// NEXT_PUBLIC_GA_MEASUREMENT_ID is unset, which is the case everywhere except Production.
//
// No automatic page_view: gtag is configured with `send_page_view: false` in ga4Init and the
// in-app tracker mirrors its own page_view on every route change (lib/analytics/ga4.ts), so a
// page is counted exactly once whether it was a hard load or a client-side navigation.
// The property's Enhanced Measurement "page changes based on browser history events" must be
// OFF, or GA4 would add a second hit per navigation — see docs/analytics/GA4_SETUP.md.
export default function GoogleAnalytics() {
  useEffect(() => { ga4Init() }, [])
  if (!GA4_MEASUREMENT_ID) return null
  return (
    <Script
      id="ga4-gtag"
      src={`${GTAG_SCRIPT_HOST}/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`}
      strategy="afterInteractive"
    />
  )
}
