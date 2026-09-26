// SERVER-ONLY: imports the service-role client. Never import from a client component
// (same rule as `@/lib/supabase/admin`).

// ─────────────────────────────────────────────────────────────────────────────
// shared_results data access — the ONLY module that touches the table.
//
// Service-role client, on purpose (see the migration header): every write is
// preceded by sanitization + validation here, and every public read projects
// the PUBLIC columns only. `owner_id` never leaves this file except on the
// owner's own "my shares" listing.
//
// Cost shape: one INSERT per share; one indexed SELECT per uncached public
// view (the page is ISR-cached, so most views are zero DB reads); one UPDATE
// per counter bump. No LLM, no external API.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { isValidSlug, newSlug } from './slug'
import {
  PUBLIC_SHARED_RESULT_COLUMNS,
  validateSharedResultPayload,
  type PublicSharedResult,
  type PublicSharedResultSummary,
  type SharedResultPayload,
} from './sharedResult'
export type { PublicSharedResultSummary } from './sharedResult'

export class SharedResultError extends Error {
  constructor(public readonly code: 'invalid_payload' | 'slug_collision' | 'db_error', message?: string) {
    super(message ?? code)
  }
}

export interface CreateSharedResultInput {
  ownerId: string | null
  payload: SharedResultPayload
  /** True when the owner is a Supabase anonymous session → page is noindex + unlisted. */
  ownerIsAnonymous?: boolean
  /** The share this one was made from (second-generation sharing). */
  parentId?: string | null
}

/**
 * Persist a sanitized payload. Validates again at the boundary — the caller is
 * expected to have sanitized, but the store is the last line, and it refuses
 * anything the validator rejects rather than trusting the route.
 */
export async function createSharedResult(input: CreateSharedResultInput): Promise<PublicSharedResult> {
  const reason = validateSharedResultPayload(input.payload)
  if (reason) throw new SharedResultError('invalid_payload', reason)

  const admin = createAdminClient()
  // Slug collisions are astronomically unlikely (62^10) but cheap to retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = newSlug()
    const { data, error } = await admin
      .from('shared_results')
      .insert({
        slug,
        owner_id: input.ownerId,
        query: input.payload.query,
        payload: input.payload,
        domain: input.payload.domain,
        locale: input.payload.locale,
        owner_is_anonymous: input.ownerIsAnonymous === true,
        parent_id: input.parentId ?? null,
      })
      .select(PUBLIC_SHARED_RESULT_COLUMNS)
      .single()
    if (!error && data) return data as unknown as PublicSharedResult
    if (error?.code === '23505') continue // unique_violation on slug — retry
    throw new SharedResultError('db_error', error?.message)
  }
  throw new SharedResultError('slug_collision')
}

/** A public row by slug, or null for missing / invalid / withdrawn. Projects public columns only. */
export async function getPublicSharedResult(slug: string): Promise<PublicSharedResult | null> {
  if (!isValidSlug(slug)) return null
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return null } // no credentials (build/preview): a public miss, never a crash
  const { data, error } = await admin
    .from('shared_results')
    .select(PUBLIC_SHARED_RESULT_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'public')
    .maybeSingle()
  if (error || !data) return null
  // Defensive: a row whose payload no longer validates is not rendered. This
  // guards against a future schema drift ever exposing something unvetted.
  if (validateSharedResultPayload((data as { payload: unknown }).payload)) return null
  return data as unknown as PublicSharedResult
}

/**
 * Newest LISTED public results, optionally per domain — for hubs and the sitemap.
 * Anonymous-owned pages are public but never listed (see the ancestry migration).
 */
export async function listPublicSharedResults(opts: { domain?: string; limit?: number; offset?: number } = {}): Promise<PublicSharedResultSummary[]> {
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return [] } // hubs and the sitemap still render their static content
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 2000)
  let q = admin
    .from('shared_results')
    .select('slug, query, domain, locale, created_at, payload->title, payload->images')
    .eq('status', 'public')
    .eq('owner_is_anonymous', false)
    .order('created_at', { ascending: false })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + limit - 1)
  if (opts.domain) q = q.eq('domain', opts.domain)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Array<Record<string, unknown>>).map(r => ({
    slug: String(r.slug),
    title: typeof r.title === 'string' ? r.title : String(r.query),
    query: String(r.query),
    domain: String(r.domain),
    locale: String(r.locale),
    created_at: String(r.created_at),
    image: Array.isArray(r.images) && typeof r.images[0] === 'string' ? (r.images[0] as string) : null,
  }))
}

/** The owner withdraws a share. Row stays (attribution history), page 404s, sitemap drops it. */
export async function withdrawSharedResult(slug: string, ownerId: string): Promise<boolean> {
  if (!isValidSlug(slug)) return false
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('shared_results')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .eq('owner_id', ownerId)
    .select('slug')
  return !error && !!data && data.length > 0
}

/** Raw counters. Deduplicated (unique) numbers come from user_events, not from here. */
export async function bumpSharedResultCounter(slug: string, kind: 'view' | 'ask', by = 1): Promise<void> {
  if (!isValidSlug(slug)) return
  const admin = createAdminClient()
  const { error } = await admin.rpc('fn_shared_result_bump', { p_slug: slug, p_kind: kind, p_by: by })
  if (error) console.error('[shared-results] bump failed:', error.code, error.message)
}
