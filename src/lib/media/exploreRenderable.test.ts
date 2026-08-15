import { describe, it, expect } from 'vitest'
import { isExploreRenderable, toExploreFeedItems } from './servableMedia'

// ── Explore must not serve a slide with nothing on it ────────────────────────
//
// Measured on production 2026-08-15, /api/reviews/feed?sort=latest: 5 rows returned, every one
// content_type "video" / source_type "upload" — and THREE came back with media_url null,
// thumbnail null, photos [] and no source_url. Nothing to play, nothing to show.
//
// The client is not at fault. feedShared.tsx:422 picks the renderer:
//     r.content_type === 'video' && r.media_url  → <VideoPlayer/>
//   : photos.length > 0                          → <Carousel/>
//   : <div class="… bg-gradient-to-br from-gray-900 to-black"/>   ← blank slide
// It reads the row correctly; it just has no way to decline an item the feed handed it. So a
// post whose media is gone occupies a full-screen Explore slide forever. That is what users
// reported as "old clips that no longer load".
//
// Deletion is NOT the cause and is not in question: DELETE /api/reviews/[id] is a hard
// `.delete()`, so a deleted post cannot come back from any query on `reviews`.
//
// The rule below is taken from that same client branch on purpose — backend eligibility and
// client renderability must be the same predicate, or they drift again.

const GCS = 'https://storage.googleapis.com/tappyai-media/clip.mp4'
const BLOB = 'https://store123.public.blob.vercel-storage.com/clip.mp4'
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', user_id: 'u1', content_type: 'video', source_type: 'upload',
  media_url: GCS, thumbnail: null, photos: [], source_url: null, ...over,
})

describe('isExploreRenderable', () => {
  it('keeps a video with servable media', () => {
    expect(isExploreRenderable(row())).toBe(true)
  })

  it('drops a video with no media_url — the blank-slide case', () => {
    expect(isExploreRenderable(row({ media_url: null }))).toBe(false)
  })

  it('drops a video whose media_url was stripped as unservable', () => {
    // stripUnservableMedia nulls Blob URLs, so this is the exact post-strip shape.
    expect(isExploreRenderable(row({ media_url: null, thumbnail: null }))).toBe(false)
  })

  it('keeps a photo post that has no video at all', () => {
    expect(isExploreRenderable(row({ content_type: 'photo', media_url: null, photos: [GCS] }))).toBe(true)
  })

  it('keeps a video row that still has photos to show', () => {
    expect(isExploreRenderable(row({ media_url: null, photos: [GCS] }))).toBe(true)
  })

  it('drops a link post with no media_url — the player is handed url={media_url}', () => {
    // feedShared passes url={r.media_url} even for youtube; a null there renders nothing.
    expect(isExploreRenderable(row({ source_type: 'youtube', media_url: null, source_url: YT }))).toBe(false)
  })

  it('keeps a link post that does have media_url', () => {
    expect(isExploreRenderable(row({ source_type: 'youtube', media_url: GCS, source_url: YT }))).toBe(true)
  })

  it('drops a row whose photos array is empty rather than absent', () => {
    expect(isExploreRenderable(row({ media_url: null, photos: [] }))).toBe(false)
  })
})

describe('toExploreFeedItems — strip, then drop what cannot render', () => {
  it('removes the Blob-media video instead of serving an empty slide', () => {
    const out = toExploreFeedItems([row({ id: 'blob', media_url: BLOB })])
    expect(out).toEqual([])
  })

  it('still strips Blob media from a row it keeps', () => {
    const out = toExploreFeedItems([row({ id: 'mixed', media_url: GCS, photos: [BLOB, GCS] })])
    expect(out).toHaveLength(1)
    expect(out[0].photos).toEqual([GCS])
  })

  it('keeps the healthy rows and only the healthy rows', () => {
    const page = [
      row({ id: 'ok1' }),
      row({ id: 'dead1', media_url: null }),
      row({ id: 'ok2', media_url: BLOB, photos: [GCS] }),
      row({ id: 'dead2', media_url: BLOB }),
    ]
    expect(toExploreFeedItems(page).map(r => r.id)).toEqual(['ok1', 'ok2'])
  })

  it('does not mutate the caller’s rows', () => {
    const r = row({ media_url: BLOB })
    toExploreFeedItems([r])
    expect(r.media_url).toBe(BLOB)
  })

  it('an all-dead page becomes an empty page, not a page of blanks', () => {
    expect(toExploreFeedItems([row({ media_url: null }), row({ media_url: BLOB })])).toEqual([])
  })
})
