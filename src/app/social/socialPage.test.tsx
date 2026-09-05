// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/social',
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

import SocialView from './SocialView'

// ── Friends / Social ────────────────────────────────────────────────────────
//
// 🚨 THE REFERENCE DESIGN IS A FRIEND NETWORK. THE BACKEND IS ONE DIRECTIONAL
// FOLLOW TABLE. Most of this file exists to pin the gap rather than paper over
// it: no friend requests, no mutual-connection counts, no people recommender, no
// contact sync, no @handles. Each of those is a claim about a person, printed
// next to their face, that this product cannot substantiate.

const person = (over: Record<string, unknown> = {}) => ({
  id: 'u2', full_name: 'Mai Anh', avatar_url: null,
  follower_count: 4, following_count: 2, is_following: false,
  ...over,
})

const me = { full_name: 'Huy', avatar_url: null, email: 'h@x.com' }

let routes: Record<string, unknown>
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = Object.keys(routes).find(k => String(url).startsWith(k))
  const body = key ? routes[key] : { users: [] }
  const value = typeof body === 'function' ? (body as (u: string, i?: RequestInit) => unknown)(String(url), init) : body
  return { ok: true, status: 200, json: async () => value } as Response
})

beforeEach(() => {
  fetchMock.mockClear()
  routes = {
    '/api/social/connections?type=following': { users: [] },
    '/api/social/connections?type=followers': { users: [] },
    '/api/users/search': { users: [] },
  }
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const renderPage = () => render(<SocialView user={me} />)

describe('access', () => {
  it('asks a signed-out visitor to sign in, and fetches nothing', () => {
    render(<SocialView user={undefined} />)
    expect(screen.getByText(/đăng nhập để kết nối|sign in to connect/i)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the two directions of the follow graph', () => {
  it('opens on Following and reads that direction', async () => {
    renderPage()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/social/connections?type=following'))
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  })

  it('reads the other direction when the Followers tab is chosen', async () => {
    renderPage()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    fireEvent.click(screen.getAllByRole('tab')[1])
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/social/connections?type=followers'))
  })

  it('never labels either direction "Bạn bè"', () => {
    // 🚨 `user_follows` is one-directional. Calling a follow a friendship is a
    // claim about a relationship the data does not describe.
    const { container } = renderPage()
    expect(container.textContent ?? '').not.toMatch(/bạn bè chung|là bạn bè|friends?\b/i)
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.textContent ?? '').not.toMatch(/bạn bè|friend/i)
    }
  })
})

describe('real lists, real empty states', () => {
  it('renders people the server returned', async () => {
    routes['/api/social/connections?type=following'] = { users: [person({ full_name: 'Mai Anh' })] }
    renderPage()
    expect(await screen.findByText('Mai Anh')).toBeTruthy()
  })

  it('shows a compact empty state and offers no invented action', async () => {
    renderPage()
    expect(await screen.findByText(/bạn chưa theo dõi ai|not following anyone/i)).toBeTruthy()
    // No "invite friends", no "sync contacts" — neither exists.
    expect(screen.queryByText(/đồng bộ|sync|mời bạn|invite/i)).toBeNull()
  })

  it('reports a failure instead of showing an empty list', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) } as Response))
    renderPage()
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

describe('search reuses the existing endpoint', () => {
  it('waits for two characters before asking', async () => {
    renderPage()
    const box = screen.getByRole('searchbox', { name: /tìm bạn|find people/i })
    fireEvent.change(box, { target: { value: 'a' } })
    await new Promise(r => setTimeout(r, 450))
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/api/users/search'))).toBe(false)
  })

  it('searches real users and renders them', async () => {
    routes['/api/users/search'] = { users: [person({ id: 'u9', full_name: 'Quốc Duy' })] }
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: /tìm bạn|find people/i }), { target: { value: 'quoc' } })
    expect(await screen.findByText('Quốc Duy')).toBeTruthy()
    expect(fetchMock.mock.calls.some(c => String(c[0]).startsWith('/api/users/search?q=quoc'))).toBe(true)
  })
})

describe('the follow button performs a real mutation', () => {
  it('POSTs to the existing endpoint and renders the SERVER’s answer', async () => {
    // Driven from search, which is how someone actually follows a new person —
    // and the one list whose membership the mutation does not change.
    routes['/api/users/search'] = { users: [person({ is_following: false, follower_count: 4 })] }
    routes['/api/users/u2/follow'] = { following: true, follower_count: 5 }
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: /tìm bạn|find people/i }), { target: { value: 'mai' } })
    await screen.findByText('Mai Anh')

    // Name AND pressed-state: the shell's theme toggle also carries `aria-pressed`,
    // and the quick-action rows carry similar words. Together these match one node.
    const btn = screen.getByRole('button', { pressed: false, name: /^(theo dõi|follow)$/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users/u2/follow', { method: 'POST' })
    })

    // 🚨 The endpoint TOGGLES — insert, or delete on conflict — so the client
    // cannot know the outcome in advance. The button and the count both render
    // what the server reported, not a guess made before the request went out.
    await waitFor(() => {
      expect(screen.getByRole('button', { pressed: true, name: /đang theo dõi|following/i })).toBeTruthy()
    })
    expect(screen.getByText(/5 người theo dõi|5 followers/i)).toBeTruthy()
  })

  it('re-reads the Following list after a follow, rather than patching membership', async () => {
    // 🔑 Whether someone belongs in that list is the server's answer, and so is
    // its order. The client invalidates instead of splicing a row in.
    routes['/api/users/search'] = { users: [person({ is_following: false })] }
    routes['/api/users/u2/follow'] = { following: true, follower_count: 5 }
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: /tìm bạn|find people/i }), { target: { value: 'mai' } })
    await screen.findByText('Mai Anh')

    const before = fetchMock.mock.calls.filter(c => String(c[0]).includes('type=following')).length
    fireEvent.click(screen.getByRole('button', { pressed: false, name: /^(theo dõi|follow)$/i }))

    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(c => String(c[0]).includes('type=following')).length
      expect(after).toBeGreaterThan(before)
    })
  })
})

describe('nothing on this page is invented', () => {
  const source = readFileSync('src/app/social/SocialView.tsx', 'utf8')
  const card = readFileSync('src/components/social/PersonCard.tsx', 'utf8')
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('renders no friend-request UI, because friend requests do not exist', async () => {
    renderPage()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText(/lời mời|chấp nhận|accept|reject/i)).toBeNull()
  })

  it('renders no mutual-connection count, because the graph cannot produce one', () => {
    // The reference puts "12 bạn chung" on every card. `user_follows` is
    // directional and there is no friendship model, so the honest version of
    // that number does not exist.
    expect(/bạn chung|mutual/i.test(code(source) + code(card))).toBe(false)
  })

  it('renders no @handle, because `profiles` has no username column', () => {
    expect(/@\{|username/i.test(code(card))).toBe(false)
  })

  it('offers no contact sync and no interest communities', () => {
    expect(/danh bạ|contact|đồng bộ|yêu du lịch|community|cộng đồng người/i.test(code(source))).toBe(false)
  })

  it('calls only endpoints that already exist', () => {
    const urls = [...code(source).matchAll(/['"`](\/api\/[^'"`?]+)/g)].map(m => m[1])
    const allowed = ['/api/social/connections', '/api/users/search']
    for (const u of urls) expect(allowed, `${u} is not an audited endpoint`).toContain(u)
    // The card owns the one mutation, and it is the endpoint that already ships.
    expect(code(card)).toContain('/api/users/${person.id}/follow')
  })

  it('uses i18n for every user-facing string', () => {
    // The Vietnamese ratchet enforces this repo-wide; this states it locally so
    // the page cannot drift on its own.
    const vietnamese = code(source).split('\n').filter(l => /[À-ỹ]/.test(l))
    expect(vietnamese, 'user-facing text belongs in src/lib/i18n').toEqual([])
  })
})
