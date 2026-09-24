import type { Metadata } from 'next'
import { BRAND, ROUTE_TITLES, absoluteUrl } from '@/lib/share/openGraph'
import { EXTENSION_PRIVACY_PATH, EXTENSION_PRIVACY_UPDATED } from '@/lib/growth/extensionListing'
import PrivacyBody from './PrivacyBody'

// /extension/privacy — the extension's privacy policy.
//
// Every extension store (Chrome Web Store, Edge Add-ons, Firefox AMO) requires
// a public privacy-policy URL for an extension that handles any user data,
// and the policy must match the manifest. This page states, in both
// languages, exactly what extensions/browser does — which is what
// src/lib/growth/browserExtension.test.ts enforces in code. Indexable: a
// crawler reading "what does this extension collect" should find the answer.
const PAGE_URL = absoluteUrl(EXTENSION_PRIVACY_PATH)
const TITLE = ROUTE_TITLES[EXTENSION_PRIVACY_PATH].vi

export const metadata: Metadata = {
  title: TITLE,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', siteName: BRAND.name, url: PAGE_URL, title: TITLE },
}

export default function ExtensionPrivacyPage() {
  return (
    <main className="min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      <PrivacyBody updated={EXTENSION_PRIVACY_UPDATED} />
    </main>
  )
}
