// ─────────────────────────────────────────────────────────────────────────────
// Public scam-scenario pages — `/scam-shield/kich-ban` and `/scam-shield/kich-ban/<id>`.
//
// The 25 official scenarios (Bộ Công an, 2026) already ship inside the
// client-rendered Scam Shield page, where no search engine can see them as
// pages. Each scenario is a real, high-intent Vietnamese query ("lừa đảo
// deepfake", "việc nhẹ lương cao", "giả danh công an"). These helpers give
// each one a canonical URL built from the SAME static dataset — official text
// visibly separated from TappyAI's guidance, source link to the authority's
// domain, no model, no fetch, no quota. Twenty-five pages, not thousands.
//
// Pure: paths, metadata inputs and structured data, from the dataset only.
// ─────────────────────────────────────────────────────────────────────────────

import { BRAND, absoluteUrl } from '@/lib/share/openGraph'
import { organizationId } from '@/lib/discovery/siteJsonLd'
import { hubText } from '@/lib/i18n/discovery'
import { allScenarios, datasetOf, scenarioById, type ScamScenario } from './knowledge'

export const SCAM_KB_PATH = '/scam-shield/kich-ban'
const ID_RE = /^[a-z0-9-]{3,40}$/

export function scenarioPath(id: string): string {
  return `${SCAM_KB_PATH}/${id}`
}

/** Every public scenario page, in official order. Static: the sitemap and generateStaticParams read this. */
export function scenarioPages(): Array<{ id: string; path: string }> {
  return allScenarios().map((s) => ({ id: s.id, path: scenarioPath(s.id) }))
}

/** Resolve a route param to a scenario, or null. Never throws on junk. */
export function scenarioForParam(id: unknown): ScamScenario | null {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null
  return scenarioById(id)
}

/** Title/description for a scenario page, in the product locale (the dataset is Vietnamese). */
export function scenarioMeta(s: ScamScenario): { title: string; description: string } {
  return {
    title: `${s.official.title} — Scam Shield · ${BRAND.name}`,
    description: `${s.official.summary} ${hubText('vi', 'kb.page.descriptionSuffix', { org: s.source.organization })}`,
  }
}

/** schema.org Article for one scenario: TappyAI is the author of the page; the official source is what it is based on. */
export function scenarioJsonLd(s: ScamScenario, env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const url = absoluteUrl(scenarioPath(s.id), env)
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': url,
    url,
    headline: s.official.title,
    description: s.official.summary,
    inLanguage: 'vi',
    datePublished: s.source.publishedAt ?? s.source.verifiedAt,
    dateModified: s.source.verifiedAt,
    author: { '@id': organizationId(env) },
    publisher: { '@id': organizationId(env) },
    isBasedOn: { '@type': 'CreativeWork', name: s.source.title, url: s.source.url, publisher: { '@type': 'GovernmentOrganization', name: s.source.organization } },
    about: { '@type': 'Thing', name: datasetOf(s).groups.find((g) => g.category === s.category)?.label ?? s.category },
    isPartOf: { '@type': 'WebPage', url: absoluteUrl(SCAM_KB_PATH, env) },
  }
}

/** schema.org ItemList for the index page. */
export function scenarioIndexJsonLd(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: absoluteUrl(SCAM_KB_PATH, env),
    numberOfItems: allScenarios().length,
    itemListElement: allScenarios().map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.official.title, url: absoluteUrl(scenarioPath(s.id), env) })),
  }
}
