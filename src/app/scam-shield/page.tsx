import type { Metadata } from 'next'
import { BRAND, ROUTE_TITLES, absoluteUrl, brandedOgImage } from '@/lib/share/openGraph'
import { breadcrumbJsonLd, homeCrumb } from '@/lib/discovery/siteJsonLd'
import { hubText } from '@/lib/i18n/discovery'
import ScamShieldView from './ScamShieldView'

// G1 completion — Scam Shield is the highest-intent public entry Tappy has
// ("kiểm tra link lừa đảo", "check scam link") and had NO metadata: the tab,
// the search snippet and the share card all fell back to the site title.
// Crawler-facing text is the product locale (vi, see layout.tsx); the visible
// tab title is reconciled to the visitor's language by HtmlLangSync through
// ROUTE_TITLES. Canonical is the bare path — the extension's `?url=…&src=…`
// deep links are the same page.
const PAGE_URL = absoluteUrl('/scam-shield')
const TITLE = ROUTE_TITLES['/scam-shield'].vi
const DESCRIPTION = hubText('vi', 'seo.scamShield.description')

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', siteName: BRAND.name, url: PAGE_URL, locale: 'vi_VN', title: TITLE, description: DESCRIPTION, images: [brandedOgImage()] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [brandedOgImage().url] },
}

const breadcrumb = breadcrumbJsonLd([homeCrumb(), { name: 'Scam Shield', path: '/scam-shield' }])

// Scam Shield is a V3 destination now, so the shell comes from `V3Shell` inside the view — the
// same arrangement as Deals, Marketplace and Profile. This page previously composed `Header` +
// `BottomNav` by hand, which is what left it looking like a page from the previous design while
// its own sidebar entry sat inside the V3 rail. `V3Shell` renders both (BottomNav below `lg`).
//
// The check itself is unchanged: the view is a client of POST /api/scam-shield/check and /qr,
// the same endpoints Android and iOS consume.
export default function ScamShieldPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <ScamShieldView />
    </>
  )
}
