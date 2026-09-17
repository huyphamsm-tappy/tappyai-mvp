// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import ProfileView from './ProfileView'
import { setLocale } from '@/lib/i18n/useTranslation'

// ── V3 Web · Profile / Me ───────────────────────────────────────────────────
//
// 🚨 THE REFERENCE IS THE VISUAL TARGET; THE SCHEMA DECIDES WHAT MAY BE SAID.
//
// The design shows a cover photo, an @handle, a location line, a 1.250-point balance with a
// progress bar to "Silver", story-ring highlights, an activity feed and a friends list. Audited:
// there is no cover column, no username column, no location column, no points/rewards/tier table
// anywhere in the codebase, no story or highlight model, and `user_follows` is directional.
//
// Those absences are the hard part of this screen, because every one of them is easy to fake and
// looks better faked. This file pins them out. The rest of it proves the REAL data — follower and
// following counts (trigger-maintained columns), likes received, the gated content endpoints, and
// the existing QR capability — is actually rendered.

const SHARED = [
  { id: 'shared-1', place_name: 'Quán chia sẻ', body: null, photos: null, thumbnail: null, content_type: 'photo', created_at: '2026-09-01', shared_at: '2026-09-15T10:00:00Z' },
]
const LIKED = [
  { id: 'liked-1', place_name: 'Quán đã thích', body: null, photos: null, thumbnail: null, content_type: 'photo', created_at: '2026-09-02', liked_at: '2026-09-16T10:00:00Z' },
]
// `/api/reviews/mine` is the author's COMPLETE list — the hidden row rides along with `is_hidden`.
const REVIEWS = [
  {
    id: 'r1', place_name: 'Cà phê Đà Lạt', body: 'ngon', photos: ['https://cdn/x.jpg'],
    thumbnail: null, content_type: 'video', created_at: '2026-09-01T00:00:00Z',
    rating: 5, like_count: 1248, comment_count: 12, view_count: 12400, is_hidden: false,
  },
  {
    id: 'r2', place_name: 'Bún bò Huế', body: 'ok', photos: null,
    thumbnail: 'https://cdn/y.jpg', content_type: 'photo', created_at: '2026-08-30T00:00:00Z',
    rating: 4, like_count: 3, comment_count: 0, view_count: 999, is_hidden: false,
  },
  {
    id: 'r3-hidden', place_name: 'Quán đã ẩn', body: 'private', photos: null,
    thumbnail: null, content_type: 'photo', created_at: '2026-08-20T00:00:00Z',
    rating: 3, like_count: 1, comment_count: 0, is_hidden: true,
  },
]

const BASE = {
  userId: 'u1',
  userInfo: { full_name: 'Huy Pham', avatar_url: null, email: 'huy@example.com' },
  firstName: 'Huy',
  conversationCount: 7,
  bio: 'Yêu du lịch',
  joinedAt: '2024-05-12T00:00:00Z',
  followerCount: 1248,
  followingCount: 56,
  isPremium: false,
  stats: { posts: 2, videos: 1, likes: 1251, savedReviews: 4, savedPlaces: 1, conversations: 7 },
  following: [{ id: 'u2', name: 'Mai Anh', avatarUrl: null }],
}

let fetchMock: ReturnType<typeof vi.fn>

// The assertions below read the EN catalogue, so the locale is STATED rather than inherited:
// jsdom's `navigator.language` was never a product property. The product default is Vietnamese
// (ADR-027), and a test that wants English must say so — same rule as the admin suites.
beforeEach(() => {
  setLocale('en')
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/reviews/mine') return { ok: true, json: async () => ({ reviews: REVIEWS }) }
    if (url === '/api/reviews/liked') return { ok: true, json: async () => ({ reviews: LIKED }) }
    if (url === '/api/reviews/saved') return { ok: true, json: async () => ({ reviews: [] }) }
    if (url === '/api/reviews/shared') return { ok: true, json: async () => ({ reviews: SHARED }) }
    if (url === '/api/reviews/r3-hidden') return { ok: true, json: async () => ({ ok: true }) }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

type HubProps = ComponentProps<typeof ProfileView>
// Typed against the component, not inferred from BASE — the fixture's non-null values would
// otherwise narrow `followerCount` to `number` and reject the null case these tests exist for.
const renderHub = (over: Partial<HubProps> = {}) => render(<ProfileView {...(BASE as HubProps)} {...over} />)

describe('identity comes from the profile row and nothing else', () => {
  it('shows the name, the bio and the join date the server sent', async () => {
    const { container } = renderHub()
    expect(screen.getAllByText('Huy Pham').length).toBeGreaterThan(0)
    expect(screen.getByText('Yêu du lịch')).toBeTruthy()
    expect(within(container.querySelector('[data-profile-info]') as HTMLElement).getByText('huy@example.com')).toBeTruthy()
  })

  it('renders the real follower / following / likes statistics', () => {
    const { container } = renderHub()
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    expect(within(hero).getByText('1,248')).toBeTruthy()
    expect(within(hero).getByText('56')).toBeTruthy()
    expect(within(hero).getByText('1,251')).toBeTruthy()
  })

  it('renders NO statistic the server did not send', () => {
    const { container } = renderHub({ followerCount: null, followingCount: null })
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    expect(hero.querySelectorAll('[data-stat]').length, 'only Likes survives — no zeroed follower row').toBe(1)
  })

  it('lights the Premium badge only on a real active subscription', () => {
    // 🔑 SCOPED TO THE HERO. The V3 shell carries its own "TappyAI Premium" upsell block and a
    // "Wallet / Tappy Points" nav row; a whole-document match would be testing the shell's copy,
    // not this page's claim about the account.
    const { container } = renderHub()
    const hero = () => container.querySelector('[data-profile-hero]') as HTMLElement
    expect(hero().textContent).not.toContain('Premium')
    cleanup()
    const premium = renderHub({ isPremium: true })
    expect((premium.container.querySelector('[data-profile-hero]') as HTMLElement).textContent).toContain('Premium')
  })
})

describe('the mockup fields with no column behind them are absent', () => {
  it('renders no @handle — there is no username column on profiles', () => {
    const { container } = renderHub()
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    expect(hero.textContent ?? '', 'a handle minted from the email is still invented').not.toMatch(/@\w/)
  })

  it('renders no location line — profiles has no city or country column', () => {
    const { container } = renderHub()
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    for (const place of ['Hà Nội', 'Việt Nam', 'Vietnam']) {
      expect(hero.textContent ?? '').not.toContain(place)
    }
  })

  it('offers no cover-photo upload — nothing can store one', () => {
    const { container } = renderHub()
    expect(container.textContent ?? '').not.toMatch(/ảnh bìa|cover photo/i)
  })

  it('shows no points, tier or progress bar — no such table exists', () => {
    // Scoped to the regions this page authors: the hero and the right sidebar. The shell's
    // pre-existing "Wallet / Tappy Points" nav row is not this screen's claim to answer for.
    const { container } = renderHub()
    const mine = [
      container.querySelector('[data-profile-hero]'),
      container.querySelector('[data-profile-info]'),
      container.querySelector('[data-profile-stats]'),
      container.querySelector('[data-profile-following]'),
      container.querySelector('[data-profile-qr]'),
    ].map((el) => el?.textContent ?? '').join(' ')
    for (const claim of ['Points', 'Silver', 'Gold', 'điểm để lên hạng']) {
      expect(mine, `"${claim}" has no model anywhere in this codebase`).not.toContain(claim)
    }
    expect(container.querySelector('progress')).toBeNull()
    expect(container.querySelector('[data-profile-stats] [role="progressbar"]')).toBeNull()
  })

  it('shows no highlights / story rings — there is no collection model', () => {
    const { container } = renderHub()
    expect(container.textContent ?? '').not.toMatch(/khoảnh khắc|highlight/i)
  })

  it('shows no activity feed — the only per-user log is analytics telemetry', () => {
    const { container } = renderHub()
    expect(container.textContent ?? '').not.toMatch(/hoạt động gần đây|recent activity/i)
  })

  it('calls the follow list Following, never Bạn bè — user_follows is directional', () => {
    const { container } = renderHub()
    const card = container.querySelector('[data-profile-following]') as HTMLElement
    expect(card).toBeTruthy()
    expect(card.textContent ?? '').not.toMatch(/bạn bè|friends/i)
    expect(within(card).getByText('Mai Anh')).toBeTruthy()
    // No Follow button: every row here is already followed, so offering one would be a no-op
    // control that misdescribes the relationship.
    expect(card.querySelector('button')).toBeNull()
  })
})

describe('content comes from the gated endpoints, and only from them', () => {
  it('loads posts from /api/reviews/mine', async () => {
    renderHub()
    await waitFor(() => expect(document.querySelector('[data-review="r1"]')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/mine')
  })

  it('never reads the reviews table directly — the safety gate lives in those routes', async () => {
    renderHub()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    for (const [url] of fetchMock.mock.calls) {
      expect(['/api/reviews/mine', '/api/reviews/liked', '/api/reviews/saved', '/api/reviews/shared']).toContain(url)
    }
  })

  it('renders real engagement counts, and the play badge only on a real video', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    const video = container.querySelector('[data-review="r1"]') as HTMLElement
    const photo = container.querySelector('[data-review="r2"]') as HTMLElement
    expect(video.textContent).toContain('12K')   // view_count 12400, video
    expect(video.textContent).toContain('1.2K')  // like_count 1248
    // r2 is content_type 'photo' — its view_count exists but must not be dressed as plays.
    expect(photo.textContent).not.toContain('999')
    expect(photo.textContent).toContain('3')     // like_count
  })

  it('each post links to the real review route', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    expect(container.querySelector('[data-review="r1"]')!.getAttribute('href')).toBe('/reviews/r1')
  })

  it('saved PLACES are a separate surface — a link to /profile/favorites, not a sixth collection', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    const places = container.querySelector('[data-profile-content] [data-profile-places]')
    expect(places?.getAttribute('href')).toBe('/profile/favorites')
    expect(places?.textContent).toContain('Places')
    // The five chips are reviews; `/api/favorites` is never fetched by the collections panel.
    expect(fetchMock).not.toHaveBeenCalledWith('/api/favorites')
    expect(screen.queryByRole('button', { name: 'Places' })).toBeNull()
  })

  it('an empty dataset gets an empty state, never filler cards', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await waitFor(() => expect(screen.getByText("You haven't saved any posts yet.")).toBeTruthy())
    expect(container.querySelectorAll('[data-review]').length).toBe(0)
  })

  it('a failed load says so instead of rendering an empty success, and retry re-reads', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }))
    const { container } = renderHub()
    await waitFor(() => expect(screen.getByText(/didn't load/)).toBeTruthy())
    expect(container.querySelectorAll('[data-review]').length).toBe(0)
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/reviews/mine').length).toBe(1)

    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ reviews: REVIEWS }) }))
    fireEvent.click(container.querySelector('[data-collection-retry]') as HTMLElement)
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/reviews/mine').length).toBe(2)
  })

  it('offers exactly the five personal collections, in the Android order', () => {
    const { container } = renderHub()
    const tabs = [...container.querySelectorAll('[data-profile-content] .v3-chip')].map((c) => c.textContent)
    // Posts / Liked / Saved / Hidden / Shared — the cross-platform contract (see
    // profileCollectionsParity.test.ts). Liked arrived with `/api/reviews/liked` (2026-09-15);
    // what must never come back is a direct `review_likes` read that bypasses publishableFilter().
    expect(tabs).toEqual(['Posts', 'Liked', 'Saved', 'Hidden', 'Shared'])
  })

  it('Posts lists only the public rows of /mine — the hidden row is not a post anyone can see', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    expect(container.querySelectorAll('[data-review]').length).toBe(2)
    expect(container.querySelector('[data-review="r3-hidden"]')).toBeNull()
  })

  it('switches to Liked and renders the liked reviews from /api/reviews/liked', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Liked' }))
    await waitFor(() => expect(container.querySelector('[data-review="liked-1"]')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/liked')
    expect(container.querySelector('[data-review="liked-1"]')!.getAttribute('href')).toBe('/reviews/liked-1')
  })

  it('Hidden is the is_hidden half of /mine — veiled, unlinked, with an unhide action that moves it back to Posts', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Hidden' }))
    await waitFor(() => expect(container.querySelector('[data-review="r3-hidden"]')).toBeTruthy())
    // No second request: Hidden and Posts are two halves of the one /mine payload.
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/reviews/mine').length).toBe(1)
    const tile = container.querySelector('[data-review="r3-hidden"]') as HTMLElement
    expect(tile.getAttribute('data-hidden')).toBe('true')
    expect(tile.getAttribute('href')).toBeNull()               // GET /api/reviews/{id} is 404 for a hidden post
    expect(tile.querySelector('[data-hidden-veil]')?.textContent).toContain('Hidden')
    expect(container.querySelectorAll('[data-review]').length).toBe(1)
    expect(container.querySelector('[data-review="r1"]')).toBeNull()

    fireEvent.click(container.querySelector('[data-unhide="r3-hidden"]') as HTMLElement)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reviews/r3-hidden', expect.objectContaining({ method: 'PATCH' })))
    const [, init] = fetchMock.mock.calls.find(([u]) => u === '/api/reviews/r3-hidden')!
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ is_hidden: false })
    await waitFor(() => expect(screen.getByText("You haven't hidden any posts.")).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Posts' }))
    await waitFor(() => expect(container.querySelectorAll('[data-review]').length).toBe(3))
    expect(container.querySelector('[data-review="r3-hidden"]')?.getAttribute('href')).toBe('/reviews/r3-hidden')
  })

  it('switches to Shared and renders the shared reviews from /api/reviews/shared', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Shared' }))
    await waitFor(() => expect(container.querySelector('[data-review="shared-1"]')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/shared')
    expect(container.querySelector('[data-review="shared-1"]')!.getAttribute('href')).toBe('/reviews/shared-1')
  })
})

describe('the hub stays an account hub, not a replacement for other products', () => {
  it('keeps every row of the shared account inventory reachable', () => {
    const { container } = renderHub()
    const hrefs = [...container.querySelectorAll('.v3-panel li a[href]')].map((a) => a.getAttribute('href'))
    // The routes the SHARED inventory owns (ProfileRows). The Inbox lives in the shell's own
    // Account group, not in this list — asserting it here would test the wrong component.
    for (const route of ['/planner', '/profile/settings', '/profile/history', '/profile/favorites', '/profile/price-watches']) {
      expect(hrefs, `${route} must stay reachable from Profile`).toContain(route)
    }
  })

  it('reuses the existing QR capability rather than drawing a QR of its own', () => {
    const { container } = renderHub()
    expect(container.querySelector('[data-profile-qr]')).toBeTruthy()
    // The real component renders a button that builds the code on demand; there is no inline
    // <svg> QR baked into this page.
    expect(container.querySelector('[data-profile-qr] svg[data-qr]')).toBeNull()
  })

  it('links profile editing at the one real edit route', () => {
    const { container } = renderHub()
    const edits = [...container.querySelectorAll('a[href="/profile/edit"]')]
    expect(edits.length).toBeGreaterThan(0)
  })
})
