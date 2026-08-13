// Historical Vercel Blob media must never reach a client.
//
// WHY, precisely: the Blob store is suspended for DATA TRANSFER (10.1 GB of a
// 10 GB allowance), not storage. Those objects 403 today, so they cost nothing —
// but the moment the allowance resets and the store un-suspends, every feed item
// still pointing at Blob starts serving real bytes again and the egress that
// caused the suspension resumes. Deleting the objects fixes that; so does never
// asking for them. This is the "never ask" half, and it needs no credentials.
//
// The classification is by HOST, deliberately. A substring rule like
// `url.includes('blob')` would sweep up `blob:` object URLs, a `/blobfish`
// path, or any unrelated host containing those four letters — so it is banned
// here and a test enforces that.
//
// Scope: presentation only. Nothing is deleted — not a database row, not a GCS
// object, not a Blob object.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mediaProviderOf,
  isServableMediaUrl,
  stripUnservableMedia,
} from './servableMedia'

const BLOB = 'https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/videos/1784796773809.mp4'
const BLOB_AVATAR = 'https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/avatars/u1.jpg'
const GCS = 'https://storage.googleapis.com/tappyai-media-prod/videos/u1/abc.mp4'
const YOUTUBE = 'https://www.youtube.com/watch?v=Z95t57HyYTE'
const TIKTOK = 'https://www.tiktok.com/@someone/video/123456'
const GOOGLE_AVATAR = 'https://lh3.googleusercontent.com/a/ACg8ocJdRDz'

// ------------------------------------------------------------ classification
describe('mediaProviderOf — by host, never by substring', () => {
  it.each([
    [BLOB, 'vercel-blob'],
    [BLOB_AVATAR, 'vercel-blob'],
    [GCS, 'gcs'],
    [YOUTUBE, 'external'],
    [TIKTOK, 'external'],
    [GOOGLE_AVATAR, 'external'],
  ])('%s -> %s', (url, expected) => {
    expect(mediaProviderOf(url)).toBe(expected)
  })

  it.each([[''], [null], [undefined]])('treats %s as none', (value) => {
    expect(mediaProviderOf(value as unknown as string)).toBe('none')
  })

  // The exact traps a substring rule would fall into.
  it.each([
    'https://example.com/blob/photo.jpg',
    'https://blobfish.example.com/a.mp4',
    'https://cdn.example.com/my-blob-storage/x.png',
    'blob:https://www.tappyai.com/9f8e-7d6c',
  ])('does not misclassify %s as vercel-blob', (url) => {
    expect(mediaProviderOf(url)).not.toBe('vercel-blob')
  })

  // A lookalike host must not be treated as ours either way.
  it('does not accept a suffixed impostor host', () => {
    expect(mediaProviderOf('https://public.blob.vercel-storage.com.evil.test/x.mp4')).toBe('external')
  })
})

describe('isServableMediaUrl', () => {
  it('refuses only Vercel Blob', () => {
    expect(isServableMediaUrl(BLOB)).toBe(false)
    expect(isServableMediaUrl(BLOB_AVATAR)).toBe(false)
  })

  it.each([GCS, YOUTUBE, TIKTOK, GOOGLE_AVATAR])('keeps %s', (url) => {
    expect(isServableMediaUrl(url)).toBe(true)
  })
})

// ------------------------------------------------------------- row stripping
/** Mirrors what the review routes actually select — including the array field. */
const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'r1',
  user_id: 'u1',
  content: 'Great place',
  content_type: 'video',
  like_count: 3,
  media_url: GCS,
  thumbnail: GCS.replace('/videos/', '/thumbnails/'),
  photos: [] as unknown[],
  source_url: null,
  profiles: { full_name: 'Huy', avatar_url: GOOGLE_AVATAR },
  ...over,
})

describe('stripUnservableMedia', () => {
  // 1 — the whole point.
  it('removes a historical Blob media URL from what the client sees', () => {
    const out = stripUnservableMedia(row({ media_url: BLOB, thumbnail: BLOB }))
    expect(out.media_url).toBeNull()
    expect(out.thumbnail).toBeNull()
    expect(JSON.stringify(out)).not.toContain('blob.vercel-storage.com')
  })

  // 2
  it('leaves GCS media untouched', () => {
    const r = row()
    const out = stripUnservableMedia(r)
    expect(out.media_url).toBe(r.media_url)
    expect(out.thumbnail).toBe(r.thumbnail)
  })

  // 3 / 4
  it.each([
    ['youtube', YOUTUBE],
    ['tiktok', TIKTOK],
  ])('leaves a %s link untouched', (_label, url) => {
    expect(stripUnservableMedia(row({ media_url: url })).media_url).toBe(url)
  })

  // 5
  it('leaves an item with no media valid', () => {
    const out = stripUnservableMedia(row({ media_url: null, thumbnail: null }))
    expect(out.id).toBe('r1')
    expect(out.media_url).toBeNull()
  })

  // 6 — presentation only.
  it('preserves every non-media field of the record', () => {
    const out = stripUnservableMedia(row({ media_url: BLOB }))
    expect(out.id).toBe('r1')
    expect(out.user_id).toBe('u1')
    expect(out.content).toBe('Great place')
    expect(out.like_count).toBe(3)
  })

  it('strips a Blob avatar but keeps the rest of the profile', () => {
    const out = stripUnservableMedia(row({ profiles: { full_name: 'Huy', avatar_url: BLOB_AVATAR } }))
    expect((out.profiles as { avatar_url: string | null }).avatar_url).toBeNull()
    expect((out.profiles as { full_name: string }).full_name).toBe('Huy')
  })

  it('keeps a non-Blob avatar', () => {
    const out = stripUnservableMedia(row())
    expect((out.profiles as { avatar_url: string }).avatar_url).toBe(GOOGLE_AVATAR)
  })

  it('does not mutate the input row', () => {
    const r = row({ media_url: BLOB })
    stripUnservableMedia(r)
    expect(r.media_url).toBe(BLOB) // caller's object untouched
  })

  it('handles a whole page of mixed items', () => {
    const page = [row({ media_url: BLOB }), row({ media_url: GCS }), row({ media_url: YOUTUBE })]
    const out = page.map(stripUnservableMedia)
    expect(out.map((o) => o.media_url)).toEqual([null, GCS, YOUTUBE])
    expect(JSON.stringify(out)).not.toContain('blob.vercel-storage.com')
  })
})

// ------------------------------------------------------------ array media
// Found in production, not in review: `photos` is an ARRAY of URLs. The first
// version of this filter only handled scalar fields, so a Blob photo sailed
// straight through a feed that every other check said was clean. Scalars were
// never the whole shape.
describe('photos — an array field, filtered per element', () => {
  it('drops Blob photos and keeps the rest', () => {
    const out = stripUnservableMedia(row({ photos: [BLOB, GCS, YOUTUBE] }))
    expect(out.photos).toEqual([GCS, YOUTUBE])
  })

  it('yields an empty array when every photo is Blob — never null', () => {
    const out = stripUnservableMedia(row({ photos: [BLOB, BLOB] }))
    expect(out.photos).toEqual([])
  })

  it('leaves an all-GCS gallery untouched', () => {
    const photos = [GCS, GCS.replace('abc', 'def')]
    expect(stripUnservableMedia(row({ photos })).photos).toEqual(photos)
  })

  it.each([[null], [undefined], [[]]])('leaves %s alone', (photos) => {
    const out = stripUnservableMedia(row({ photos }))
    expect(out.photos).toEqual(photos ?? photos)
  })

  it('does not mutate the caller’s array', () => {
    const photos = [BLOB, GCS]
    stripUnservableMedia(row({ photos }))
    expect(photos).toEqual([BLOB, GCS])
  })

  it('ignores non-string entries rather than throwing', () => {
    const out = stripUnservableMedia(row({ photos: [BLOB, null, 42, GCS] as unknown[] }))
    expect(out.photos).toEqual([GCS])
  })
})

// `source_url` is the ORIGINAL external link (YouTube/TikTok post), not stored
// media. It must survive untouched or Explore loses its link-post attribution.
describe('source_url is left alone', () => {
  it.each([YOUTUBE, TIKTOK])('keeps %s', (url) => {
    expect(stripUnservableMedia(row({ source_url: url })).source_url).toBe(url)
  })
})

// -------------------------------------------- the invariant, stated directly
describe('INVARIANT: no Blob URL survives to the client', () => {
  it.each([
    { media_url: BLOB },
    { thumbnail: BLOB },
    { photos: [BLOB] },
    { photos: [GCS, BLOB, YOUTUBE] },
    { profiles: { full_name: 'x', avatar_url: BLOB_AVATAR } },
    {
      media_url: BLOB,
      thumbnail: BLOB,
      photos: [BLOB, BLOB],
      profiles: { full_name: 'x', avatar_url: BLOB_AVATAR },
    },
  ])('%j leaves no blob host anywhere in the payload', (over) => {
    const serialized = JSON.stringify(stripUnservableMedia(row(over)))
    expect(serialized).not.toContain('blob.vercel-storage.com')
  })
})

// ------------------------------------------------- the banned implementation
describe('the classifier is not a substring hack', () => {
  // Comments are stripped first: the source deliberately *documents* the banned
  // pattern, and a guard that trips over its own explanation is a guard nobody
  // can keep.
  const code = readFileSync(join(__dirname, 'servableMedia.ts'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
    .join('\n')

  it('never uses includes("blob") to decide', () => {
    expect(code).not.toMatch(/includes\(\s*['"]blob['"]\s*\)/)
    expect(code).not.toMatch(/indexOf\(\s*['"]blob['"]\s*\)/)
  })

  // The host pattern must be anchored, or `evil-blob.vercel-storage.com.x` slips through.
  it('anchors the host pattern at both ends', () => {
    expect(code).toMatch(/\/\^\[a-z0-9-\]\+\\\.public\\\.blob\\\.vercel-storage\\\.com\$\/i/)
  })

  it('deletes nothing — it only rewrites the outgoing shape', () => {
    expect(code).not.toMatch(/\.delete\(|DELETE FROM|\bdel\(/i)
  })
})
