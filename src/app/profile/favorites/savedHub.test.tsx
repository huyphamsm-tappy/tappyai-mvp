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

beforeEach(() => { search = new URLSearchParams(); stubFetch() })
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

  const page = readFileSync('src/app/profile/favorites/page.tsx', 'utf8')

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
    const rows = readFileSync('src/app/profile/ProfileRows.tsx', 'utf8')
    expect(shell).toContain("href: '/profile/favorites'")
    expect(rows, 'Profile links to Saved rather than duplicating the hub').toContain("href: '/profile/favorites'")
  })
})
