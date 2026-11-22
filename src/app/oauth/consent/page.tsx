import { Suspense } from 'react'
import type { Metadata } from 'next'
import ConsentView from './ConsentView'

// The consent screen for connectors (MCP). Never indexed. Behind Supabase's OAuth server: with no OAuth server switched on, no one is ever sent here.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function OAuthConsentPage() {
  return <Suspense fallback={null}><ConsentView /></Suspense>
}
