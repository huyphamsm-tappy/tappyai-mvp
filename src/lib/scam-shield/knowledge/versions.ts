// Scam Shield · official knowledge versions — the shape of a stored row and the store seam. Types only: no server import, so the
// client-facing knowledge/index.ts can use it without pulling the database client into the browser bundle.
//
// A row is one OFFICIAL page as the weekly sync read it (supabase/migrations/20261201_scam_knowledge_versions.sql). `body` is the official
// text, verbatim. `structured` is optional and only ever added BESIDE it (SCAM_SHIELD_SYNC_AI); the checker keeps citing `source_url`.

export type KnowledgeVersionStatus = 'pending' | 'approved' | 'rejected'

export interface KnowledgeVersionRow {
  /** Assigned by the database (identity); absent on insert. */
  version?: number
  source_url: string
  host: string
  title: string
  /** ISO date (YYYY-MM-DD). */
  published_at: string | null
  /** ISO timestamps. */
  fetched_at: string
  verified_at: string | null
  content_hash: string
  status: KnowledgeVersionStatus
  body: string
  structured: Record<string, unknown> | null
  created_at?: string
}

export interface KnowledgeVersionStore {
  /** The approved rows, newest published first. Used by the reader (fail-open) and by the sync (baseline date). */
  listApproved(limit: number): Promise<KnowledgeVersionRow[]>
  /** Does any row (any status) carry this content hash? A page whose hash did not change is skipped. */
  hasHash(contentHash: string): Promise<boolean>
  /** Stores a new row; a duplicate content hash is a no-op (returns false). */
  insert(row: KnowledgeVersionRow): Promise<boolean>
  /** The page was fetched again and is unchanged: the approved row for this hash is re-verified now. */
  touchVerified(contentHash: string, at: string): Promise<void>
}
