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

/**
 * 21/11/2026 (owner, after Zalo's "your storage is full" complaint): the copy on the device is a SMALL cache, not an archive. The server keeps every picture, so this browser keeps only the most
 * recent MAX_COPIES (about 300 pictures, tens of MB at the usual few hundred KB each); older ones are dropped and simply load again from the server when the conversation is opened.
 */
export const MAX_COPIES = 300

type CacheStore = Pick<CacheStorage, 'open' | 'delete'>

/** Drops the oldest copies beyond MAX_COPIES (Cache Storage lists keys oldest first). Silent: a failure here only means the cache stays a little larger. */
async function trimOldCopies(cache: Pick<Cache, 'keys' | 'delete'>): Promise<void> {
  try {
    const keys = await cache.keys()
    for (let i = 0; i < keys.length - MAX_COPIES; i++) await cache.delete(keys[i])
  } catch { /* best effort */ }
}

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
    await trimOldCopies(cache)
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
