import { KNOWLEDGE_DATASETS, isOfficialSourceUrl } from '../knowledge'
import type { KnowledgeVersionRow, KnowledgeVersionStore } from '../knowledge/versions'
import { contentHash, isCompleteArticle, isScamWarning, parseArticle, parseListing, type ParsedArticle } from './extract'
import { decideStatus, hostOf } from './policy'

// Scam Shield · weekly sync — the job. Pure orchestration over injected seams (fetch, store, clock, optional model), so every branch is
// testable without a network or a database. The route (src/app/api/cron/scam-shield-sync/route.ts) wires the real ones.

/**
 * What the crawler reads. Decided from the live sites (checked 18/11/2026 from this project's network):
 *   · bocongan.gov.vn  — WORKS: the category "Cảnh báo tội phạm" is server-rendered, newest first, with title / lead / date per card;
 *                        every article page carries the date and the body in plain <p>. This is the one source the crawler reads.
 *   · khonggianmang.vn — did not resolve (DNS) from here; not read until a stable listing is confirmed.
 *   · ncsc.gov.vn      — connection timed out from here; not read.
 *   · tinnhiemmang.vn  — reachable, but a SPA home page with no confirmed warnings listing; not read.
 * Adding a source = adding an entry here (its host must be in OFFICIAL_SOURCE_HOSTS) and a fixture + parser test for its page shapes.
 */
export const SYNC_SOURCES: ReadonlyArray<{ id: string; listingUrl: string; organization: string }> = [
  { id: 'bocongan-canh-bao-toi-pham', listingUrl: 'https://bocongan.gov.vn/chuyen-muc/canh-bao-toi-pham-1750063351', organization: 'Bộ Công an' },
]

export const SYNC_USER_AGENT = 'TappyAI/1.0 https://www.tappyai.com'
/** Hard ceiling on article pages read per run: one polite request each, spaced out. */
export const MAX_ARTICLES_PER_RUN = 6
export const PAUSE_BETWEEN_REQUESTS_MS = 700

export type PageResult = { ok: true; body: string; finalUrl: string } | { ok: false; reason: string }

export interface SyncDeps {
  store: KnowledgeVersionStore
  fetchPage: (url: string) => Promise<PageResult>
  now?: () => Date
  /** Optional model reading (SCAM_SHIELD_SYNC_AI). Absent = deterministic extraction only. */
  structure?: (article: ParsedArticle) => Promise<Record<string, unknown> | null>
  pause?: (ms: number) => Promise<void>
  sources?: typeof SYNC_SOURCES
  maxArticles?: number
}

export interface SyncReport {
  sources: Array<{ id: string; listingOk: boolean; listed: number; relevant: number }>
  inserted: Array<{ url: string; status: 'pending' | 'approved'; reasons: string[] }>
  unchanged: number
  skipped: Array<{ url: string; reason: string }>
  errors: string[]
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export async function runScamShieldSync(deps: SyncDeps): Promise<SyncReport> {
  const now = deps.now ?? (() => new Date())
  const pause = deps.pause ?? sleep
  const report: SyncReport = { sources: [], inserted: [], unchanged: 0, skipped: [], errors: [] }

  // The baseline for "newer than the last one": the newest approved row, or the static dataset's own date — whichever is later.
  let baseline: string | null = KNOWLEDGE_DATASETS[0].source.publishedAt ?? null
  try {
    const newest = (await deps.store.listApproved(1))[0]?.published_at ?? null
    if (newest && (!baseline || newest > baseline)) baseline = newest
  } catch {
    report.errors.push('store_unavailable') // migration not applied or database down: nothing can be stored, so do not crawl
    return report
  }

  for (const source of deps.sources ?? SYNC_SOURCES) {
    const entry = { id: source.id, listingOk: false, listed: 0, relevant: 0 }
    report.sources.push(entry)
    if (!isOfficialSourceUrl(source.listingUrl)) { report.errors.push(`${source.id}: listing_not_official`); continue }
    const listing = await deps.fetchPage(source.listingUrl)
    if (!listing.ok) { report.errors.push(`${source.id}: listing_${listing.reason}`); continue }
    if (!isOfficialSourceUrl(listing.finalUrl)) { report.errors.push(`${source.id}: listing_redirected_off_allowlist`); continue }
    entry.listingOk = true

    const items = parseListing(listing.body, listing.finalUrl)
    entry.listed = items.length
    const relevant = items.filter(isScamWarning).slice(0, deps.maxArticles ?? MAX_ARTICLES_PER_RUN)
    entry.relevant = relevant.length
    // Oldest first, so each approval moves the baseline forward and the next (newer) one is judged against it.
    relevant.sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))

    for (const item of relevant) {
      if (!isOfficialSourceUrl(item.url)) { report.skipped.push({ url: item.url, reason: 'not_official' }); continue }
      await pause(PAUSE_BETWEEN_REQUESTS_MS)
      const page = await deps.fetchPage(item.url)
      if (!page.ok) { report.skipped.push({ url: item.url, reason: `fetch_${page.reason}` }); continue }
      if (!isOfficialSourceUrl(page.finalUrl)) { report.skipped.push({ url: item.url, reason: 'redirected_off_allowlist' }); continue }

      const article = parseArticle(page.body, page.finalUrl)
      // The listing's date is a fallback for an article page that does not print one.
      if (!article.publishedAt && item.publishedAt) article.publishedAt = item.publishedAt
      const hash = contentHash(article)
      try {
        if (await deps.store.hasHash(hash)) {
          await deps.store.touchVerified(hash, now().toISOString())
          report.unchanged++
          continue
        }
        const decision = decideStatus({ article, newestApprovedPublishedAt: baseline, now: now() })
        const ai = deps.structure && isCompleteArticle(article) ? await deps.structure(article) : null
        const stamp = now().toISOString()
        const row: KnowledgeVersionRow = {
          source_url: article.url,
          host: hostOf(article.url) ?? '',
          title: article.title,
          published_at: article.publishedAt,
          fetched_at: stamp,
          verified_at: decision.status === 'approved' ? stamp : null,
          content_hash: hash,
          status: decision.status,
          body: article.paragraphs.join('\n\n'),
          structured: { policy: { reasons: decision.reasons }, ...(article.author ? { author: article.author } : {}), ...(article.lead ? { lead: article.lead } : {}), ...(ai ? { ai } : {}) },
        }
        if (await deps.store.insert(row)) {
          report.inserted.push({ url: article.url, status: decision.status, reasons: decision.reasons })
          if (decision.status === 'approved' && article.publishedAt) baseline = article.publishedAt
        }
      } catch {
        report.errors.push(`store_write_failed: ${item.url}`)
      }
    }
  }
  return report
}
