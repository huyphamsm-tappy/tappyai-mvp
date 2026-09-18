import type { Metadata } from 'next'
import { BRAND, ROUTE_TITLES, absoluteUrl, brandedOgImage } from '@/lib/share/openGraph'
import { breadcrumbJsonLd, homeCrumb } from '@/lib/discovery/siteJsonLd'
import { hubText } from '@/lib/i18n/discovery'
import { EXTENSION_PATH, extensionJsonLd, extensionStoreLinks } from '@/lib/growth/extensionListing'
import ExtensionBody from './ExtensionBody'

// ─────────────────────────────────────────────────────────────────────────────
// /extension — the browser extension's public landing page.
//
// THE FIRST LINK IN THE EXTENSION'S ACQUISITION CHAIN. A store listing is
// found mostly through the store's own search; a web page is found through
// Google/Bing, shared as a link, and cited by answer engines. This page is
// what "TappyAI Chrome extension" resolves to on the open web: what it does,
// exactly which permissions it has and why, the privacy policy, and — only
// once the owner has published — the install buttons. Until then it says so
// and points at the web app; it never links to a store page that does not
// exist and never claims store presence.
//
// Static, server-rendered in the product locale, one canonical, indexable,
// SoftwareApplication + BreadcrumbList structured data. Strings: `ext.*`.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_URL = absoluteUrl(EXTENSION_PATH)
const TITLE = ROUTE_TITLES[EXTENSION_PATH].vi
const DESCRIPTION = hubText('vi', 'ext.description')

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', siteName: BRAND.name, url: PAGE_URL, locale: 'vi_VN', alternateLocale: ['en_US'], title: TITLE, description: DESCRIPTION, images: [brandedOgImage()] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [brandedOgImage().url] },
}

export default function ExtensionPage() {
  const stores = extensionStoreLinks()
  const jsonLd = [
    extensionJsonLd({ name: `${BRAND.name} — ${hubText('vi', 'ext.h1')}`, description: DESCRIPTION }),
    breadcrumbJsonLd([homeCrumb(), { name: hubText('vi', 'ext.h1'), path: EXTENSION_PATH }]),
  ]
  return (
    <main className="min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      {jsonLd.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <ExtensionBody stores={stores} />
    </main>
  )
}
