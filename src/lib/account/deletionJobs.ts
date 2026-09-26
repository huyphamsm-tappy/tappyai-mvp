// F-096 · the part of account deletion the database cannot do by itself.
//
// Deleting the Auth user cascades every per-user row (F-093, F-096 migrations), and a BEFORE
// DELETE trigger on auth.users queues one `account_deletion_jobs` row per deleted account — also
// when the operator deletes from the Supabase dashboard. This worker drains that queue:
//
//   1. revoke the Google Calendar grant at Google (the token was captured by the trigger, because
//      the user_integrations row is gone with the account);
//   2. delete every uploaded file under the user's prefixes, and the avatars of groups they
//      created, from the public bucket;
//   3. LIST AGAIN and require nothing left before the job counts as done.
//
// A job that fails stays pending and is retried on the next run, up to `maxAttempts`. Tokens and
// object names are never logged: object names carry the user id.

import type { SupabaseClient } from '@supabase/supabase-js'
import { accountMediaPrefixes } from '@/lib/media/key'

export interface DeletionMedia {
  listObjects(prefix: string): Promise<string[]>
  deleteObject(key: string): Promise<boolean>
}

export interface DeletionDeps {
  db: SupabaseClient
  media: DeletionMedia
  /** true = revoked or already invalid at Google; false = try again later. */
  revoke: (token: string) => Promise<boolean>
  limit?: number
  maxAttempts?: number
  /**
   * Process only this user's job. A run pointed at a bucket other than the production one (the
   * audit proof) must never mark somebody else's job done — their files are not in that bucket.
   */
  userId?: string
}

export interface DeletionRunResult {
  processed: number
  completed: number
  failed: number
  objectsDeleted: number
  tokensRevoked: number
}

interface JobRow {
  id: string
  user_id: string
  group_ids: string[] | null
  google_tokens: string[] | null
  attempts: number
  media_deleted: number | null
}

export const DEFAULT_MAX_ATTEMPTS = 10

export async function processAccountDeletionJobs(deps: DeletionDeps): Promise<DeletionRunResult> {
  const limit = deps.limit ?? 20
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const result: DeletionRunResult = { processed: 0, completed: 0, failed: 0, objectsDeleted: 0, tokensRevoked: 0 }

  let query = deps.db
    .from('account_deletion_jobs')
    .select('id, user_id, group_ids, google_tokens, attempts, media_deleted')
    .is('done_at', null)
    .lt('attempts', maxAttempts)
  if (deps.userId) query = query.eq('user_id', deps.userId)
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`account_deletion_jobs read failed (${error.code ?? 'unknown'})`)

  for (const job of (data ?? []) as JobRow[]) {
    result.processed++
    let deleted = 0
    // Revoke first, and completely: whatever happens to the files, a revoked token is dropped
    // from the row and a failed one stays for the next run.
    const pendingTokens: string[] = []
    for (const token of job.google_tokens ?? []) {
      let ok = false
      try { ok = await deps.revoke(token) } catch { ok = false }
      if (ok) result.tokensRevoked++
      else pendingTokens.push(token)
    }
    try {
      // Throws on a malformed user or group id — a job can never widen into a bucket-wide listing.
      const prefixes = accountMediaPrefixes(job.user_id, job.group_ids ?? [])
      for (const prefix of prefixes) {
        for (const key of await deps.media.listObjects(prefix)) {
          if (await deps.media.deleteObject(key)) deleted++
        }
      }
      for (const prefix of prefixes) {
        if ((await deps.media.listObjects(prefix)).length > 0) throw new Error('objects remain after deletion')
      }
      result.objectsDeleted += deleted

      const done = pendingTokens.length === 0
      await deps.db.from('account_deletion_jobs').update({
        attempts: job.attempts + 1,
        google_tokens: pendingTokens,
        media_deleted: (job.media_deleted ?? 0) + deleted,
        last_error: done ? null : 'google revoke did not complete',
        done_at: done ? new Date().toISOString() : null,
      }).eq('id', job.id)
      if (done) result.completed++
      else result.failed++
    } catch (e) {
      result.failed++
      result.objectsDeleted += deleted
      // The message is ours or a MediaStorageError's: status codes only, no token, no object name.
      const message = e instanceof Error ? e.message.slice(0, 200) : 'unknown error'
      await deps.db.from('account_deletion_jobs').update({
        attempts: job.attempts + 1,
        google_tokens: pendingTokens,
        media_deleted: (job.media_deleted ?? 0) + deleted,
        last_error: message,
      }).eq('id', job.id)
    }
  }
  return result
}
