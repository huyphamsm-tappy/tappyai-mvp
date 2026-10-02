import { describe, it, expect } from 'vitest'
import { accountMediaPrefixes, assertOwnerScopedPrefix } from './key'
import { createGcsProvider } from './providers/gcs'
import { MediaStorageError } from './types'

// F-096 · listing and deleting ONE user's uploads. The prefix guard is the whole safety of the
// feature: '' or 'avatars/' would list — and account deletion would then delete — every user's files.

const U = '11111111-1111-4111-8111-111111111111'
const G = 'aaaaaaaa-0000-4000-8000-000000000001'

describe('owner-scoped prefixes', () => {
  it('covers every writer: avatars, covers, reviews, videos, thumbnails, music, group avatars', () => {
    expect(accountMediaPrefixes(U, [G])).toEqual([
      `avatars/${U}-`, `covers/${U}-`, `reviews/${U}/`, `videos/${U}/`, `thumbnails/${U}/`, `music/${U}/`, `avatars/group-${G}-`,
    ])
  })

  it('🚨 refuses anything that is not exactly one owner', () => {
    for (const p of ['', 'avatars/', 'avatars', 'reviews/', `reviews/${U}`, `deals/${U}/`, `avatars/${U}`, 'avatars/not-a-uuid-', `../avatars/${U}-`, 'avatars/AAAAAAAA-0000-4000-8000-000000000001-']) {
      expect(() => assertOwnerScopedPrefix(p), JSON.stringify(p)).toThrow()
    }
  })

  it('🚨 a malformed user or group id fails before any listing', () => {
    expect(() => accountMediaPrefixes('')).toThrow()
    expect(() => accountMediaPrefixes('x/../y')).toThrow()
    expect(() => accountMediaPrefixes(U, ['*'])).toThrow()
  })
})

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Array<{ url: string; method: string }> = []
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' })
    const r = responses.shift() ?? { status: 500 }
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
  return { fn, calls }
}
const provider = (f: typeof fetch) => createGcsProvider({ bucket: 'tappyai-media-test', getAccessToken: async () => 'tok', fetchImpl: f })

describe('GCS listObjects / deleteObject', () => {
  it('follows pages, encodes the prefix, and returns only names under it', async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { items: [{ name: `reviews/${U}/1.jpg` }, { name: 'reviews/other/2.jpg' }], nextPageToken: 'p2' } },
      { status: 200, body: { items: [{ name: `reviews/${U}/3.jpg` }] } },
    ])
    expect(await provider(fn).listObjects!(`reviews/${U}/`)).toEqual([`reviews/${U}/1.jpg`, `reviews/${U}/3.jpg`])
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toContain(`/storage/v1/b/tappyai-media-test/o?prefix=${encodeURIComponent(`reviews/${U}/`)}`)
    expect(calls[1].url).toContain('pageToken=p2')
  })

  it('🚨 a bucket-wide prefix is refused without a single request', async () => {
    const { fn, calls } = fakeFetch([])
    await expect(provider(fn).listObjects!('avatars/')).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('a refused listing is an error, never "nothing to delete"', async () => {
    const { fn } = fakeFetch([{ status: 403 }])
    await expect(provider(fn).listObjects!(`music/${U}/`)).rejects.toBeInstanceOf(MediaStorageError)
  })

  it('delete: 204 → true, 404 → false (already gone), 403 → error', async () => {
    const { fn, calls } = fakeFetch([{ status: 204 }, { status: 404 }, { status: 403 }])
    const p = provider(fn)
    expect(await p.deleteObject!(`avatars/${U}-abc.jpg`)).toBe(true)
    expect(await p.deleteObject!(`avatars/${U}-abc.jpg`)).toBe(false)
    await expect(p.deleteObject!(`avatars/${U}-abc.jpg`)).rejects.toBeInstanceOf(MediaStorageError)
    expect(calls[0]).toEqual({ url: `https://storage.googleapis.com/storage/v1/b/tappyai-media-test/o/${encodeURIComponent(`avatars/${U}-abc.jpg`)}`, method: 'DELETE' })
  })
})
