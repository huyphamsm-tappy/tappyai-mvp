import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/share/openGraph'
import { HUB_DOMAINS } from '@/lib/discovery/domainHubs'
import { SCAM_KB_PATH, scenarioPages } from '@/lib/scam-shield/knowledgePages'

// Sitemap: home, /about (entity layer), Scam Shield, the five discovery hubs,
// the public legal/help pages and /startup. Regenerated hourly (ISR).
//
// 🚨 NO USER SHARE PAGES (A5, PRIVACY-REVIEW-G1, owner 2026-09-28): /r/<slug> and /plan/<id> are
// noindex, nofollow and are deliberately absent here (and from IndexNow). A shared answer is
// reachable by its link only.

export const revalidate = 3600

const STATIC_PUBLIC_PATHS = ['/', '/about', '/scam-shield', '/extension', '/extension/privacy', '/how-to-use', '/privacy', '/terms', '/community-guidelines', '/startup'] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    ...STATIC_PUBLIC_PATHS.map((p) => ({ url: absoluteUrl(p), lastModified: now, changeFrequency: 'weekly' as const, priority: p === '/' ? 1 : p === '/about' || p === '/scam-shield' || p === '/extension' ? 0.8 : 0.5 })),
    ...HUB_DOMAINS.map((d) => ({ url: absoluteUrl(`/${d}`), lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 })),
    // The official scam-scenario pages: a static dataset, so lastModified is the dataset's own date.
    { url: absoluteUrl(SCAM_KB_PATH), lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 },
    ...scenarioPages().map(({ path }) => ({ url: absoluteUrl(path), lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ]
  return entries
}
