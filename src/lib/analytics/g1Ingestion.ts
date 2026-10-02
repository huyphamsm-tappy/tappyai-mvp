// ─────────────────────────────────────────────────────────────────────────────
// G1 ingestion side effects — what `POST /api/track` does BESIDES storing rows.
//
//   1. anon_id → user_id stitching (Analytics §8D). An AUTHENTICATED event that
//      still carries the browser's anon_id is the moment the two identities are
//      provably the same person: user_id came from the verified session, anon_id
//      from the envelope. One idempotent upsert per (anon_id, user_id) pair.
//      Historical anonymous events are never rewritten; funnels JOIN through
//      this map instead.
//
//   2. Raw counters on shared_results for `share_viewed` and follow-up `query`
//      events. Raw means raw: the unique-viewer number is computed from
//      user_events (distinct anon_id), never from these columns.
//
// Both are best-effort. A failure here is logged and never fails the request.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { isAnonId } from './anonId'
import { isValidSlug } from '@/lib/share/slug'

export interface IngestedEventRow {
  event_type: string
  user_id: string | null
  anon_id: string | null
  metadata: Record<string, unknown> | null
}

/** Pure: which (anon_id, user_id) pairs a batch proves. Deduplicated. */
export function identityLinksFrom(rows: IngestedEventRow[]): Array<{ anon_id: string; user_id: string }> {
  const seen = new Set<string>()
  const out: Array<{ anon_id: string; user_id: string }> = []
  for (const r of rows) {
    if (!r.user_id || !isAnonId(r.anon_id)) continue
    const key = `${r.anon_id}:${r.user_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ anon_id: r.anon_id, user_id: r.user_id })
  }
  return out
}

/** Pure: counter bumps a batch implies, aggregated per slug and kind. */
export function counterBumpsFrom(rows: IngestedEventRow[]): Array<{ slug: string; kind: 'view' | 'ask'; by: number }> {
  const acc = new Map<string, { slug: string; kind: 'view' | 'ask'; by: number }>()
  for (const r of rows) {
    const slug = r.metadata?.slug
    if (r.event_type === 'share_viewed' && isValidSlug(slug)) {
      const k = `view:${slug}`
      acc.set(k, { slug, kind: 'view', by: (acc.get(k)?.by ?? 0) + 1 })
    }
  }
  return [...acc.values()]
}

export async function applyG1SideEffects(admin: SupabaseClient, rows: IngestedEventRow[]): Promise<void> {
  const links = identityLinksFrom(rows)
  if (links.length) {
    const { error } = await admin.from('anon_identity_map').upsert(links, { onConflict: 'anon_id,user_id', ignoreDuplicates: true })
    if (error) console.error('[track/g1] identity stitch failed:', error.code)
  }
  for (const b of counterBumpsFrom(rows)) {
    const { error } = await admin.rpc('fn_shared_result_bump', { p_slug: b.slug, p_kind: b.kind, p_by: b.by })
    if (error) console.error('[track/g1] counter bump failed:', error.code)
  }
}
