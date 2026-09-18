import type { Metadata } from 'next'
import { BRAND, absoluteUrl, brandedOgImage } from '@/lib/share/openGraph'
import { breadcrumbJsonLd, homeCrumb } from '@/lib/discovery/siteJsonLd'
import { hubText } from '@/lib/i18n/discovery'
import { SCAM_KB_PATH, scenarioIndexJsonLd } from '@/lib/scam-shield/knowledgePages'
import KnowledgeIndexBody from './KnowledgeIndexBody'

// ─────────────────────────────────────────────────────────────────────────────
// /scam-shield/kich-ban — the 25 official scam scenarios, as an indexable page.
//
// Static. Same dataset as the Scam Shield knowledge section, rendered as a
// page with one canonical, ItemList + BreadcrumbList structured data and a
// link to every scenario page. No model, no fetch, no quota. Crawler-facing
// text is the product locale (vi); chrome reconciles to the visitor's locale.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_URL = absoluteUrl(SCAM_KB_PATH)
const TITLE = hubText('vi', 'kb.index.title')
const DESCRIPTION = hubText('vi', 'kb.index.description')

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: { type: 'website', siteName: BRAND.name, url: PAGE_URL, locale: 'vi_VN', title: TITLE, description: DESCRIPTION, images: [brandedOgImage()] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [brandedOgImage().url] },
}

export default function ScamKnowledgeIndexPage() {
  const jsonLd = [
    scenarioIndexJsonLd(),
    breadcrumbJsonLd([homeCrumb(), { name: 'Scam Shield', path: '/scam-shield' }, { name: hubText('vi', 'kb.index.crumb'), path: SCAM_KB_PATH }]),
  ]
  return (
    <main className="v3-theme min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      {jsonLd.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <KnowledgeIndexBody />
    </main>
  )
}
