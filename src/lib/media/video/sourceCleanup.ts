// Explore video, part 3: remove the original files that must not stay in the PRIVATE source bucket (the database function video_assets_due_for_source_cleanup says
// which: a deleted video, a failed upload, an abandoned upload; never a live video, never a file under a legal hold), then record each removal.
//
// Order per file: (abandoned only) mark the upload FAILED so the history says why; delete the object; ONLY THEN record the removal. A removal is never recorded for an
// object that is still there. A failure on one file is counted and the run goes on; the file is still due on the next run.
// Counts only, never keys: object keys carry the owner id.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MediaProvider } from '../types'
import { videoAssetStagingPrefix } from '../key'

export interface CleanupDeps {
  db: SupabaseClient
  /** A provider bound to the source bucket, or null when the bucket is not configured. */
  provider: MediaProvider | null
  /** The configured source bucket; rows recorded against another bucket are never touched. */
  bucket: string | null
  staleHours?: number
  limit?: number
  /** Stop starting new files after this instant (ms). */
  deadline?: number
  now?: () => number
}

export interface CleanupResult {
  skipped?: 'no_bucket' | 'not_installed'
  due: number
  removed: number
  failed: number
  /** Left for the next run on purpose (a hold appeared, the upload completed meanwhile). */
  deferred: number
  /** Rows recorded against a different bucket than the configured one. */
  mismatched: number
}

interface DueRow {
  id: string
  owner_id: string
  source_bucket: string | null
  source_object_key: string
  reason: 'deleted' | 'failed' | 'abandoned'
}

const ACTOR = 'service:video-cleanup'
export const DEFAULT_STALE_HOURS = 24
export const DEFAULT_LIMIT = 200

export async function runVideoSourceCleanup(deps: CleanupDeps): Promise<CleanupResult> {
  const result: CleanupResult = { due: 0, removed: 0, failed: 0, deferred: 0, mismatched: 0 }
  if (!deps.provider || !deps.bucket) return { ...result, skipped: 'no_bucket' }

  const now = deps.now ?? Date.now
  const deadline = deps.deadline ?? Number.POSITIVE_INFINITY

  const { data, error } = await deps.db.rpc('video_assets_due_for_source_cleanup', {
    p_stale_hours: deps.staleHours ?? DEFAULT_STALE_HOURS,
    p_limit: deps.limit ?? DEFAULT_LIMIT,
  })
  if (error) {
    // 42883 / PGRST202: the function does not exist yet (migration 20261112 not applied). Nothing to clean, and the cron must not fail every night.
    if (error.code === '42883' || error.code === 'PGRST202') return { ...result, skipped: 'not_installed' }
    throw new Error(`video source cleanup: list failed (${error.code ?? 'unknown'})`)
  }
  const rows = (data ?? []) as DueRow[]
  result.due = rows.length

  for (const row of rows) {
    if (now() >= deadline) break

    // Never delete a key in a bucket other than the one this row was recorded against.
    if (row.source_bucket !== deps.bucket) { result.mismatched++; continue }

    if (row.reason === 'abandoned') {
      const t = await deps.db.rpc('video_asset_transition', {
        p_asset: row.id, p_to: 'failed', p_event_type: 'upload_abandoned', p_actor: ACTOR, p_reason: 'no completion within the window', p_correlation: null, p_moderation_state: null,
      })
      if (t.error) {
        // 23514: the asset moved on (the upload completed after the list was read). Not ours to clean; try again next run if it is still due.
        if (t.error.code === '23514') result.deferred++
        else result.failed++
        continue
      }
    }

    if (!deps.provider.deleteObject || !deps.provider.listObjects) { result.failed++; continue }
    try {
      // true = deleted, false = already gone (404): both mean the file is not there any more.
      await deps.provider.deleteObject(row.source_object_key)
      // The transcoder output of this video (private staging) goes with it. Its folder is the video's own, never wider.
      for (const key of await deps.provider.listObjects(videoAssetStagingPrefix(row.owner_id, row.id))) await deps.provider.deleteObject(key)
    } catch {
      result.failed++
      continue
    }

    const rec = await deps.db.rpc('video_asset_source_removed', { p_asset: row.id, p_actor: ACTOR, p_reason: row.reason })
    if (rec.error) {
      // 55000: a legal hold was set after the list was read; the file is gone only if the hold came too late, so this is for a person to look at, not a retry loop.
      if (rec.error.code === '55000') result.deferred++
      else result.failed++
      continue
    }
    result.removed++
  }
  return result
}
