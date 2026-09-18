import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BRAND, absoluteUrl, brandedOgImage } from '@/lib/share/openGraph'
import { breadcrumbJsonLd, homeCrumb } from '@/lib/discovery/siteJsonLd'
import { hubText } from '@/lib/i18n/discovery'
import { SCAM_KB_PATH, scenarioForParam, scenarioJsonLd, scenarioMeta, scenarioPages, scenarioPath } from '@/lib/scam-shield/knowledgePages'
import ScenarioPageBody from './ScenarioPageBody'

// ─────────────────────────────────────────────────────────────────────────────
// /scam-shield/kich-ban/<id> — one official scam scenario as a public page.
//
// Exactly the 25 ids in the dataset exist (`dynamicParams = false`); anything
// else is a 404. Server-rendered from the static dataset: the official text
// under its own heading with the source link, TappyAI's guidance under a
// heading that says it is TappyAI's — the same ScenarioDetail the Scam Shield
// page renders, so the two can never disagree. Article + BreadcrumbList
// structured data, canonical, Discover-eligible (`max-image-preview: large`).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamicParams = false

export function generateStaticParams() {
  return scenarioPages().map(({ id }) => ({ id }))
}

interface Props { params: { id: string } }

export function generateMetadata({ params }: Props): Metadata {
  const s = scenarioForParam(params.id)
  if (!s) return { robots: { index: false, follow: false } }
  const { title, description } = scenarioMeta(s)
  const url = absoluteUrl(scenarioPath(s.id))
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: { type: 'article', siteName: BRAND.name, url, locale: 'vi_VN', title, description, images: [brandedOgImage()], publishedTime: s.source.publishedAt },
    twitter: { card: 'summary_large_image', title, description, images: [brandedOgImage().url] },
  }
}

export default function ScamScenarioPage({ params }: Props) {
  const s = scenarioForParam(params.id)
  if (!s) notFound()
  const jsonLd = [
    scenarioJsonLd(s),
    breadcrumbJsonLd([
      homeCrumb(),
      { name: 'Scam Shield', path: '/scam-shield' },
      { name: hubText('vi', 'kb.index.crumb'), path: SCAM_KB_PATH },
      { name: s.official.title, path: scenarioPath(s.id) },
    ]),
  ]
  return (
    <main className="v3-theme min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      {jsonLd.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <ScenarioPageBody scenario={s} />
    </main>
  )
}
