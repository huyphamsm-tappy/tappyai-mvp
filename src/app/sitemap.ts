import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/share/openGraph'
import { HUB_DOMAINS } from '@/lib/discovery/domainHubs'
import { listPublicSharedResults } from '@/lib/share/sharedResultStore'

// Sitemap: home, the five discovery hubs, the public legal/help pages, and the
// newest public shared results. Regenerated hourly (ISR); one indexed read.
// Withdrawn shares drop out because the store lists `status = 'public'` only.

export const revalidate = 3600

const STATIC_PUBLIC_PATHS = ['/', '/scam-shield', '/how-to-use', '/privacy', '/terms'] as const
export const SITEMAP_SHARED_RESULTS_MAX = 2000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    ...STATIC_PUBLIC_PATHS.map((p) => ({ url: absoluteUrl(p), lastModified: now, changeFrequency: 'weekly' as const, priority: p === '/' ? 1 : 0.5 })),
    ...HUB_DOMAINS.map((d) => ({ url: absoluteUrl(`/${d}`), lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 })),
  ]
  let results: Awaited<ReturnType<typeof listPublicSharedResults>> = []
  try {
    results = await listPublicSharedResults({ limit: SITEMAP_SHARED_RESULTS_MAX })
  } catch {
    // A sitemap with the static surfaces is better than a 500; the results return next revalidation.
  }
  for (const r of results) {
    entries.push({ url: absoluteUrl(`/r/${r.slug}`), lastModified: new Date(r.created_at), changeFrequency: 'monthly', priority: 0.6 })
  }
  return entries
}
