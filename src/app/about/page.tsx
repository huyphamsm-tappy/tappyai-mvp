import type { Metadata } from 'next'
import { BRAND, ROUTE_TITLES, absoluteUrl, brandedOgImage } from '@/lib/share/openGraph'
import { aboutPageJsonLd, breadcrumbJsonLd, homeCrumb, organizationJsonLd } from '@/lib/discovery/siteJsonLd'
import { hubText } from '@/lib/i18n/discovery'
import AboutBody from './AboutBody'

// ─────────────────────────────────────────────────────────────────────────────
// /about — the entity / identity layer (G1 completion, AI-search readiness).
//
// Answer engines resolve "what is TappyAI" from a page that states it plainly:
// what it is, what it does, how it answers, who makes it, and where the rest
// of the public site is. This is that page. Static, server-rendered in the
// product locale (reconciled to the visitor's language on the client, the
// app-wide pattern), one canonical URL, and the SAME Organization node the
// home page and /startup emit — one entity, three pages that agree.
//
// Every string is an `about.*` key in src/lib/i18n/discovery.ts. No model,
// no data fetch, no user state: cost is bytes.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_URL = absoluteUrl('/about')
const TITLE = ROUTE_TITLES['/about'].vi
const DESCRIPTION = hubText('vi', 'about.description')

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: { type: 'website', siteName: BRAND.name, url: PAGE_URL, locale: 'vi_VN', alternateLocale: ['en_US'], title: TITLE, description: DESCRIPTION, images: [brandedOgImage()] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [brandedOgImage().url] },
}

export default function AboutPage() {
  const jsonLd = [
    aboutPageJsonLd({ title: TITLE, description: DESCRIPTION }),
    organizationJsonLd(),
    breadcrumbJsonLd([homeCrumb(), { name: hubText('vi', 'about.h1'), path: '/about' }]),
  ]
  return (
    <main className="min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      {jsonLd.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <AboutBody />
    </main>
  )
}
