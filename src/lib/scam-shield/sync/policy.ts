import { isOfficialSourceUrl, OFFICIAL_SOURCE_HOSTS } from '../knowledge'
import { isCompleteArticle, type ParsedArticle } from './extract'

// Scam Shield · weekly sync — the publishing policy: hands-off, but safe.
//
// An entry becomes 'approved' (what the checker and the page may show) by itself ONLY when ALL of these hold:
//   1. its host is on the official allow-list (OFFICIAL_SOURCE_HOSTS) and the URL is https;
//   2. its published date is strictly newer than the newest approved entry (or the static dataset, whichever is later);
//   3. the extraction is complete (title, real date, a body that is an article and not a stub);
//   4. the date is not in the future (a typo or a scheduled post is not "published").
// Anything else is stored as 'pending' for a human, with the reasons — never dropped silently, never shown to users.

export type KnowledgeStatus = 'pending' | 'approved' | 'rejected'

export interface PolicyInput {
  article: ParsedArticle
  /** ISO date of the newest approved entry or the static dataset; null = nothing to compare with. */
  newestApprovedPublishedAt: string | null
  now: Date
}

export interface PolicyDecision {
  status: Extract<KnowledgeStatus, 'pending' | 'approved'>
  /** Why it was not approved (empty when approved). Machine-readable, stored in `structured.policy`. */
  reasons: string[]
}

export function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

export function decideStatus({ article, newestApprovedPublishedAt, now }: PolicyInput): PolicyDecision {
  const reasons: string[] = []
  if (!isOfficialSourceUrl(article.url)) reasons.push('host_not_allowlisted_or_not_https')
  if (!isCompleteArticle(article)) reasons.push('extraction_incomplete')
  if (article.publishedAt) {
    if (newestApprovedPublishedAt && article.publishedAt <= newestApprovedPublishedAt) reasons.push('not_newer_than_last_approved')
    // one day of slack for the time zone between the site (UTC+7) and the server
    if (article.publishedAt > new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)) reasons.push('date_in_future')
  }
  return reasons.length === 0 ? { status: 'approved', reasons } : { status: 'pending', reasons }
}

export { OFFICIAL_SOURCE_HOSTS }
