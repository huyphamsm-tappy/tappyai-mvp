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

// ── V3 Web · Profile / Me ───────────────────────────────────────────────────
//
// 🚨 THE REFERENCE IS THE VISUAL TARGET; THE SCHEMA DECIDES WHAT MAY BE SAID.
//
// The design shows a cover photo, an @handle, a location line, a 1.250-point balance with a
// progress bar to "Silver", story-ring highlights, an activity feed and a friends list. Audited:
// the cover is real since `profiles.cover_url` (2026-09-15) and renders ONLY when the row has
// one; there is no username column in use, no location column, no points/rewards/tier table
// anywhere in the codebase, no story or highlight model, and `user_follows` is directional.
//
// Those absences are the hard part of this screen, because every one of them is easy to fake and
// looks better faked. This file pins them out. The rest of it proves the REAL data — follower and
// following counts (trigger-maintained columns), likes received, the gated content endpoints, and
// the existing QR capability — is actually rendered.

const REVIEWS = [
  {
    id: 'r1', place_name: 'Cà phê Đà Lạt', body: 'ngon', photos: ['https://cdn/x.jpg'],
    thumbnail: null, content_type: 'video', created_at: '2026-09-01T00:00:00Z',
    rating: 5, like_count: 1248, comment_count: 12, view_count: 12400,
  },
  {
    id: 'r2', place_name: 'Bún bò Huế', body: 'ok', photos: null,
    thumbnail: 'https://cdn/y.jpg', content_type: 'photo', created_at: '2026-08-30T00:00:00Z',
    rating: 4, like_count: 3, comment_count: 0, view_count: 999,
  },
]

const FAVORITES = [
  { id: 'f1', place_id: 'p1', place_name: 'Nhà hàng A', place_address: '12 Lê Lợi, Q1', created_at: '2026-08-01T00:00:00Z' },
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

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/reviews/mine') return { ok: true, json: async () => ({ reviews: REVIEWS }) }
    if (url === '/api/reviews/saved') return { ok: true, json: async () => ({ reviews: [] }) }
    if (url === '/api/favorites') return { ok: true, json: async () => ({ favorites: FAVORITES }) }
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

  it('offers no cover-photo upload HERE — the hub keeps one edit entry point (the avatar badge → /profile/edit)', () => {
    const { container } = renderHub()
    expect(container.textContent ?? '').not.toMatch(/thay ảnh bìa|change cover/i)
    expect(container.querySelector('input[type=file]')).toBeNull()
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
      expect(['/api/reviews/mine', '/api/reviews/saved', '/api/favorites']).toContain(url)
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

  it('switches tabs and loads saved places from /api/favorites', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Places' }))
    await waitFor(() => expect(container.querySelector('[data-place="f1"]')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/favorites')
    expect(container.querySelector('[data-place="f1"]')!.textContent).toContain('Nhà hàng A')
  })

  it('an empty dataset gets an empty state, never filler cards', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await waitFor(() => expect(screen.getByText("You haven't saved any posts yet.")).toBeTruthy())
    expect(container.querySelectorAll('[data-review]').length).toBe(0)
  })

  it('a failed load says so instead of rendering an empty success', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }))
    const { container } = renderHub()
    await waitFor(() => expect(screen.getByText(/didn't load/)).toBeTruthy())
    expect(container.querySelectorAll('[data-review]').length).toBe(0)
  })

  it('offers exactly three tabs — one per gated endpoint', () => {
    const { container } = renderHub()
    const tabs = [...container.querySelectorAll('[data-profile-content] .v3-chip')].map((c) => c.textContent)
    expect(tabs).toEqual(['Posts', 'Saved', 'Places'])
    // No "Liked" tab: review_likes has no gated list endpoint, and reading it directly would
    // bypass publishableFilter() and stripUnservableMedia.
    expect(tabs).not.toContain('Liked')
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

// ── The 2026-09-12 reskin's own behaviour ───────────────────────────────────
//
// Framed surface, dominant hero, pill tabs, a grid/list switch and stacked rail cards. Every
// rule above survived the skin; these pin what the skin added and what it deliberately did not.

describe('the hero after the reskin', () => {
  it('names the user once as the page heading and surfaces the existing change-photo action on the avatar', () => {
    const { container } = renderHub()
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    const h1 = hero.querySelector('h1')!
    expect(h1.textContent).toBe('Huy Pham')
    // The camera badge is a LINK to the one route that owns the avatar picker and upload.
    const badge = within(hero).getByRole('link', { name: /change profile photo|đổi ảnh đại diện/i })
    expect(badge.getAttribute('href')).toBe('/profile/edit')
  })

  it('keeps the banner a gradient when the row has no cover — no image inside it, no cover control', () => {
    const { container } = renderHub()
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    expect(hero.querySelector('.v3-profile-banner img')).toBeNull()
    expect(hero.querySelector('.v3-profile-banner')!.getAttribute('style')).toBeNull()
    expect(hero.textContent ?? '').not.toMatch(/thay ảnh bìa|change cover/i)
  })

  it("shows the user's own cover in the banner when the row carries one — the same profiles.cover_url the Explore profile shows", () => {
    const { container } = renderHub({ coverUrl: 'https://storage.googleapis.com/b/covers/u1-abc.jpg' })
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    const img = hero.querySelector('.v3-profile-banner img[data-profile-cover]') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('covers/u1-abc.jpg')
    // Still no control here; the cover is changed on /profile/edit and the owner's Explore profile.
    expect(hero.textContent ?? '').not.toMatch(/thay ảnh bìa|change cover/i)
  })

  it('renders the edit action and the existing QR/share button in each of the two breakpoint layers', () => {
    const { container } = renderHub()
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    // Two layers (>=sm row, <sm row) are authored; CSS shows one. Each layer holds exactly one edit link.
    const edits = [...hero.querySelectorAll('a[href="/profile/edit"]')].filter(a => (a.textContent ?? '').trim().length > 0)
    expect(edits).toHaveLength(2)
    expect(within(hero).getAllByRole('button', { name: /mã qr trang cá nhân của tôi/i })).toHaveLength(2)
  })
})

describe('the grid / list switch is presentation over the rows already loaded', () => {
  it('re-arranges the same posts without a second fetch, and keeps every link', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    const calls = fetchMock.mock.calls.length
    fireEvent.click(container.querySelector('[data-profile-view="list"]') as HTMLElement)
    // Same rows, same routes, still real badges — nothing was re-fetched.
    expect(fetchMock.mock.calls.length).toBe(calls)
    expect(container.querySelectorAll('[data-review]')).toHaveLength(2)
    expect(container.querySelector('[data-review="r1"]')!.getAttribute('href')).toBe('/reviews/r1')
    expect(container.querySelector('[data-review="r1"]')!.textContent).toContain('12K')
    expect((container.querySelector('[data-profile-view="list"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(container.querySelector('[data-profile-view="grid"]') as HTMLElement)
    expect(container.querySelectorAll('[data-review]')).toHaveLength(2)
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('is not offered on the Places tab — those rows have no media to grid', async () => {
    const { container } = renderHub()
    await waitFor(() => expect(container.querySelector('[data-review="r1"]')).toBeTruthy())
    expect(container.querySelector('[data-profile-view="grid"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Places' }))
    await waitFor(() => expect(container.querySelector('[data-place="f1"]')).toBeTruthy())
    expect(container.querySelector('[data-profile-view="grid"]')).toBeNull()
  })

  it('the switch buttons are not tabs — the tab contract stays three chips', () => {
    const { container } = renderHub()
    for (const b of container.querySelectorAll('[data-profile-view]')) expect(b.classList.contains('v3-chip')).toBe(false)
    expect(container.querySelectorAll('[data-profile-content] .v3-chip')).toHaveLength(3)
  })
})

describe('the rail after the reskin', () => {
  it('links onward only to pages that exist: edit, the Following/Followers page, the QR page', () => {
    const { container } = renderHub()
    const info = container.querySelector('[data-profile-info]') as HTMLElement
    expect(within(info).getByRole('link').getAttribute('href')).toBe('/profile/edit')
    const following = container.querySelector('[data-profile-following]') as HTMLElement
    const links = [...following.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(links).toContain('/social')
    expect(links).toContain('/users/u2')
    const qr = container.querySelector('[data-profile-qr]') as HTMLElement
    expect(within(qr).getByRole('link').getAttribute('href')).toBe('/profile/qr')
    expect(within(qr).getByRole('button', { name: /mã qr trang cá nhân của tôi/i })).toBeTruthy()
  })

  it('draws no download control of its own — the download lives on /profile/qr', () => {
    const { container } = renderHub()
    const qr = container.querySelector('[data-profile-qr]') as HTMLElement
    expect(qr.textContent ?? '').not.toMatch(/tải|download/i)
  })

  it('rail cards are not .v3-panel, so the account-row inventory selector stays exact', () => {
    const { container } = renderHub()
    for (const id of ['info', 'stats', 'following', 'qr']) {
      expect(container.querySelector(`[data-profile-${id}]`)!.classList.contains('v3-panel')).toBe(false)
    }
    const inventory = [...container.querySelectorAll('.v3-panel li a[href]')].map(a => a.getAttribute('href'))
    expect(inventory).not.toContain('/users/u2')
    expect(inventory).not.toContain('/social')
  })

  it('shows the six real counts with icons and nothing gamified', () => {
    const { container } = renderHub()
    const stats = container.querySelector('[data-profile-stats]') as HTMLElement
    expect(stats.querySelectorAll('dd')).toHaveLength(6)
    expect(within(stats).getByText('1,251')).toBeTruthy()
    expect(stats.textContent ?? '').not.toMatch(/points|điểm|deals|chia sẻ|share/i)
  })
})

describe('the frame stays truthful', () => {
  it('has no load-more, no highlights, no activity, no handle, no location, no phone', () => {
    const { container } = renderHub()
    const main = container.querySelector('[data-profile-main]') as HTMLElement
    const rail = container.querySelector('[data-profile-rail]') as HTMLElement
    const mine = (main.textContent ?? '') + ' ' + (rail.textContent ?? '')
    expect(mine).not.toMatch(/xem thêm bài viết|load more|khoảnh khắc|highlight|hoạt động gần đây|recent activity|số điện thoại|phone|tên người dùng|username/i)
    // The owner's own email sits in the info card; a HANDLE would sit in the hero, and there is none.
    const hero = container.querySelector('[data-profile-hero]') as HTMLElement
    expect(hero.textContent ?? '').not.toMatch(/@\w/)
  })

  it('authors no upgrade CTA of its own while Pro is gated (SHOW_PRO_UPGRADE is false)', () => {
    const { container } = renderHub()
    const main = container.querySelector('[data-profile-main]') as HTMLElement
    const rail = container.querySelector('[data-profile-rail]') as HTMLElement
    // The shell's pinned upsell is not this page's claim; the page itself renders none.
    expect((main.textContent ?? '') + (rail.textContent ?? '')).not.toMatch(/nâng cấp ngay|upgrade now/i)
  })
})
