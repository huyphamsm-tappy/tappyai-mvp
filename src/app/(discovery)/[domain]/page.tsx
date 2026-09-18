import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HUB_DOMAINS, hubCopy, isHubDomain } from '@/lib/discovery/domainHubs'
import { listPublicSharedResults } from '@/lib/share/sharedResultStore'
import { BRAND, absoluteUrl, brandedOgImage } from '@/lib/share/openGraph'
import { breadcrumbJsonLd, homeCrumb, hubCrumb } from '@/lib/discovery/siteJsonLd'
import HubBody from './HubBody'

// ─────────────────────────────────────────────────────────────────────────────
// /food /shopping /travel /entertainment /spa — public discovery hubs (GEO).
//
// Static and ISR-cached. Exactly five pages exist (`dynamicParams = false`),
// each built from the `hub.*` dictionary plus the newest public shared results
// in the domain. Server-rendered text (product locale for crawlers, reconciled
// to the visitor's locale on the client — see HubBody), canonical URL,
// structured data, internal links — and no model call anywhere on the path.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams() {
  return HUB_DOMAINS.map((domain) => ({ domain }))
}

interface Props { params: { domain: string } }

export function generateMetadata({ params }: Props): Metadata {
  if (!isHubDomain(params.domain)) return { robots: { index: false } }
  // Crawler-facing metadata is in the product locale; the page has one canonical URL.
  const copy = hubCopy(params.domain, 'vi')
  const url = absoluteUrl(`/${params.domain}`)
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', siteName: BRAND.name, url, locale: 'vi_VN', title: copy.title, description: copy.description, images: [brandedOgImage()] },
    twitter: { card: 'summary_large_image', title: copy.title, description: copy.description, images: [brandedOgImage().url] },
  }
}

export default async function DomainHubPage({ params }: Props) {
  if (!isHubDomain(params.domain)) notFound()
  const domain = params.domain
  const results = await listPublicSharedResults({ domain, limit: 24 })

  // Structured data in both languages: an FAQPage per locale, so an English
  // answer engine and a Vietnamese one each find the question in its language.
  const jsonLd: Array<Record<string, unknown> & { key: string }> = (['vi', 'en'] as const).map((locale) => ({
    key: `faq-${locale}`,
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: hubCopy(domain, locale).faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }))
  // Breadcrumb: Home › hub. A hub is one click from the root, and the trail says so.
  jsonLd.push({ key: 'breadcrumb', ...breadcrumbJsonLd([homeCrumb(), hubCrumb(domain)]) })

  return (
    <main className="min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      {jsonLd.map(({ key, ...ld }) => (
        <script key={key} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <HubBody domain={domain} results={results} />
    </main>
  )
}
