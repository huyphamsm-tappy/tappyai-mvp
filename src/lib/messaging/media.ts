import { createAdminClient } from '@/lib/supabase/admin'
import { randomMediaSuffix } from '@/lib/media/key'
import { imageExt, type SniffedImage } from '@/lib/security/imageType'

// ── Messenger images (migration 20261109_chat_media.sql) ─────────────────────────────────────────────────────────────────────────────────────────────
//
// WHERE THE PICTURES LIVE. A PRIVATE bucket of Supabase Storage, `chat-media`. No client key can read or write it (no storage policy exists): the server uploads
// with the service role after checking the session and the thread, and hands out SHORT-LIVED SIGNED LINKS, only for messages the caller can already read (row-level
// security on chat_messages is the access check, so a link is never made for a message in somebody else's conversation). The public media store the review photos
// use is NOT used: a URL there is readable by anyone who holds it, which is wrong for a private conversation.
//
// THE PATH IS "<thread>/<sender>/<file>" — the database CHECK on chat_messages demands exactly that, so a message can only reference an object under its own thread
// and its own sender's folder, even through a direct REST insert.

export const CHAT_MEDIA_BUCKET = 'chat-media'
/** The same ceiling as the bucket's file_size_limit (defined in mediaLimits.ts so the browser can use it without importing this server module). */
export { CHAT_MEDIA_MAX_BYTES } from './mediaLimits'
/** How long a signed link lives. A link is made on every read of a thread, so an expired one is replaced by reloading. */
export const CHAT_MEDIA_URL_TTL_SECONDS = 3600
/** What a chat accepts: the formats that can be re-encoded without their metadata. GIF is not one of them. */
export const CHAT_MEDIA_KINDS: readonly SniffedImage[] = ['jpeg', 'png', 'webp']

/** A new object path for this sender in this thread: unguessable (the shared random suffix), the extension of the REAL type. */
export function chatMediaPath(threadId: string, userId: string, kind: SniffedImage): string {
  return `${threadId}/${userId}/${Date.now()}-${randomMediaSuffix()}.${imageExt(kind)}`
}

const FILE_NAME = /^[A-Za-z0-9._-]{1,120}$/

/**
 * Is `path` an object this caller may attach to a message in THIS thread: exactly "<thread>/<caller>/<file>", the file a plain name (no folder, no "..", no query).
 * A string that is not a string is never one.
 */
export function isOwnChatMediaPath(path: unknown, threadId: string, userId: string): path is string {
  if (typeof path !== 'string') return false
  const prefix = `${threadId}/${userId}/`
  if (!path.startsWith(prefix)) return false
  const file = path.slice(prefix.length)
  return FILE_NAME.test(file) && file !== '.' && file !== '..' && !file.includes('..')
}

/**
 * Short-lived signed links for the given object paths, by path. An object that does not exist has NO entry (never a made-up link); a storage outage gives an empty
 * map — the message still shows, without its picture — rather than an exception that would fail the whole page of history.
 */
export async function signChatMedia(paths: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  const out = new Map<string, string>()
  if (unique.length === 0) return out
  try {
    const { data, error } = await createAdminClient().storage.from(CHAT_MEDIA_BUCKET).createSignedUrls(unique, CHAT_MEDIA_URL_TTL_SECONDS)
    if (error || !data) {
      console.error('[messaging] sign media:', error?.message ?? 'no data')
      return out
    }
    for (const e of data) if (e.path && e.signedUrl && !e.error) out.set(e.path, e.signedUrl)
  } catch (e) {
    console.error('[messaging] sign media threw:', e instanceof Error ? e.message : e)
  }
  return out
}
