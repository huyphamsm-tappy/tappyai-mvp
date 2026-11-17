import { KNOWLEDGE_DATASETS, isOfficialSourceUrl } from './index'
import type { KnowledgeVersionRow, KnowledgeVersionStore } from './versions'

// Scam Shield · official knowledge — freshness and the newest official warnings (weekly sync), with a static fail-open fallback.
//
// The 25 scenarios and their phrase lists are a reviewed static file (the matcher reads them synchronously and never waits for anything).
// What the weekly sync adds is a table of OFFICIAL pages (scam_knowledge_versions). The reader below serves the latest APPROVED rows first —
// the "last updated" date, the source link and the newest warnings — and falls back to the static dataset when the table is empty, the
// migration is not applied, the database errors or is slow. It never throws and never blocks a request longer than KNOWLEDGE_DB_TIMEOUT_MS,
// and a result is cached for a few minutes (a failure for one minute, so a database outage is not hammered).
//
// No server import here: the database client lives in ./versionStore.ts (server-only); this file takes a store as a parameter, so it is safe
// in the browser bundle and trivially testable.

export interface RecentWarning {
  title: string
  url: string
  /** ISO date (YYYY-MM-DD) or null. */
  publishedAt: string | null
  /** Optional structured fields written beside the official text (SCAM_SHIELD_SYNC_AI). Never a replacement for the official text. */
  structured?: Record<string, unknown>
}

export interface KnowledgeMeta {
  /** ISO date the knowledge was last checked against the official source. */
  verifiedAt: string
  /** The official page to cite for that date. */
  sourceUrl: string
  sourceTitle: string
  organization: string
  origin: 'database' | 'static'
  /** Newest approved official warnings (at most RECENT_LIMIT). Empty on the static fallback. */
  recent: RecentWarning[]
}

export const RECENT_LIMIT = 3
export const KNOWLEDGE_CACHE_MS = 5 * 60_000
export const KNOWLEDGE_FAILURE_CACHE_MS = 60_000
export const KNOWLEDGE_DB_TIMEOUT_MS = 1_500

/** The static fallback — what the module served before the sync existed. */
export function staticKnowledgeMeta(): KnowledgeMeta {
  const s = KNOWLEDGE_DATASETS[0].source
  return { verifiedAt: s.verifiedAt, sourceUrl: s.url, sourceTitle: s.title, organization: s.organization, origin: 'static', recent: [] }
}

let injectedStore: KnowledgeVersionStore | null = null
let cache: { store: KnowledgeVersionStore; at: number; ttl: number; meta: KnowledgeMeta } | null = null

/** Test seam: the store used when `getKnowledgeMeta` is called without one. null restores "no store" (= the static file). */
export function __setKnowledgeStore(store: KnowledgeVersionStore | null): void { injectedStore = store; cache = null }
export function __resetKnowledgeCache(): void { cache = null }

const isoDay = (s: string | null | undefined): string | null => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null)

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('knowledge_store_timeout')), ms) })])
  } finally { if (timer) clearTimeout(timer) }
}

function structuredOf(r: KnowledgeVersionRow): Record<string, unknown> | undefined {
  if (!r.structured) return undefined
  const { policy: _policy, ...rest } = r.structured
  return Object.keys(rest).length > 0 ? rest : undefined
}

function metaFromRows(rows: KnowledgeVersionRow[]): KnowledgeMeta {
  const fallback = staticKnowledgeMeta()
  // Defence in depth: only approved rows on an official https host are served, whatever the table holds.
  const ok = rows.filter(r => r.status === 'approved' && isOfficialSourceUrl(r.source_url) && !!r.title)
  if (ok.length === 0) return fallback
  const byNewest = [...ok].sort((a, b) => (isoDay(b.published_at) ?? '').localeCompare(isoDay(a.published_at) ?? ''))
  const verified = ok.map(r => isoDay(r.verified_at) ?? isoDay(r.fetched_at)).filter((d): d is string => !!d).sort().pop()
  return {
    verifiedAt: verified && verified > fallback.verifiedAt ? verified : fallback.verifiedAt,
    sourceUrl: byNewest[0].source_url,
    sourceTitle: byNewest[0].title,
    organization: fallback.organization,
    origin: 'database',
    recent: byNewest.slice(0, RECENT_LIMIT).map(r => {
      const structured = structuredOf(r)
      return { title: r.title, url: r.source_url, publishedAt: isoDay(r.published_at), ...(structured ? { structured } : {}) }
    }),
  }
}

/** The knowledge's freshness and newest official warnings. Never throws; falls back to the static dataset. */
export async function getKnowledgeMeta(opts: { store?: KnowledgeVersionStore | null; now?: number; timeoutMs?: number } = {}): Promise<KnowledgeMeta> {
  const store = opts.store === undefined ? injectedStore : opts.store
  if (!store) return staticKnowledgeMeta()
  const now = opts.now ?? Date.now()
  if (cache && cache.store === store && now - cache.at < cache.ttl) return cache.meta
  try {
    const rows = await withTimeout(store.listApproved(10), opts.timeoutMs ?? KNOWLEDGE_DB_TIMEOUT_MS)
    const meta = metaFromRows(rows)
    cache = { store, at: now, ttl: KNOWLEDGE_CACHE_MS, meta }
    return meta
  } catch {
    const meta = staticKnowledgeMeta()
    cache = { store, at: now, ttl: KNOWLEDGE_FAILURE_CACHE_MS, meta }
    return meta
  }
}

/** ISO YYYY-MM-DD → dd/mm/yyyy (the same in both languages). Anything else is returned as given. */
export function formatKnowledgeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
