import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/share/openGraph'

// The public/private CRAWL policy. NOT a security boundary — private routes
// answer 401/403 server-side regardless of what a crawler reads here; this
// only keeps search engines and AI crawlers pointed at the surfaces that are
// meant to be discovered (home, the five domain hubs, public shared results).

/** Routes a crawler must not index. Mirrors the private surfaces, not enforces them. */
export const DISALLOWED_PATHS = [
  '/api/',
  '/admin',
  '/chat',
  '/profile',
  '/messages',
  '/auth/',
  '/login',
  '/register',
  '/onboarding',
  '/access-denied',
  '/delete-account',
  '/share-target',
] as const

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
