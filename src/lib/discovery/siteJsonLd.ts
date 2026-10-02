// Site-level structured data (Google Search / AI answer engines).
//
// Every object here is pure data from constants the app already owns:
//   · WebSite with a SearchAction → Google's "sitelinks search box" and a
//     documented way for answer engines to see that Tappy answers questions
//     at /chat?q=…  (the same entry the hubs link to).
//   · Organization — ONE definition of the entity, used by `/`, `/about` and
//     `/startup`. AI engines resolve "what is TappyAI" by reconciling the
//     Organization they meet on different pages; two definitions that disagree
//     (the home page and the startup page used to have their own) weaken the
//     entity instead of strengthening it.
//   · BreadcrumbList — the crawl-depth signal for hubs and public results.
//   · AboutPage — the entity/identity layer at /about.
// No user data, no request data, no model. Rendered once in static markup;
// cost is bytes.

import { BRAND, absoluteUrl } from '@/lib/share/openGraph'
import { FOUNDER_LINKEDIN_URL, SUPPORT_EMAIL } from '@/components/landing/config'
import { hubText } from '@/lib/i18n/discovery'
import { HUB_DOMAINS } from './domainHubs'

/** The Organization node's `@id` — one URL fragment every page points at. */
export function organizationId(env: NodeJS.ProcessEnv = process.env): string {
  return `${absoluteUrl('/', env)}#organization`
}

/**
 * Official profile URLs for `sameAs`, from `ORGANIZATION_SAME_AS` (comma-separated,
 * https only). Owner-supplied on purpose: a sameAs that points at a profile the
 * organization does not actually own is worse for entity resolution than none.
 * Empty until the owner sets it.
 */
export function organizationSameAs(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ORGANIZATION_SAME_AS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^https:\/\/[^\s/]+\.[^\s/]+\/\S*$/.test(s))
}

/** The single Organization entity. `@id` lets every page reference the same node. */
export function organizationJsonLd(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const home = absoluteUrl('/', env)
  const sameAs = organizationSameAs(env)
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId(env),
    name: BRAND.name,
    url: home,
    logo: absoluteUrl('/branding/otter-logo.png', env),
    description: BRAND.tagline.en,
    email: SUPPORT_EMAIL,
    // Public, already-published facts only (they are on /startup today). No
    // social profiles are listed because none is verified as official yet —
    // `sameAs` with a wrong URL is worse than none.
    founder: { '@type': 'Person', name: 'Huy Pham', sameAs: FOUNDER_LINKEDIN_URL },
    areaServed: { '@type': 'Country', name: 'Vietnam' },
    knowsLanguage: ['vi', 'en'],
    ...(sameAs.length ? { sameAs } : {}),
  }
}

export function siteJsonLd(env: NodeJS.ProcessEnv = process.env): Record<string, unknown>[] {
  const home = absoluteUrl('/', env)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BRAND.name,
      url: home,
      inLanguage: ['vi', 'en'],
      publisher: { '@id': organizationId(env) },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/chat', env)}?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    organizationJsonLd(env),
  ]
}

export interface Crumb { name: string; path: string }

/** schema.org BreadcrumbList for an ordered trail ending at the current page. Pure. */
export function breadcrumbJsonLd(trail: readonly Crumb[], env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path, env),
    })),
  }
}

/** Home crumb. Server-rendered text is in the product locale (see layout.tsx). */
export function homeCrumb(): Crumb {
  return { name: BRAND.name, path: '/' }
}

/** The crumb for a discovery hub, named by its h1 in the product locale. */
export function hubCrumb(domain: (typeof HUB_DOMAINS)[number]): Crumb {
  return { name: hubText('vi', `hub.${domain}.h1`), path: `/${domain}` }
}

/** AboutPage — the entity/identity layer. `mainEntity` is the shared Organization node. */
export function aboutPageJsonLd(input: { title: string; description: string }, env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: absoluteUrl('/about', env),
    name: input.title,
    description: input.description,
    inLanguage: ['vi', 'en'],
    mainEntity: { '@id': organizationId(env) },
    isPartOf: { '@type': 'WebSite', url: absoluteUrl('/', env), name: BRAND.name },
  }
}
