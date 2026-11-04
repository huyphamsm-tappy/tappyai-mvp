import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAT_MEDIA_BUCKET } from './media'

/**
 * How long the server keeps a Messenger picture, and the job that enforces it (owner 04/11/2026: "coi Zalo làm thế nào chúng ta làm vậy").
 *
 * The server keeps a picture for CHAT_MEDIA_RETENTION_DAYS, then removes the object from the private bucket and stamps the message (media_expired_at). The message stays in the
 * history; its picture shows "expired" unless the device or browser that saw it still holds its own copy (src/lib/messaging/photoCache.ts). The same job also removes the
 * objects no message refers to (a picture uploaded and never sent) once they are ORPHAN_MIN_AGE_HOURS old. Neither list is derived from user input.
 *
 * Not verified: the exact period Zalo uses (no official figure found); 30 days is our choice and lives only here, so it can change without a migration.
 *
 * Failure rules: an object is removed BEFORE its message is stamped, so a failure in between is retried and never loses track of a file; any storage or read failure throws
 * (the cron answers 500 and the next run retries). A database that does not have migration 20261110 yet (42703 column / 42883 function) is "nothing to do", not an error.
 */
export const CHAT_MEDIA_RETENTION_DAYS = 30
export const ORPHAN_MIN_AGE_HOURS = 24

const BATCH = 200
const MAX_BATCHES = 5
const REMOVE_CHUNK = 100
const SCHEMA_ABSENT = new Set(['42703', '42883', 'PGRST202', 'PGRST204'])

export interface RetentionResult { expired: number; orphans: number }

async function removeObjects(db: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const { error } = await db.storage.from(CHAT_MEDIA_BUCKET).remove(paths.slice(i, i + REMOVE_CHUNK))
    if (error) throw new Error('chat media retention: removal failed')
  }
}

export async function runChatMediaRetention(db: SupabaseClient, now: Date = new Date()): Promise<RetentionResult> {
  const cutoff = new Date(now.getTime() - CHAT_MEDIA_RETENTION_DAYS * 86_400_000).toISOString()
  let expired = 0
  for (let b = 0; b < MAX_BATCHES; b++) {
    const { data, error } = await db
      .from('chat_messages')
      .select('id, media_path')
      .not('media_path', 'is', null)
      .is('media_expired_at', null)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(BATCH)
    if (error && SCHEMA_ABSENT.has((error as { code?: string }).code ?? '')) break
    if (error) throw new Error('chat media retention: read failed')
    const rows = ((data ?? []) as Array<{ id: string; media_path: string | null }>).filter(r => !!r.media_path)
    if (rows.length === 0) break
    await removeObjects(db, rows.map(r => r.media_path as string))
    const { error: markError } = await db.from('chat_messages').update({ media_expired_at: now.toISOString() }).in('id', rows.map(r => r.id))
    if (markError) throw new Error('chat media retention: stamp failed')
    expired += rows.length
    if (rows.length < BATCH) break
  }

  let orphans = 0
  for (let b = 0; b < MAX_BATCHES; b++) {
    const { data, error } = await db.rpc('chat_media_orphans', { p_older_than_hours: ORPHAN_MIN_AGE_HOURS, p_limit: BATCH })
    if (error && SCHEMA_ABSENT.has((error as { code?: string }).code ?? '')) break
    if (error) throw new Error('chat media retention: orphan list failed')
    const names = ((data ?? []) as Array<{ name: string | null }>).flatMap(r => (r.name ? [r.name] : []))
    if (names.length === 0) break
    await removeObjects(db, names)
    orphans += names.length
    if (names.length < BATCH) break
  }
  return { expired, orphans }
}
