// Site-level structured data for the home page (GEO / AI search).
//
// Two objects, both pure data from constants the app already owns:
//   · WebSite with a SearchAction → Google's "sitelinks search box" and a
//     documented way for answer engines to see that Tappy answers questions
//     at /chat?q=…  (the same entry the hubs link to).
//   · Organization with the brand name, logo and public home.
// No user data, no request data, no model. Rendered once in the static home
// markup; cost is bytes.

import { BRAND, absoluteUrl } from '@/lib/share/openGraph'

export function siteJsonLd(env: NodeJS.ProcessEnv = process.env): Record<string, unknown>[] {
  const home = absoluteUrl('/', env)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BRAND.name,
      url: home,
      inLanguage: ['vi', 'en'],
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/chat', env)}?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: BRAND.name,
      url: home,
      logo: absoluteUrl('/branding/otter-logo.png', env),
      description: BRAND.tagline.en,
    },
  ]
}
