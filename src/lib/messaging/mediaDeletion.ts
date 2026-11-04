import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAT_MEDIA_BUCKET } from './media'

/**
 * Removes a deleted account's pictures from the private chat-media bucket (called by the account-deletion job, src/lib/account/deletionJobs.ts).
 *
 * The account is already gone when the job runs, so chat_messages.sender_id is NULL on those rows (ON DELETE SET NULL): the pictures are found by the user id INSIDE the
 * path, "<thread>/<user>/<file>" (the database CHECK guarantees the folder is the sender's). Only that user's folder: the other person's pictures in the same conversations stay.
 *
 * A message whose picture was removed stays in the other person's history and shows the "photo unavailable" placeholder. Pictures uploaded but never attached to a message are
 * not found here (there is no row to find them by); a clean-up job for those is not written yet.
 *
 * Throws on any failure (a failed read, a failed removal): the job then stays queued and is retried, and never reports the files as gone.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = 1000
const REMOVE_CHUNK = 100

export function createChatMediaDeleter(db: SupabaseClient): { deleteForUser(userId: string): Promise<number> } {
  return {
    async deleteForUser(userId: string): Promise<number> {
      // 🚨 The id goes into a LIKE pattern: a value that is not exactly a uuid could match somebody else's pictures. Refused before any query.
      if (!UUID.test(userId)) throw new Error('chat media: not a user id')
      let removed = 0
      // Keyset paging by path: the rows KEEP their path after the object is removed (the CHECK needs a path on a picture-only message), so "read again from the start" would
      // return the same rows for ever. Each page starts after the last path of the previous one.
      let after = ''
      for (;;) {
        const { data, error } = await db
          .from('chat_messages')
          .select('media_path')
          .like('media_path', `%/${userId}/%`)
          .gt('media_path', after)
          .order('media_path', { ascending: true })
          .limit(PAGE)
        // 42703 = the picture column does not exist (migration 20261109 not applied yet): no picture can exist, so there is nothing to remove — and a job must not wedge on it.
        if (error?.code === '42703') return removed
        if (error) throw new Error('chat media: read failed')
        const paths = ((data ?? []) as Array<{ media_path: string | null }>).flatMap(r => (r.media_path ? [r.media_path] : []))
        if (paths.length === 0) return removed
        for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
          const chunk = paths.slice(i, i + REMOVE_CHUNK)
          const { data: gone, error: rmError } = await db.storage.from(CHAT_MEDIA_BUCKET).remove(chunk)
          if (rmError) throw new Error('chat media: removal failed')
          removed += gone?.length ?? 0
        }
        if (paths.length < PAGE) return removed
        after = paths[paths.length - 1]!
      }
    },
  }
}
