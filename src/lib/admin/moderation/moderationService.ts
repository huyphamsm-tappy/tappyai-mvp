import type { SupabaseClient } from '@supabase/supabase-js'

// Module 09 Content Moderation — the read shape and the queue's ordering.
//
// CONTRACT
//   04 §4.4 / §4.5   the tables
//   12_RBAC §3       who may do what
//   ADR-026          Owner Decision B — reporter provenance
//
// This module owns no authorization. The routes call `requirePermission`; this
// file never sees an actor. A second place deciding who may read the queue
// would be a second authorization path.
//
// 🔑 ADR-026 I-5 IS ENFORCED BY THE PROJECTION, NOT BY REMEMBERING.
//
// `moderation_queue.metadata` carries `reporter_source_id` — opaque, but still
// a provenance handle that ADR-026 keeps inside the service tier. So the
// SELECT below names its columns and `metadata` is NOT among them. A caller
// cannot receive what was never read.
//
// What a moderator legitimately needs from the provenance is not the id but
// the COUNT of distinct sources — five reports from one person are not five
// people, which is what `content_reports`' UNIQUE constraint exists to say.
// That number is derived server-side by `distinctSourceCount` and only the
// number leaves.

/** The columns a queue item may expose. `metadata` is deliberately absent. */
const QUEUE_COLUMNS =
  'id, type, status, priority, reported_by, target_type, target_id, reason, assigned_to, resolved_by, resolution, created_at, updated_at, resolved_at'

export interface QueueItem {
  id: string
  type: 'review_report' | 'comment_report' | 'user_report' | 'music_report' | 'ai_flag'
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed'
  priority: number
  reported_by: string | null
  target_type: string
  target_id: string
  reason: string | null
  assigned_to: string | null
  resolved_by: string | null
  resolution: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export type QueueStatus = QueueItem['status']

export interface QueueResult {
  status: 'ok' | 'empty' | 'error'
  items: QueueItem[]
}

/** §4.4's `idx_modq_status`: urgent first, then oldest first. */
export const QUEUE_PAGE_SIZE = 50

/**
 * Read the queue. Never throws — a moderation surface that 500s because one
 * table is unreachable is worse than one that says so.
 */
export async function listQueue(
  admin: SupabaseClient,
  filter: { status?: QueueStatus } = {}
): Promise<QueueResult> {
  try {
    let q = admin
      .from('moderation_queue')
      .select(QUEUE_COLUMNS)
      // The worklist order, matching the index the migration creates.
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(QUEUE_PAGE_SIZE)

    if (filter.status) q = q.eq('status', filter.status)

    const { data, error } = await q
    if (error) {
      console.error('[admin][moderation] queue read failed:', error.message)
      return { status: 'error', items: [] }
    }
    const items = (data ?? []) as QueueItem[]
    return { status: items.length === 0 ? 'empty' : 'ok', items }
  } catch (e) {
    console.error('[admin][moderation] queue read threw:', e instanceof Error ? e.message : e)
    return { status: 'error', items: [] }
  }
}

/**
 * How many DISTINCT sources reported this target.
 *
 * ADR-026: the opaque provenance id never leaves the server, but the number of
 * distinct sources does — it is the difference between "five people complained"
 * and "one person complained five times", and a moderator needs it to weigh a
 * report at all.
 *
 * Returns `null` when it cannot be computed, never 0: an unreadable count and
 * a genuine single source are different facts.
 */
export async function distinctSourceCount(
  admin: SupabaseClient,
  targetType: string,
  targetId: string
): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from('moderation_queue')
      .select('metadata')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .limit(QUEUE_PAGE_SIZE)

    if (error) {
      console.error('[admin][moderation] source count failed:', error.message)
      return null
    }
    const rows = (data ?? []) as { metadata: Record<string, unknown> | null }[]
    const sources = new Set<string>()
    for (const r of rows) {
      // A music report has a real `reported_by` and no provenance id; a
      // content-safety report has the reverse. Both are one source each.
      const s = r.metadata?.['reporter_source_id']
      if (typeof s === 'string' && s.length > 0) sources.add(s)
      else sources.add(`row:${JSON.stringify(r.metadata?.['source_id'] ?? '')}`)
    }
    return sources.size
  } catch (e) {
    console.error('[admin][moderation] source count threw:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Every terminal state a queue item can be moved to, and what each means. */
export type Resolution =
  | { kind: 'dismiss'; reason: string }
  | { kind: 'hide'; reason: string }
  | { kind: 'restore'; reason: string }
  | { kind: 'delete'; reason: string }

/**
 * The queue status a resolution produces.
 *
 * `dismiss` closes the item as no violation; every other outcome is a real
 * moderation decision and lands on `resolved`. §4.4's enum offers exactly
 * these two terminal values.
 */
export function statusFor(kind: Resolution['kind']): QueueStatus {
  return kind === 'dismiss' ? 'dismissed' : 'resolved'
}

/** The §4.5 action a resolution records. */
export function actionFor(kind: Resolution['kind']): string {
  switch (kind) {
    case 'dismiss': return 'dismiss_report'
    case 'hide': return 'hide_content'
    case 'restore': return 'restore_content'
    case 'delete': return 'delete_content'
  }
}

/**
 * The Content Safety Gate's own publication state for a hide/restore.
 *
 * `RESTRICTED` is the gate's mechanism (`20260817_content_safety_gate.sql`),
 * server-controlled and never accepted from a client. Module 09 sets it rather
 * than inventing a parallel `is_hidden` path — two ways to hide a review is one
 * way too many.
 */
export function publicationStateFor(kind: 'hide' | 'restore'): 'RESTRICTED' | 'PUBLISHED' {
  return kind === 'hide' ? 'RESTRICTED' : 'PUBLISHED'
}
