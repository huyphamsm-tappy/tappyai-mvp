// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/favorites',
  useSearchParams: () => search,
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

import SavedView from './SavedView'
import { setLocale } from '@/lib/i18n/useTranslation'

// ── V3 Web · Saved ──────────────────────────────────────────────────────────
//
// 🚨 THE HARD REQUIREMENT OF THIS SCREEN IS AN ABSENCE.
//
// The reference lists five saved categories. Two are real. Deals, Sản phẩm and Video have no
// saved data source — Video most deceptively of all, because a saved video IS a `review_saves`
// row and would silently double-count against Bài viết. Every one of the three is trivial to add
// and would look better on screen, so this file pins them out and keeps the counts honest.

const FAVORITES = [
  { id: 'f1', place_id: 'p1', place_name: 'Nhà hàng A', place_address: '12 Lê Lợi', place_type: 'food', created_at: '2026-08-01T00:00:00Z' },
  { id: 'f2', place_id: 'p2', place_name: 'Spa B', place_address: '3 Hai Bà Trưng', place_type: 'spa', created_at: '2026-08-02T00:00:00Z' },
]
const SAVED_POSTS = [
  { id: 'r1', place_name: 'Cà phê Đà Lạt', body: 'ngon', photos: null, thumbnail: null, content_type: 'video', saved_at: '2026-08-05T00:00:00Z' },
  { id: 'r2', place_name: 'Bún bò', body: 'ok', photos: ['https://cdn/a.jpg'], thumbnail: null, content_type: 'photo', saved_at: '2026-08-06T00:00:00Z' },
  { id: 'r3', place_name: null, body: null, photos: null, thumbnail: null, content_type: 'photo', saved_at: '2026-08-07T00:00:00Z' },
]

const USER = { full_name: 'Huy', avatar_url: null, email: 'h@example.com' }
let fetchMock: ReturnType<typeof vi.fn>

function stubFetch(fav: unknown[] = FAVORITES, posts: unknown[] = SAVED_POSTS, ok = true) {
  fetchMock = vi.fn(async (url: string) => {
    if (!ok) return { ok: false, json: async () => ({}) }
    if (url === '/api/favorites') return { ok: true, json: async () => ({ favorites: fav }) }
    if (url === '/api/reviews/saved') return { ok: true, json: async () => ({ reviews: posts }) }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}

// The assertions below read the EN catalogue, so the locale is STATED rather than inherited:
// jsdom's `navigator.language` was never a product property. The product default is Vietnamese
// (ADR-027), and a test that wants English must say so — same rule as the admin suites.
beforeEach(() => { setLocale('en'); search = new URLSearchParams(); stubFetch() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const renderSaved = () => render(<SavedView user={USER} />)
const hub = async () => {
  const r = renderSaved()
  await waitFor(() => expect(r.container.querySelector('[data-saved-hub]')).toBeTruthy())
  return r
}

describe('only the categories with a real saved data source are rendered', () => {
  it('renders exactly two rows — Places and Posts', async () => {
    const { container } = await hub()
    expect([...container.querySelectorAll('[data-saved-category]')].map((a) => a.getAttribute('data-saved-category')))
      .toEqual(['places', 'posts'])
  })

  it('renders NO Deals row — nothing in this product can save a deal', async () => {
    const { container } = await hub()
    expect(container.querySelector('[data-saved-category="deals"]')).toBeNull()
    expect(container.querySelector('[data-saved-hub]')!.textContent ?? '').not.toMatch(/deals/i)
  })

  it('renders NO Products row — there is no product-save model and Marketplace is reserved', async () => {
    const { container } = await hub()
    expect(container.querySelector('[data-saved-category="products"]')).toBeNull()
    expect(container.querySelector('[data-saved-hub]')!.textContent ?? '').not.toMatch(/sản phẩm|products/i)
  })

  it('renders NO Video row — a saved video is a review_saves row and would double-count', async () => {
    // 🚨 THE FIXTURE MAKES THIS CONCRETE: one of the three saved posts has content_type 'video'.
    // A Video row would show 1 and the Posts row would still show 3, describing 3 saves as 4.
    expect(SAVED_POSTS.some((p) => p.content_type === 'video')).toBe(true)
    const { container } = await hub()
    expect(container.querySelector('[data-saved-category="videos"]')).toBeNull()
    expect(container.querySelector('[data-saved-hub]')!.textContent ?? '').not.toMatch(/video/i)
  })

  it('renders no music row either — music_saved is real but has no list endpoint to open', async () => {
    const { container } = await hub()
    expect(container.querySelector('[data-saved-hub]')!.textContent ?? '').not.toMatch(/nhạc|music/i)
  })
})

describe('counts are real, and come from the lists themselves', () => {
  it('shows the length of each fetched dataset', async () => {
    const { container } = await hub()
    expect(container.querySelector('[data-saved-count="places"]')!.textContent).toBe('2')
    expect(container.querySelector('[data-saved-count="posts"]')!.textContent).toBe('3')
  })

  it('shows none of the reference image\'s numbers', async () => {
    const { container } = await hub()
    const text = container.querySelector('[data-saved-hub]')!.textContent ?? ''
    for (const fake of ['56', '132', '24', '18', '37']) {
      expect(text, `${fake} is a number from the mockup, not from this account`).not.toContain(fake)
    }
  })

  it('shows 0 rather than hiding an empty category', async () => {
    stubFetch([], [])
    const { container } = await hub()
    expect(container.querySelectorAll('[data-saved-category]').length, 'both rows still render').toBe(2)
    expect(container.querySelector('[data-saved-count="places"]')!.textContent).toBe('0')
    expect(container.querySelector('[data-saved-count="posts"]')!.textContent).toBe('0')
  })

  it('the count equals the number of items the category actually opens', async () => {
    search = new URLSearchParams('type=posts')
    const { container } = renderSaved()
    await waitFor(() => expect(container.querySelector('[data-saved-post="r1"]')).toBeTruthy())
    // 3 rows listed for the 3 the hub counted — the count is the payload length, so a saved post
    // withheld by publishableFilter() is neither listed nor advertised.
    expect(container.querySelectorAll('[data-saved-post]').length).toBe(3)
  })
})

describe('every row navigates somewhere real', () => {
  it('each category links to a filter on this same route — no new or dead-end pages', async () => {
    const { container } = await hub()
    expect(container.querySelector('[data-saved-category="places"]')!.getAttribute('href')).toBe('/profile/favorites?type=places')
    expect(container.querySelector('[data-saved-category="posts"]')!.getAttribute('href')).toBe('/profile/favorites?type=posts')
  })

  it('the places view lists saved places and links each to its service page', async () => {
    search = new URLSearchParams('type=places')
    const { container } = renderSaved()
    await waitFor(() => expect(container.querySelector('[data-saved-place="p1"]')).toBeTruthy())
    expect(container.querySelectorAll('[data-saved-place]').length).toBe(2)
    const href = within(container.querySelector('[data-saved-place="p1"]') as HTMLElement)
      .getByRole('link').getAttribute('href')!
    expect(href.startsWith('/service/')).toBe(true)
    expect(href).toContain('placeId=p1')
  })

  it('the posts view links each saved post to the real review route', async () => {
    search = new URLSearchParams('type=posts')
    const { container } = renderSaved()
    await waitFor(() => expect(container.querySelector('[data-saved-post="r1"]')).toBeTruthy())
    expect(within(container.querySelector('[data-saved-post="r1"]') as HTMLElement)
      .getByRole('link').getAttribute('href')).toBe('/reviews/r1')
  })

  it('a category view offers the way back to the hub', async () => {
    search = new URLSearchParams('type=posts')
    const { container } = renderSaved()
    await waitFor(() => expect(container.querySelector('[data-saved-category-view]')).toBeTruthy())
    const back = within(container.querySelector('[data-saved-category-view]') as HTMLElement)
      .getAllByRole('link').find((a) => a.getAttribute('href') === '/profile/favorites')
    expect(back, 'the back control must return to the hub').toBeTruthy()
  })

  it('an unknown ?type falls back to the hub instead of an empty screen', async () => {
    search = new URLSearchParams('type=deals')
    const { container } = renderSaved()
    await waitFor(() => expect(container.querySelector('[data-saved-hub]')).toBeTruthy())
    expect(container.querySelector('[data-saved-category-view]')).toBeNull()
  })
})

describe('empty and failure states say what is true', () => {
  it('an empty category gets an empty state and a REAL discovery route', async () => {
    stubFetch([], [])
    search = new URLSearchParams('type=places')
    const { container } = renderSaved()
    await waitFor(() => expect(container.querySelector('[data-saved-category-view]')).toBeTruthy())
    const view = container.querySelector('[data-saved-category-view]') as HTMLElement
    expect(within(view).getByText('Nothing saved yet')).toBeTruthy()
    expect(within(view).getAllByRole('link').some((a) => a.getAttribute('href') === '/reviews')).toBe(true)
    // No filler cards standing in for content.
    expect(container.querySelectorAll('[data-saved-place]').length).toBe(0)
  })

  it('a failed load reports a failure rather than an empty library', async () => {
    stubFetch([], [], false)
    const { container } = renderSaved()
    await waitFor(() => expect(screen.getByText(/Couldn't load your saved items/)).toBeTruthy())
    expect(container.querySelector('[data-saved-hub]')).toBeNull()
  })
})

describe('the data boundary is unchanged', () => {
  it('reads the two existing gated endpoints and nothing else', async () => {
    await hub()
    const urls = fetchMock.mock.calls.map(([u]) => u).sort()
    expect(urls).toEqual(['/api/favorites', '/api/reviews/saved'])
  })

  const page = readFileSync('src/app/(app)/profile/favorites/page.tsx', 'utf8')

  it('the route is auth-gated on the server before anything renders', () => {
    expect(page).toMatch(/getUser\(\)/)
    expect(page).toMatch(/redirect\('\/login/)
  })

  it('the page reads no saved content of its own — the filters live in the endpoints', () => {
    // A server-side read of `favorites` or `review_saves` here would be a second place for RLS
    // and the publication gate to be got wrong.
    expect(page).not.toMatch(/from\('favorites'\)/)
    expect(page).not.toMatch(/from\('review_saves'\)/)
    expect(page).not.toMatch(/from\('reviews'\)/)
  })

  it('the existing Saved navigation still points here', () => {
    const shell = readFileSync('src/components/v3/V3Shell.tsx', 'utf8')
    const rows = readFileSync('src/app/(app)/profile/ProfileRows.tsx', 'utf8')
    // P2c (owner, 2026-09-28): the sidebar row was removed; the Profile hub row is the way in.
    expect(shell).not.toContain("href: '/profile/favorites'")
    expect(rows,'Profile links to Saved rather than duplicating the hub').toContain("href: '/profile/favorites'")
  })
})

// ── Owner reference 2026-09-28: hero + chips + two count cards + empty-state card ──────────────

describe('the 2026-09-28 Saved layout', () => {
  it('renders the hero heading and subtitle', async () => {
    const { container } = await hub()
    const hero = container.querySelector('[data-saved-hero]') as HTMLElement
    expect(within(hero).getByRole('heading', { level: 2 }).textContent).toBe('The things you love 💙')
    expect(hero.textContent).toContain("Every place, post and tip you've saved lives here")
  })

  it('renders the six chips in the reference order; four link, Deals and Collections are disabled', async () => {
    const { container } = await hub()
    const chips = [...container.querySelectorAll('[data-saved-filters] [data-saved-chip]')]
    expect(chips.map((c) => c.getAttribute('data-saved-chip')))
      .toEqual(['all', 'places', 'posts', 'videos', 'deals', 'collections'])
    const href = (k: string) => container.querySelector(`[data-saved-chip="${k}"]`)!.getAttribute('href')
    expect(href('all')).toBe('/profile/favorites')
    expect(href('places')).toBe('/profile/favorites?type=places')
    expect(href('posts')).toBe('/profile/favorites?type=posts')
    expect(href('videos')).toBe('/profile/favorites?type=videos')
    for (const k of ['deals', 'collections']) {
      const chip = container.querySelector(`[data-saved-chip="${k}"]`)!
      // No data source exists: never a link, always marked disabled / coming soon.
      expect(chip.tagName).toBe('SPAN')
      expect(chip.getAttribute('href')).toBeNull()
      expect(chip.getAttribute('aria-disabled')).toBe('true')
      expect(chip.textContent).toContain('Soon')
    }
  })

  it('marks the chip for the current view as active', async () => {
    const { container } = await hub()
    expect(container.querySelector('[data-saved-chip="all"]')!.getAttribute('aria-current')).toBe('page')
    cleanup()
    search = new URLSearchParams('type=places')
    const r = renderSaved()
    await waitFor(() => expect(r.container.querySelector('[data-saved-category-view]')).toBeTruthy())
    expect(r.container.querySelector('[data-saved-chip="places"]')!.getAttribute('aria-current')).toBe('page')
    expect(r.container.querySelector('[data-saved-chip="all"]')!.getAttribute('aria-current')).toBeNull()
  })

  it('the count cards carry the reference copy', async () => {
    const { container } = await hub()
    const places = container.querySelector('[data-saved-category="places"]') as HTMLElement
    const posts = container.querySelector('[data-saved-category="posts"]') as HTMLElement
    expect(places.textContent).toContain('Favourite places')
    expect(places.textContent).toContain('restaurants, cafés, spas')
    expect(posts.textContent).toContain('Posts, guides, reviews')
  })

  it('the Video chip is a filter over saved posts: only video posts, no separate count', async () => {
    search = new URLSearchParams('type=videos')
    const { container } = renderSaved()
    await waitFor(() => expect(container.querySelector('[data-saved-category-view]')).toBeTruthy())
    expect([...container.querySelectorAll('[data-saved-post]')].map((e) => e.getAttribute('data-saved-post'))).toEqual(['r1'])
    expect(container.querySelector('[data-saved-count="videos"]')).toBeNull()
  })

  it('shows the empty-state card with an Explore CTA when nothing is saved', async () => {
    stubFetch([], [])
    const { container } = await hub()
    const empty = container.querySelector('[data-saved-empty]') as HTMLElement
    expect(empty).toBeTruthy()
    expect(within(empty).getByRole('heading').textContent).toBe('Nothing saved yet')
    const cta = within(empty).getByRole('link', { name: /Start exploring/ })
    expect(cta.getAttribute('href')).toBe('/reviews')
  })

  it('shows no empty-state card when something is saved', async () => {
    const { container } = await hub()
    expect(container.querySelector('[data-saved-empty]')).toBeNull()
  })

  it('speaks the reference Vietnamese copy', async () => {
    setLocale('vi')
    stubFetch([], [])
    const { container } = await hub()
    expect(container.querySelector('[data-saved-hero] h2')!.textContent).toBe('Những điều bạn yêu thích 💙')
    const chipText = [...container.querySelectorAll('[data-saved-chip]')].map((c) => c.textContent)
    expect(chipText.slice(0, 4)).toEqual(['Tất cả', 'Địa điểm', 'Bài viết', 'Video'])
    expect(chipText[5]).toContain('Bộ sưu tập')
    const empty = container.querySelector('[data-saved-empty]') as HTMLElement
    expect(empty.textContent).toContain('Chưa có gì được lưu')
    expect(empty.textContent).toContain('Hãy bắt đầu khám phá')
    expect(within(empty).getByRole('link').textContent).toContain('Khám phá ngay')
    expect(container.querySelector('[data-saved-category="places"]')!.textContent).toContain('địa điểm')
  })
})
