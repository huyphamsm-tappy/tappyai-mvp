// @vitest-environment jsdom
/**
 * BUG-003 — "Theo dõi lại" in the Inbox claimed a follow the server had refused.
 *
 * ============================================================================
 * THE DEFECT
 * ============================================================================
 * The button flipped to "following" and then awaited the POST BARE, with no `try`/`catch` at all:
 *
 *     onClick={async e => { …; setFollowed(true); await fetch(`/api/users/${id}/follow`, …) }}
 *
 * `fetch` resolves on 401 / 403 / 500, so a refused follow left the button reading "Đang theo dõi"
 * for the rest of the session, and a network failure became an unhandled rejection inside an
 * event handler. It was the only follow path in the app without verification — `ProfileTab
 * .handleFollow` and `followFromFeed` both check the response and roll back.
 *
 * ============================================================================
 * WHY THIS MOUNTS THE WHOLE PAGE
 * ============================================================================
 * `NotifRow` lives inside `reviews/page.tsx`, and Next forbids a page module from exporting
 * anything but its reserved names — the same constraint that produced `feedShared.tsx` and
 * `ProfileTab.tsx`. Extracting it would be a refactor of a file this batch is otherwise only
 * touching by four lines, so the row is driven through the real page instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const { ACTOR } = vi.hoisted(() => ({ ACTOR: 'actor-1' }))

// ── The page's world, stubbed down to what the Inbox tab needs ──
vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=inbox'),
}))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/lib/tracking/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/userMemory', () => ({
  logUserEvent: vi.fn(), getUserPreferences: vi.fn(async () => null), inferPreferencesFromEvents: vi.fn(),
}))
vi.mock('@/lib/explore/webExploreSession', () => ({
  // The surface `reviews/page.tsx` actually calls on the session, and nothing more.
  getExploreSession: () => ({
    enterExplore: vi.fn(),
    leaveExplore: vi.fn(() => null),
    getState: () => ({ tab: 'inbox', feedType: 'latest', sort: 'latest', query: null, filters: null, index: 0, scrollOffset: 0 }),
    getPhase: () => 'idle',
    snapshot: () => null,
    reportActiveItem: vi.fn(),
    setQueryShape: vi.fn(),
    invalidate: vi.fn(),
  }),
  reportAuthState: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => {
      const b: any = { select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: null }), then: (r: any) => r({ data: [], error: null }) }
      return b
    },
  }),
}))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('./LikeListSheet', () => ({ default: () => null }))
vi.mock('./ProfileTab', () => ({ ProfileTab: () => null }))
// Fully stubbed — importActual would pull in VideoPlayer and the music module, which build a
// Supabase client at module scope and cannot run in jsdom without real env.
vi.mock('./feedShared', () => ({
  Post: () => null,
  CommentDrawer: () => null,
  ShareModal: () => null,
  isShareOnlyName: () => false,
  ago: () => 'vừa xong',
}))
vi.mock('@/components/LinkPoster', () => ({ default: () => null }))

// ONE follow notification, so the Inbox renders exactly one "Theo dõi lại" button.
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({
    notifications: [{
      id: 'n1', type: 'follow', category: 'social', title: 'x', body: 'y',
      actor: { id: ACTOR, name: 'Người A', avatar: null },
      entity_url: `/users/${ACTOR}`, image_url: null, data: {}, read_at: null,
      created_at: new Date().toISOString(),
    }],
    unreadCount: 1, loading: false, refetch: vi.fn(), markAllRead: vi.fn(),
  }),
}))

import ReviewsPage from './page'

/** The follow control — labelled by the state it believes it is in. */
const followBtn = () =>
  (screen.queryByText('reviews.followBack') ?? screen.queryByText('reviews.followed')) as HTMLElement | null

let unhandled: unknown[] = []
const onUnhandled = (e: any) => { unhandled.push(e.reason ?? e); e.preventDefault?.() }

beforeEach(() => {
  cleanup()
  unhandled = []
  vi.unstubAllGlobals()
  process.on('unhandledRejection', onUnhandled)
})
afterEach(() => { process.off('unhandledRejection', onUnhandled) })

/** Feed GETs answer empty; only the follow POST is under test. */
function stubFetch(followResult: { ok: boolean; body?: unknown } | 'network-error') {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'POST' && String(url).includes('/follow')) {
      if (followResult === 'network-error') throw new Error('offline')
      return { ok: followResult.ok, json: async () => followResult.body ?? {} }
    }
    return { ok: true, json: async () => ({ reviews: [], notifications: [], unread_count: 0 }) }
  }) as any)
}

async function clickFollow() {
  await waitFor(() => expect(followBtn()).not.toBeNull())
  fireEvent.click(followBtn()!)
}

describe('BUG-003 — Inbox "follow back" reflects the server', () => {
  it('a successful follow sticks', async () => {
    stubFetch({ ok: true, body: { following: true, follower_count: 1 } })
    render(<ReviewsPage />)
    await clickFollow()
    await waitFor(() => expect(screen.queryByText('reviews.followed')).not.toBeNull())
  })

  it('🚨 401 rolls back to "follow back"', async () => {
    stubFetch({ ok: false, body: { error: 'unauthorized' } })
    render(<ReviewsPage />)
    await clickFollow()
    await waitFor(() => expect(screen.queryByText('reviews.followBack')).not.toBeNull())
    expect(screen.queryByText('reviews.followed')).toBeNull()
  })

  it('🚨 403 (anonymous session, B17) rolls back', async () => {
    stubFetch({ ok: false, body: { error: 'account_required' } })
    render(<ReviewsPage />)
    await clickFollow()
    await waitFor(() => expect(screen.queryByText('reviews.followBack')).not.toBeNull())
  })

  it('🚨 500 rolls back', async () => {
    stubFetch({ ok: false, body: { error: 'follow_failed' } })
    render(<ReviewsPage />)
    await clickFollow()
    await waitFor(() => expect(screen.queryByText('reviews.followBack')).not.toBeNull())
  })

  it('🚨 the STATUS decides, even when a failure body looks like success', async () => {
    // Isolates the `res.ok` check from the shape check, so deleting either one fails a test.
    stubFetch({ ok: false, body: { following: true } })
    render(<ReviewsPage />)
    await clickFollow()
    await waitFor(() => expect(screen.queryByText('reviews.followBack')).not.toBeNull())
  })

  it('a network failure rolls back AND produces no unhandled rejection', async () => {
    stubFetch('network-error')
    render(<ReviewsPage />)
    await clickFollow()
    await waitFor(() => expect(screen.queryByText('reviews.followBack')).not.toBeNull())
    await new Promise(r => setTimeout(r, 50))
    expect(unhandled).toEqual([])
  })
})
