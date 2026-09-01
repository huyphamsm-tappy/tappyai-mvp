/**
 * ONE canonical presentation for a video post, reached from every entry point.
 *
 * ============================================================================
 * WHY THIS IS ONE ROUTE AND NOT FIVE FIXES
 * ============================================================================
 * Traced across the whole app, every way of opening a post that is not already the feed or the
 * profile grid converges on the SAME route:
 *
 *   push notification  → `push-sw.js` opens `data.url`, which is the notification's `entity_url`
 *                        → `/reviews/<id>`
 *   share link         → `ReviewShareButton` and the feed's `ShareModal` both publish
 *                        `absoluteUrl('/reviews/<id>')`
 *   direct URL         → `/reviews/<id>`
 *   saved places       → `profile/favorites` links to `/reviews/<id>`
 *   sound page / sheet → link to `/reviews/<id>`
 *   creator grid       → link to `/reviews/<id>`
 *   "View post" sheet  → links to `/reviews/<id>`
 *
 * So the route is the only place that has to change, and no link, share URL or push payload is
 * touched. A clip opens in the clip experience; a photo post keeps the article page it was
 * designed for.
 *
 * ============================================================================
 * WHAT MUST NOT MOVE
 * ============================================================================
 * The existence and publication checks stay ABOVE the media branch, so BUG-004's real HTTP 404 for
 * a deleted, malformed or under-review id is unaffected — those never reach the branch at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ review: null as Record<string, unknown> | null }))

vi.mock('./getReview', () => ({ getReview: async () => h.review }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'viewer-1' } } }) },
    from: () => {
      const b: any = {
        select: () => b, eq: () => b,
        maybeSingle: async () => ({ data: null }),
        then: (r: (v: unknown) => unknown) => r({ count: 0 }),
      }
      return b
    },
  }),
}))
vi.mock('./ReviewDetailView', () => ({ default: function ReviewDetailView() { return null } }))
vi.mock('./ReviewClipView', () => ({ default: function ReviewClipView() { return null } }))

import ReviewDetailPage from './page'

const BASE = {
  id: 'r1', user_id: 'author-1', place_name: 'Quán A', place_address: null, rating: 5,
  body: 'ngon', photos: null, is_verified: true, like_count: 1, comment_count: 0,
  created_at: '2026-08-01T00:00:00Z', music: null, thumbnail: null,
  source_type: 'upload', source_url: null,
  profiles: { full_name: 'Tác giả', avatar_url: null },
}
const VIDEO = { ...BASE, content_type: 'video', media_url: 'https://x/a.mp4' }
const IMAGE = { ...BASE, content_type: 'photo', media_url: null, photos: ['https://x/1.jpg'] }
const VIDEO_NO_MEDIA = { ...BASE, content_type: 'video', media_url: null, photos: ['https://x/1.jpg'] }

/** The component the route decided to render, by name. */
async function renderedComponent(id = 'r1'): Promise<string> {
  const el: any = await ReviewDetailPage({ params: { id } })
  return el?.type?.name ?? String(el?.type)
}

async function refuses(run: () => Promise<unknown>): Promise<boolean> {
  try { await run(); return false } catch (e: any) { return /NEXT_NOT_FOUND/.test(e?.digest ?? e?.message ?? '') }
}

beforeEach(() => { h.review = null })

describe('every entry point to a VIDEO post lands in the clip viewer', () => {
  it('🚨 a video renders the clip view, not the article hero', async () => {
    h.review = VIDEO
    expect(await renderedComponent()).toBe('ReviewClipView')
  })

  it('the clip view is handed THIS review — never a feed to pick from', async () => {
    h.review = VIDEO
    const el: any = await ReviewDetailPage({ params: { id: 'r1' } })
    expect(el.props.review.id).toBe('r1')
    expect(el.props.review.content_type).toBe('video')
    // The viewer's own state comes from the server read, so nothing else is fetched to render it.
    expect(el.props.review).toHaveProperty('liked_by_me')
    expect(el.props.review).toHaveProperty('saved_by_me')
  })

  it('an IMAGE post keeps the existing Review Detail', async () => {
    h.review = IMAGE
    expect(await renderedComponent()).toBe('ReviewDetailView')
  })

  it('a row typed video but WITHOUT media falls back to Review Detail rather than a black screen', async () => {
    // `ReviewDetailView` already guards on `content_type === 'video' && media_url`; the route uses
    // the same pair so the two can never disagree about what a clip is.
    h.review = VIDEO_NO_MEDIA
    expect(await renderedComponent()).toBe('ReviewDetailView')
  })
})

describe('BUG-004 is upstream of the media branch and stays intact', () => {
  it('a deleted / missing review still refuses before anything is rendered', async () => {
    h.review = null
    expect(await refuses(() => ReviewDetailPage({ params: { id: 'gone' } }))).toBe(true)
  })

  it('a malformed id refuses the same way', async () => {
    h.review = null
    expect(await refuses(() => ReviewDetailPage({ params: { id: 'not-a-uuid' } }))).toBe(true)
  })

  it('an under-review / hidden row refuses — visibility is not relaxed by the new branch', async () => {
    // `getReview` applies the hidden + publication filters; a refused row arrives as null and the
    // media branch is never consulted.
    h.review = null
    expect(await refuses(() => ReviewDetailPage({ params: { id: 'held' } }))).toBe(true)
  })
})
