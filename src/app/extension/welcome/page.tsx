import type { Metadata } from 'next'
import { ROUTE_TITLES } from '@/lib/share/openGraph'
import { EXTENSION_WELCOME_PATH } from '@/lib/growth/extensionListing'
import WelcomeBody from './WelcomeBody'

// /extension/welcome — opened ONCE by the extension right after install
// (chrome.runtime.onInstalled, reason "install"), with `?src=browser_extension`.
//
// Two jobs: tell the person how to use it (right-click), and give the
// measurement spine an install signal without any extension telemetry —
// a first_visit whose landing_path is this page is a new-to-Tappy install;
// a later `query` with source browser_extension is its first use. See
// computeGrowthMetrics().extension. Noindex: it is a post-install screen,
// not a search destination (the landing page is /extension).
export const metadata: Metadata = {
  title: ROUTE_TITLES[EXTENSION_WELCOME_PATH].vi,
  robots: { index: false, follow: true },
}

export default function ExtensionWelcomePage() {
  return (
    <main className="min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      <WelcomeBody />
    </main>
  )
}
