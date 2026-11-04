/**
 * This browser's own copy of the pictures it has shown (owner 04/11/2026: like Zalo, the device keeps its copy; the server keeps the picture for a limited time).
 *
 * A picture is copied into the browser's Cache Storage the first time its signed link is shown, keyed by the MESSAGE id (never by the link, which changes every hour). When the
 * server no longer has the picture (retention period over), the page asks for the copy instead. Everything here is best effort and silent: no Cache Storage, a blocked or full
 * store, a link the browser may not read (CORS), a non-image answer — each simply means "no copy", and the page falls back to its placeholder.
 *
 * Privacy: the copy lives only in this browser profile, under this site's origin, and is readable only through a message the page is already showing. It is cleared on sign-out
 * (clearPhotoCopies) so the next person on a shared computer inherits nothing.
 */

export const PHOTO_CACHE_NAME = 'tappy-chat-photos-v1'
/** Same ceiling as the upload limit (5 MB) plus a little: a larger answer is not one of our pictures. */
const MAX_COPY_BYTES = 6 * 1024 * 1024

type CacheStore = Pick<CacheStorage, 'open' | 'delete'>

function store(injected?: CacheStore): CacheStore | null {
  if (injected) return injected
  try {
    return typeof caches !== 'undefined' ? caches : null
  } catch {
    return null
  }
}

/** A Cache Storage key must be an http(s) URL: a path under this origin that no real route answers. */
function keyFor(messageId: string): string {
  let origin = 'http://localhost'
  try { if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') origin = location.origin } catch { /* keep the default */ }
  return `${origin}/__chat-photo/${encodeURIComponent(messageId)}`
}

export async function savePhotoCopy(messageId: string, url: string, deps: { caches?: CacheStore; fetchImpl?: typeof fetch } = {}): Promise<boolean> {
  const cs = store(deps.caches)
  if (!cs || !messageId || !/^https:\/\//i.test(url)) return false
  try {
    const cache = await cs.open(PHOTO_CACHE_NAME)
    const key = keyFor(messageId)
    if (await cache.match(key)) return true
    const res = await (deps.fetchImpl ?? fetch)(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return false
    const blob = await res.blob()
    if (!blob.type.startsWith('image/') || blob.size === 0 || blob.size > MAX_COPY_BYTES) return false
    await cache.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }))
    return true
  } catch {
    return false
  }
}

/** An object URL for the saved copy, or null. The caller revokes it (URL.revokeObjectURL) when it is done with it. */
export async function loadPhotoCopy(messageId: string, deps: { caches?: CacheStore } = {}): Promise<string | null> {
  const cs = store(deps.caches)
  if (!cs || !messageId) return null
  try {
    const cache = await cs.open(PHOTO_CACHE_NAME)
    const hit = await cache.match(keyFor(messageId))
    if (!hit) return null
    const blob = await hit.blob()
    return blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null
  } catch {
    return null
  }
}

export async function clearPhotoCopies(deps: { caches?: CacheStore } = {}): Promise<void> {
  const cs = store(deps.caches)
  if (!cs) return
  try { await cs.delete(PHOTO_CACHE_NAME) } catch { /* nothing to clear */ }
}
