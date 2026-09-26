// Cache lifetime for client-direct uploads.
//
// THE PROBLEM THIS FIXES: the resumable-init POST used to send `body: '{}'` — no object metadata
// at all — so every uploaded object inherited Cloud Storage's DEFAULT `Cache-Control: public,
// max-age=3600`. Measured on a real production object (a 43.6MB review clip): one hour after a
// viewer first watched it, their browser re-downloaded all 45,683,721 bytes from GCS. Egress is
// the cost line that matters here, and it was being paid again every hour, per viewer, per clip.
//
// WHY A LONG LIFETIME IS SAFE FOR CORRECTNESS HERE (now one day — see below), and would not be in general: these objects are immutable
// by CONSTRUCTION, not by convention. `resolveUploadTarget` builds every key as
// `${prefix}/${ownerId}/${randomMediaSuffix(24)}.${ext}` — 24 random characters minted server-side
// per upload. A caller cannot choose a key, cannot reuse one, and cannot overwrite an existing
// object, because it never learns another object's name and the key it does get is fresh. So a
// URL's bytes can never change, which is exactly the precondition `immutable` asserts. Nothing
// needs cache invalidation, because nothing is ever invalidated — a new upload is a new URL.
//
// The corollary is what keeps this honest: if key generation ever becomes caller-influenced or
// deterministic, this cache policy turns into a correctness bug for the whole lifetime. The
// last describe block ties the two together so they cannot drift apart silently.
//
// ONE DAY, NOT ONE YEAR (owner decision 2026-09-26): the lifetime also bounds how long a cached copy
// can outlive a DELETION (F-096, account deletion removes the file). A year-long max-age made that
// promise unenforceable for clips; a day bounds it while still avoiding the hourly re-download.

import { describe, it, expect, vi } from 'vitest'
import { createGcsProvider } from './providers/gcs'
import { IMMUTABLE_MEDIA_CACHE_CONTROL } from './providers/gcs'
import { resolveUploadTarget } from './uploadPolicy'

const BUCKET = 'tappyai-media-prod'
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const SESSION_URI =
  'https://storage.googleapis.com/upload/storage/v1/b/tappyai-media-prod/o?uploadType=resumable&upload_id=ABC123'

function mockSession() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return {
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'location' ? SESSION_URI : null) },
    } as unknown as Response
  }) as unknown as typeof fetch
  const provider = createGcsProvider({ bucket: BUCKET, getAccessToken: async () => 'ya29.test', fetchImpl })
  return { provider, calls }
}

const openSession = async (contentType = 'video/mp4') => {
  const { provider, calls } = mockSession()
  await provider.createUploadSession!({
    key: `videos/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`,
    contentType,
    sizeBytes: 45_683_721,
  })
  return JSON.parse(String(calls[0].init.body)) as Record<string, unknown>
}

describe('the cache policy constant', () => {
  it('is one day, private and marked immutable', () => {
    expect(IMMUTABLE_MEDIA_CACHE_CONTROL).toBe('private, max-age=86400, immutable')
  })

  it('is a day in seconds, not a transcription slip', () => {
    const seconds = Number(/max-age=(\d+)/.exec(IMMUTABLE_MEDIA_CACHE_CONTROL)![1])
    expect(seconds).toBe(24 * 60 * 60)
  })

  it('🚨 never longer than a day — a deletion must take effect within it (F-096)', () => {
    const seconds = Number(/max-age=(\d+)/.exec(IMMUTABLE_MEDIA_CACHE_CONTROL)![1])
    expect(seconds).toBeLessThanOrEqual(86400)
  })

  // F-100 (owner 2026-09-26): a deleted PUBLIC object kept serving from Google's shared edge cache
  // until max-age (measured) and built-in caching cannot be invalidated. `private` keeps shared caches
  // out, so deletion is immediate at Google; the viewer's own browser may still keep it ≤ one day.
  it('🚨 is private — no shared cache (Google edge, CDN) may store a clip', () => {
    expect(IMMUTABLE_MEDIA_CACHE_CONTROL).toMatch(/\bprivate\b/)
    expect(IMMUTABLE_MEDIA_CACHE_CONTROL).not.toMatch(/\bpublic\b|\bs-maxage\b/)
  })

  it('still lets the viewer’s browser cache it (no no-store / no-cache)', () => {
    expect(IMMUTABLE_MEDIA_CACHE_CONTROL).not.toMatch(/\bno-store\b|\bno-cache\b/)
  })
})

describe('the resumable session declares the cache policy', () => {
  it('sends it as object metadata rather than leaving GCS to default to an hour', async () => {
    const body = await openSession()
    expect(body.cacheControl).toBe(IMMUTABLE_MEDIA_CACHE_CONTROL)
  })

  it('no longer sends an empty metadata body', async () => {
    const { provider, calls } = mockSession()
    await provider.createUploadSession!({
      key: `videos/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`,
      contentType: 'video/mp4',
      sizeBytes: 1024,
    })
    expect(String(calls[0].init.body)).not.toBe('{}')
  })

  it('applies to thumbnails too — they are minted the same immutable way', async () => {
    const body = await openSession('image/jpeg')
    expect(body.cacheControl).toBe(IMMUTABLE_MEDIA_CACHE_CONTROL)
  })

  it('does not let the metadata body name the object — the key stays in the query string', async () => {
    const body = await openSession()
    expect(body.name).toBeUndefined()
  })
})

describe('the session binding is unchanged', () => {
  // These already passed before the cache change. They are here because the change edits the very
  // request that carries them, and a broken binding would let a PUT of the wrong size or type land.
  it('still declares content type and length, and still authorizes', async () => {
    const { provider, calls } = mockSession()
    await provider.createUploadSession!({
      key: `videos/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`,
      contentType: 'video/mp4',
      sizeBytes: 4096,
    })
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-Upload-Content-Type']).toBe('video/mp4')
    expect(headers['X-Upload-Content-Length']).toBe('4096')
    expect(headers['Content-Type']).toBe('application/json; charset=UTF-8')
    expect(headers.Authorization).toBe('Bearer ya29.test')
    expect(calls[0].url).toContain('uploadType=resumable')
  })
})

describe('what makes the long lifetime safe', () => {
  // If this block ever fails, IMMUTABLE_MEDIA_CACHE_CONTROL has become unsafe — a mutable or
  // guessable key means a cached URL could later point at different bytes, for the whole max-age.
  it('mints a fresh random key per upload, so no URL is ever reused', () => {
    const a = resolveUploadTarget({ kind: 'video', contentType: 'video/mp4', sizeBytes: 10, ownerId: OWNER }, ['video'])
    const b = resolveUploadTarget({ kind: 'video', contentType: 'video/mp4', sizeBytes: 10, ownerId: OWNER }, ['video'])
    expect(a.key).not.toBe(b.key)
  })

  it('takes nothing from the caller into the object name', () => {
    const t = resolveUploadTarget(
      { kind: 'video', contentType: 'video/mp4', sizeBytes: 10, ownerId: OWNER },
      ['video']
    )
    expect(t.key).toMatch(new RegExp(`^videos/${OWNER}/[A-Za-z0-9]{24}\\.mp4$`))
  })

  it('keeps the random segment long enough that an object cannot be guessed and overwritten', () => {
    const t = resolveUploadTarget({ kind: 'video', contentType: 'video/mp4', sizeBytes: 10, ownerId: OWNER }, ['video'])
    const random = t.key.split('/')[2].replace(/\.mp4$/, '')
    expect(random).toHaveLength(24)
  })
})
