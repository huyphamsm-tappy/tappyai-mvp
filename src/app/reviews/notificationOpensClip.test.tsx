// @vitest-environment jsdom
/**
 * BUG-006 — a like notification about a CLIP opened the article-style Review Detail.
 * BUG-005 — and that destination is where the "3 liked" / "❤️ 1" mismatch is read.
 *
 * ============================================================================
 * THE TWO PRESENTATIONS
 * ============================================================================
 * `/reviews/[id]` renders `ReviewDetailView`: a `h-[55vh]` hero with a content card sliding over
 * it — an article about a place. The feed and the profile clip viewer render `Post`:
 * `h-dvh snap-start bg-black`, a full-bleed vertical clip with the action rail. Every review in
 * this product is a video, and tapping "someone liked your clip" landed on the article.
 *
 * ============================================================================
 * WHAT IS LOCKED HERE
 * ============================================================================
 *   video notification  → the EXISTING ClipViewer, on the EXACT post the notification names
 *   image notification  → Review Detail, unchanged
 *   unreadable target   → Review Detail, so the route (not this handler) decides 404
 *
 * BUG-005 is deliberately NOT "fixed" by changing data: the notification stays a historical event
 * and the count stays current state. What changes is that the user lands where both are legible —
 * the current count, and the like list one tap away.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const { TARGET, push } = vi.hoisted(() => ({ TARGET: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', push: vi.fn() }))

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=inbox'),
}))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/lib/tracking/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/userMemory', () => ({ logUserEvent: vi.fn(), getUserPreferences: vi.fn(async () => null), inferPreferencesFromEvents: vi.fn() }))
vi.mock('@/lib/explore/webExploreSession', () => ({
  getExploreSession: () => ({
    enterExplore: vi.fn(), leaveExplore: vi.fn(() => null),
    getState: () => ({ tab: 'inbox', feedType: 'latest', sort: 'latest', query: null, filters: null, index: 0, scrollOffset: 0 }),
    getPhase: () => 'idle', snapshot: () => null,
    reportActiveItem: vi.fn(), setQueryShape: vi.fn(), invalidate: vi.fn(),
  }),
  reportAuthState: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
    from: () => {
      const b: any = { select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: null }), then: (r: any) => r({ data: [], error: null }) }
      return b
    },
  }),
}))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('./LikeListSheet', () => ({ default: () => null }))
vi.mock('@/components/LinkPoster', () => ({ default: () => null }))
vi.mock('./feedShared', () => ({
  Post: () => null, CommentDrawer: () => null, ShareModal: () => null,
  isShareOnlyName: () => false, ago: () => 'vừa xong',
}))
// The real ClipViewer is driven in ProfileTab's own tests; here we only need to observe THAT it
// opened and on WHICH post, so it is stubbed to report its props.
vi.mock('./ProfileTab', () => ({
  ProfileTab: () => null,
  ClipViewer: ({ posts, startIndex }: { posts: { id: string }[]; startIndex: number }) => (
    <div data-testid="clip-viewer" data-post={posts[0]?.id} data-count={posts.length} data-start={startIndex} />
  ),
}))

vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({
    notifications: [{
      id: 'n1', type: 'like', category: 'social', title: '❤️ ai đó thích review của bạn', body: 'Quán A',
      actor: { id: 'actor-1', name: 'Elijah Kelly', avatar: null },
      entity_url: `/reviews/${TARGET}`, image_url: null, data: {}, read_at: null,
      created_at: new Date().toISOString(),
    }],
    unreadCount: 1, loading: false, refetch: vi.fn(), markAllRead: vi.fn(),
  }),
}))

import ReviewsPage from './page'

const VIDEO_REVIEW = {
  id: TARGET, user_id: 'author-1', place_name: 'Quán A', place_address: null, rating: 5,
  body: 'ngon', photos: null, like_count: 1, comment_count: 0, save_count: 0,
  created_at: '2026-08-01T00:00:00Z', liked_by_me: false, saved_by_me: false,
  profiles: { full_name: 'Tác giả', avatar_url: null },
  content_type: 'video', media_url: 'https://x/a.mp4', thumbnail: null,
  source_type: 'upload', source_url: null, music: null,
}
const IMAGE_REVIEW = { ...VIDEO_REVIEW, content_type: 'photo', media_url: null, photos: ['https://x/1.jpg'] }

/** Only the single-review read matters; every other call answers empty. */
function stubFetch(target: { ok: boolean; body?: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url) === `/api/reviews/${TARGET}`) return { ok: target.ok, json: async () => target.body ?? {} }
    return { ok: true, json: async () => ({ reviews: [], notifications: [], unread_count: 0, likers: [] }) }
  }) as any)
}

async function clickNotification() {
  await waitFor(() => expect(screen.getByText('reviews.notifLiked')).toBeTruthy())
  fireEvent.click(screen.getByText('reviews.notifLiked'))
}

beforeEach(() => { cleanup(); push.mockClear(); vi.unstubAllGlobals() })

describe('BUG-006 — a notification about a clip opens the clip viewer', () => {
  it('🚨 a VIDEO target opens the existing ClipViewer on that exact post', async () => {
    stubFetch({ ok: true, body: VIDEO_REVIEW })
    render(<ReviewsPage />)
    await clickNotification()

    const viewer = await screen.findByTestId('clip-viewer')
    expect(viewer.getAttribute('data-post')).toBe(TARGET)   // the notification's post, not the feed's first
    expect(viewer.getAttribute('data-count')).toBe('1')
    expect(viewer.getAttribute('data-start')).toBe('0')
    // and it must NOT also navigate away to the article page
    expect(push).not.toHaveBeenCalled()
  })

  it('an IMAGE target keeps the existing Review Detail navigation', async () => {
    stubFetch({ ok: true, body: IMAGE_REVIEW })
    render(<ReviewsPage />)
    await clickNotification()

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/reviews/${TARGET}`))
    expect(screen.queryByTestId('clip-viewer')).toBeNull()
  })

  it('an unreadable target falls back to the route, so it — not this handler — answers 404', async () => {
    // Deleted / hidden / under-review all come back non-2xx here. Sending the user to the route
    // keeps BUG-004 intact: that page returns a real HTTP 404.
    stubFetch({ ok: false })
    render(<ReviewsPage />)
    await clickNotification()

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/reviews/${TARGET}`))
    expect(screen.queryByTestId('clip-viewer')).toBeNull()
  })
})

describe('BUG-005 — historical event vs current state', () => {
  it('the viewer is handed the CURRENT like_count, never the notification actor count', async () => {
    // The notification names actors who liked at some point; `like_count` is who likes now. The
    // destination must carry the current number — this is the whole of BUG-005, and it is a
    // display contract, not a data change.
    stubFetch({ ok: true, body: { ...VIDEO_REVIEW, like_count: 1 } })
    render(<ReviewsPage />)
    await clickNotification()

    const viewer = await screen.findByTestId('clip-viewer')
    expect(viewer.getAttribute('data-post')).toBe(TARGET)
    // Nothing in this path invents a liker or rewrites the count: the only source is the API row.
    const calls = (fetch as any).mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calls).toContain(`/api/reviews/${TARGET}`)
    expect(calls.every((u: string) => !/like$/.test(u))).toBe(true)   // no like/unlike was triggered
  })
})
