// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import PublicProfileView from './PublicProfileView'

// ─────────────────────────────────────────────────────────────────────────────
// The Explore profile V2 — one page, two modes, one identity.
//
// VISITOR: public identity (name, avatar, bio + cover when the row has them),
//          public posts, public shares, Follow. No private tab — not an empty
//          one, none — and no request for private data, ever.
// OWNER:   the same public identity; Edit Profile, the cover controls, and the
//          private activity (liked / saved / hidden) loaded ONLY when the owner
//          opens that tab, through the owner's own id.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} data-fill={p.fill ? '1' : undefined} {...Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('data-')))} /> }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={typeof href === 'string' ? href : '#'} {...Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-') || k.startsWith('aria-') || k === 'className'))}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/users/author-1' }))
// The shell is real in the app; here it is reduced to its two slots so the page's own
// composition is what the assertions see. A source contract below pins the real import.
vi.mock('@/components/v3/V3Shell', () => ({ default: ({ header, children }: any) => <div data-shell><div data-shell-header>{header}</div>{children}</div>, V3Footer: () => null }))
vi.mock('@/components/NotificationProvider', () => ({ useNotifications: () => ({ unreadCount: 0 }) }))

// A Supabase fake that RECORDS which table was read with which user id, and answers
// from fixtures — so "private data is scoped to the owner" is measured, not assumed.
const db = vi.hoisted(() => ({
  likes: [] as { review_id: string }[],
  saves: [] as { review_id: string }[],
  reviews: [] as any[],
  fail: null as null | 'review_likes' | 'review_saves' | 'reviews',
  reads: [] as { table: string; eq: [string, unknown][] }[],
  reset() { this.likes = []; this.saves = []; this.reviews = []; this.fail = null; this.reads = [] },
}))
vi.mock('@/lib/supabase/client', () => {
  const builder = (table: string) => {
    const rec = { table, eq: [] as [string, unknown][] }
    let ids: string[] | null = null
    db.reads.push(rec)
    const b: any = {
      select: () => b, or: () => b, order: () => b, limit: () => b,
      eq: (c: string, v: unknown) => { rec.eq.push([c, v]); return b },
      in: (_c: string, v: string[]) => { ids = v; return b },
      then: (res: any) => {
        if (db.fail === table) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res)
        const data = table === 'review_likes' ? db.likes : table === 'review_saves' ? db.saves
          : table === 'reviews' ? db.reviews.filter(r => !ids || ids.includes(r.id)) : []
        return Promise.resolve({ data, error: null }).then(res)
      },
    }
    return b
  }
  return { createClient: () => ({ from: builder, auth: { getUser: async () => ({ data: { user: null } }) } }) }
})
vi.mock('@/lib/tracking/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/userMemory', () => ({ getUserPreferences: vi.fn().mockResolvedValue(null), logUserEvent: vi.fn(), inferPreferencesFromEvents: vi.fn() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => <div data-testid="video-player" /> }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('@/app/reviews/ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('@/app/reviews/SoundSheet', () => ({ default: () => null }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/modules/music', () => ({ useMusicTrack: () => ({ track: null, loading: false }), getPreviewUrl: (t: any) => t?.previewUrl ?? '' }))

const AUTHOR = 'author-1'
const VISITOR = { id: 'viewer-9', avatarUrl: null }
const OWNER = { id: AUTHOR, avatarUrl: null }
const mk = (id: string, place: string, user = AUTHOR) => ({
  id, user_id: user, place_name: place, place_address: null, rating: 5, body: 'b ' + id,
  photos: null, like_count: 0, comment_count: 0, save_count: 0, created_at: '2026-09-01T00:00:00Z',
  liked_by_me: false, saved_by_me: false, profiles: { full_name: 'Huy Phạm', avatar_url: null },
  content_type: 'video', media_url: 'https://x/' + id + '.mp4', thumbnail: 't-' + id + '.jpg', source_type: 'upload', source_url: null,
})

type Fetches = {
  profile?: Record<string, unknown>
  reviews?: unknown[]
  mine?: unknown[] | 'fail'
  follow?: { status: number; body?: unknown }
  cover?: { status: number; body?: unknown }
  patch?: { status: number; body?: unknown }
}
const calls: { method: string; url: string; body?: any }[] = []
const called = (method: string, path: string) => calls.some(c => c.method === method && c.url.includes(path))
function stubFetch({ profile = {}, reviews = [], mine = [], follow = { status: 200, body: { following: true, follower_count: 1 } }, cover = { status: 200, body: { cover_url: 'https://storage.googleapis.com/b/covers/author-1-new.jpg' } }, patch = { status: 200, body: { ok: true } } }: Fetches) {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: any, opts?: any) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'
    calls.push({ method, url: u, body: opts?.body })
    const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as any
    if (u.includes('/follow')) return reply(follow.status, follow.body ?? {})
    if (u.includes('/api/users/')) return reply(200, { full_name: 'Huy Phạm', avatar_url: null, follower_count: 3, following_count: 1, review_count: 2, is_following: false, ...profile })
    if (u.includes('/api/reviews/feed')) return reply(200, { reviews })
    if (u.includes('/api/reviews/mine')) return mine === 'fail' ? reply(500, {}) : reply(200, { reviews: mine })
    if (u === '/api/profile' && method === 'POST') return reply(cover.status, cover.body ?? {})
    if (u === '/api/profile' && method === 'PATCH') return reply(patch.status, patch.body ?? {})
    if (u.startsWith('/api/reviews/') && method === 'PATCH') return reply(patch.status, patch.body ?? {})
    return reply(200, {})
  }))
}

const tabs = () => screen.getAllByRole('tab')
const tabByKey = (k: string) => document.querySelector(`[data-pp-tab="${k}"]`) as HTMLButtonElement
const tiles = () => document.querySelectorAll('[data-pp-grid] [data-pp-tile]')
const privateReads = () => db.reads.filter(r => r.table === 'review_likes' || r.table === 'review_saves')

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

beforeEach(() => {
  db.reset()
  ;(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {})
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('VISITOR — public identity and public content only', () => {
  it('loads identity and real counts from the existing public endpoints; nothing invented', async () => {
    stubFetch({ reviews: [mk('p1', 'Quán Bún Bò'), mk('s1', 'Chia sẻ')] })
    render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Huy Phạm')).toBeTruthy())
    expect(called('GET', `/api/users/${AUTHOR}`)).toBe(true)
    expect(called('GET', `/api/reviews/feed?userId=${AUTHOR}`)).toBe(true)
    const stats = document.querySelector('[data-pp-stats]')!.textContent
    expect(stats).toContain('v3.publicProfile.posts2')
    expect(stats).toContain('v3.publicProfile.followers3')
    expect(stats).toContain('v3.publicProfile.following1')
    expect(document.querySelector('[data-public-profile]')!.getAttribute('data-mode')).toBe('visitor')
    // No fabricated handle, no bio the row does not carry.
    expect(document.querySelector('[data-pp-identity]')!.textContent).not.toMatch(/@\w/)
    expect(document.querySelector('[data-pp-bio]')).toBeNull()
  })

  it('shows the bio only when the profile row carries one', async () => {
    stubFetch({ profile: { bio: 'Ăn để sống, sống để ăn.' }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-bio]')!.textContent).toBe('Ăn để sống, sống để ăn.'))
  })

  it('public posts render as a media grid from real rows', async () => {
    stubFetch({ reviews: [mk('p1', 'Quán Bún Bò'), mk('p2', 'Cơm Tấm')] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(2))
    expect(tabByKey('posts').textContent).toBe('v3.publicProfile.tabPosts2')
  })

  it('public shares (share-only posts) get their own tab and count', async () => {
    stubFetch({ reviews: [mk('p1', 'Quán Bún Bò'), mk('s1', 'Chia sẻ')] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(tabByKey('shares'))
    await waitFor(() => expect(tabByKey('shares').getAttribute('aria-selected')).toBe('true'))
    expect(tiles()).toHaveLength(1)
    expect(tabByKey('shares').textContent).toBe('v3.publicProfile.tabShares1')
  })

  it('has NO liked, saved or hidden tab, and never asks for them (a second user, not the owner)', async () => {
    stubFetch({ reviews: [mk('p1', 'Quán')] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Huy Phạm')).toBeTruthy())
    expect(tabs().map(t => t.getAttribute('data-pp-tab'))).toEqual(['posts', 'shares'])
    expect(document.body.textContent).not.toMatch(/tabLiked|tabSaved|tabHidden|emptyLiked|emptySaved|emptyHidden|privateNote/)
    expect(privateReads()).toHaveLength(0)
    expect(called('GET', '/api/reviews/mine')).toBe(false)
  })

  it('a hidden or held post is never shown as public — the feed does not serve it and a held row is dropped', async () => {
    stubFetch({ reviews: [{ ...mk('p1', 'Quán'), publication_state: 'UNDER_REVIEW' }, { ...mk('p2', 'Quán 2'), publication_state: 'PUBLISHED' }, mk('p3', 'Quán 3')] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(2))
    // The visitor URL carries only the public feed query — no hidden flag, no private table.
    expect(calls.every(c => !/is_hidden|review_saves|review_likes|\/mine/.test(c.url))).toBe(true)
  })

  it('cannot reach a private section by state manipulation — the private tabs do not exist for a visitor', async () => {
    stubFetch({ reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Huy Phạm')).toBeTruthy())
    expect(tabByKey('liked')).toBeNull()
    expect(tabByKey('saved')).toBeNull()
    expect(tabByKey('hidden')).toBeNull()
    expect(document.querySelector('[data-pp-cover-change]')).toBeNull()
    expect(document.querySelector('[data-pp-edit]')).toBeNull()
  })

  it('truthful empty states per public section; opens on the section that has content', async () => {
    stubFetch({ reviews: [] })
    const { unmount } = render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-empty="posts"]')).toBeTruthy())
    expect(screen.getByText('v3.publicProfile.emptyPosts')).toBeTruthy()
    fireEvent.click(tabByKey('shares'))
    await waitFor(() => expect(screen.getByText('v3.publicProfile.emptyShares')).toBeTruthy())
    unmount()
    stubFetch({ reviews: [mk('s1', 'Chia sẻ')] })
    render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    await waitFor(() => expect(tabByKey('shares').getAttribute('aria-selected')).toBe('true'))
  })

  it('load failure is stated, not faked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as any))
    render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('reviews.profileLoadError')).toBeTruthy())
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('FOLLOW — the existing system', () => {
  it('a signed-in visitor follows through the existing endpoint; the server\'s answer wins', async () => {
    stubFetch({ reviews: [], follow: { status: 200, body: { following: true, follower_count: 4 } } })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    fireEvent.click(await screen.findByText('reviews.follow'))
    await waitFor(() => expect(screen.getByText('reviews.following')).toBeTruthy())
    expect(called('POST', `/api/users/${AUTHOR}/follow`)).toBe(true)
    expect(document.querySelector('[data-pp-stats]')!.textContent).toContain('v3.publicProfile.followers4')
  })

  it('already following renders the quiet state', async () => {
    stubFetch({ profile: { is_following: true }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('reviews.following')).toBeTruthy())
    expect(document.querySelector('[data-pp-follow]')!.getAttribute('data-on')).toBe('true')
  })

  it('a failed follow rolls back (fetch resolves on 5xx — the status is the verdict)', async () => {
    stubFetch({ reviews: [], follow: { status: 500 } })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    fireEvent.click(await screen.findByText('reviews.follow'))
    await waitFor(() => expect(screen.getByText('reviews.follow')).toBeTruthy())
    expect(document.querySelector('[data-pp-stats]')!.textContent).toContain('v3.publicProfile.followers3')
  })

  it('a signed-out (or anonymous-session) visitor is sent to login with the profile as the return path', async () => {
    stubFetch({ reviews: [] })
    const href = vi.fn()
    Object.defineProperty(window, 'location', { value: { get href() { return '' }, set href(v: string) { href(v) } }, writable: true, configurable: true })
    render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    fireEvent.click(await screen.findByText('reviews.follow'))
    expect(href).toHaveBeenCalledWith('/login?returnTo=' + encodeURIComponent(`/users/${AUTHOR}`))
    expect(called('POST', '/follow')).toBe(false)
  })

  it('a 403 from the server (anonymous session) also routes to login', async () => {
    stubFetch({ reviews: [], follow: { status: 403, body: { error: 'account_required' } } })
    const href = vi.fn()
    Object.defineProperty(window, 'location', { value: { get href() { return '' }, set href(v: string) { href(v) } }, writable: true, configurable: true })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    fireEvent.click(await screen.findByText('reviews.follow'))
    await waitFor(() => expect(href).toHaveBeenCalledWith('/login?returnTo=' + encodeURIComponent(`/users/${AUTHOR}`)))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('OWNER — the same page with the owner\'s own activity unlocked', () => {
  const ownerFixtures = () => {
    db.reviews = [mk('L1', 'Bún Chả', 'other-1'), mk('L2', 'Phở', 'other-2'), mk('S1', 'Cafe', 'other-3')]
    db.likes = [{ review_id: 'L1' }, { review_id: 'L2' }]
    db.saves = [{ review_id: 'S1' }]
    stubFetch({
      profile: { is_self: true, cover_url: null },
      reviews: [mk('p1', 'Quán'), mk('s1', 'Chia sẻ')],
      mine: [{ ...mk('p1', 'Quán'), is_hidden: false }, { ...mk('h1', 'Quán ẩn'), is_hidden: true }, { ...mk('s1', 'Chia sẻ'), is_hidden: false }],
    })
  }

  it('owner mode: Edit Profile instead of Follow, and the five sections in order', async () => {
    ownerFixtures()
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('v3.publicProfile.edit')).toBeTruthy())
    expect(document.querySelector('[data-public-profile]')!.getAttribute('data-mode')).toBe('owner')
    expect(screen.queryByText('reviews.follow')).toBeNull()
    expect(document.querySelector('[data-pp-edit]')!.getAttribute('href')).toBe('/profile/edit')
    expect(tabs().map(t => t.getAttribute('data-pp-tab'))).toEqual(['posts', 'liked', 'saved', 'hidden', 'shares'])
    expect(tabs().filter(t => t.getAttribute('data-private') === 'true')).toHaveLength(3)
  })

  it('the public posts the owner sees are the public list — a held post is not shown as public', async () => {
    db.reviews = []
    stubFetch({ profile: { is_self: true }, reviews: [{ ...mk('p1', 'Quán'), publication_state: 'UNDER_REVIEW' }, mk('p2', 'Quán 2')] })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    expect(document.querySelector('[data-pp-stats]')!.textContent).toContain('v3.publicProfile.posts1')
  })

  it('loads private sections ON DEMAND only — nothing private is fetched before a tab is opened', async () => {
    ownerFixtures()
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    expect(privateReads()).toHaveLength(0)
    expect(called('GET', '/api/reviews/mine')).toBe(false)
    // A private count is not shown until it is known — never a 0 standing in for "not loaded".
    expect(tabByKey('liked').querySelector('.v3-pp-tab-n')).toBeNull()
    expect(tabByKey('posts').querySelector('.v3-pp-tab-n')!.textContent).toBe('1')
  })

  it('Đã thích: the owner\'s own likes, read with the OWNER\'s id, shown with a count once loaded', async () => {
    ownerFixtures()
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(tabByKey('liked'))
    await waitFor(() => expect(tiles()).toHaveLength(2))
    const read = db.reads.find(r => r.table === 'review_likes')!
    expect(read.eq).toEqual([['user_id', AUTHOR]])
    expect(tabByKey('liked').querySelector('.v3-pp-tab-n')!.textContent).toBe('2')
    expect(screen.getByText('v3.publicProfile.privateNote')).toBeTruthy()
    // Loaded once; reopening the tab does not refetch.
    fireEvent.click(tabByKey('posts'))
    fireEvent.click(tabByKey('liked'))
    await waitFor(() => expect(tiles()).toHaveLength(2))
    expect(db.reads.filter(r => r.table === 'review_likes')).toHaveLength(1)
  })

  it('Đã lưu: the owner\'s saves, scoped to the owner', async () => {
    ownerFixtures()
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(tabByKey('saved'))
    await waitFor(() => expect(tiles()).toHaveLength(1))
    expect(within(tiles()[0] as HTMLElement).getByRole('button', { name: 'Cafe' })).toBeTruthy()
    expect(db.reads.find(r => r.table === 'review_saves')!.eq).toEqual([['user_id', AUTHOR]])
  })

  it('Đã ẩn: only the hidden rows of the self-scoped /api/reviews/mine, with a show-again action', async () => {
    ownerFixtures()
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(tabByKey('hidden'))
    await waitFor(() => expect(tiles()).toHaveLength(1))
    expect(called('GET', '/api/reviews/mine')).toBe(true)
    expect(within(tiles()[0] as HTMLElement).getByRole('button', { name: 'Quán ẩn' })).toBeTruthy()
    // Show again → the existing PATCH; the post moves back to the public list.
    fireEvent.click(document.querySelector('[data-pp-hide-toggle="show"]')!)
    await waitFor(() => expect(tiles()).toHaveLength(0))
    const patch = calls.find(c => c.method === 'PATCH' && c.url === '/api/reviews/h1')!
    expect(JSON.parse(patch.body)).toEqual({ is_hidden: false })
    fireEvent.click(tabByKey('posts'))
    await waitFor(() => expect(tiles()).toHaveLength(2))
  })

  it('hide from Bài đăng moves the post to Đã ẩn; a failed PATCH puts it back', async () => {
    ownerFixtures()
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(document.querySelector('[data-pp-hide-toggle="hide"]')!)
    await waitFor(() => expect(tiles()).toHaveLength(0))
    expect(JSON.parse(calls.find(c => c.method === 'PATCH' && c.url === '/api/reviews/p1')!.body)).toEqual({ is_hidden: true })
    cleanup()
    // Failure path.
    db.reset(); ownerFixtures()
    stubFetch({ profile: { is_self: true }, reviews: [mk('p1', 'Quán')], patch: { status: 500 } })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(document.querySelector('[data-pp-hide-toggle="hide"]')!)
    await waitFor(() => expect(calls.some(c => c.method === 'PATCH')).toBe(true))
    await waitFor(() => expect(tiles()).toHaveLength(1))
  })

  it('Đã chia sẻ for the owner is the same public share list', async () => {
    ownerFixtures()
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(tabByKey('shares'))
    await waitFor(() => expect(tabByKey('shares').getAttribute('aria-selected')).toBe('true'))
    expect(tiles()).toHaveLength(1)
    // The hide control belongs to Bài đăng / Đã ẩn only.
    expect(document.querySelector('[data-pp-hide-toggle]')).toBeNull()
  })

  it('private empty states are truthful, per section', async () => {
    db.reviews = []; db.likes = []; db.saves = []
    stubFetch({ profile: { is_self: true }, reviews: [], mine: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-empty="posts"]')).toBeTruthy())
    for (const [k, key] of [['liked', 'emptyLiked'], ['saved', 'emptySaved'], ['hidden', 'emptyHidden']] as const) {
      fireEvent.click(tabByKey(k))
      await waitFor(() => expect(document.querySelector(`[data-pp-empty="${k}"]`)).toBeTruthy())
      expect(screen.getByText(`v3.publicProfile.${key}`)).toBeTruthy()
    }
  })

  it('a private section that fails to load says so and can be retried', async () => {
    ownerFixtures()
    db.fail = 'review_likes'
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(tabByKey('liked'))
    await waitFor(() => expect(document.querySelector('[data-pp-section-error]')).toBeTruthy())
    expect(screen.getByText('v3.publicProfile.tabError')).toBeTruthy()
    db.fail = null
    fireEvent.click(document.querySelector('[data-pp-section-retry]')!)
    await waitFor(() => expect(tiles()).toHaveLength(2))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('COVER — a real capability, owner-only to change, public to read', () => {
  const COVER = 'https://storage.googleapis.com/b/covers/author-1-abc.jpg'

  it('visitor: reads the public cover, gets no control', async () => {
    stubFetch({ profile: { cover_url: COVER }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-cover-img]')).toBeTruthy())
    expect((document.querySelector('[data-pp-cover-img]') as HTMLImageElement).getAttribute('src')).toBe(COVER)
    expect(document.querySelector('[data-pp-cover]')!.getAttribute('data-has-cover')).toBe('true')
    expect(document.querySelector('[data-pp-cover-change]')).toBeNull()
    expect(document.querySelector('[data-pp-cover-remove]')).toBeNull()
    expect(document.querySelector('[data-pp-cover-input]')).toBeNull()
  })

  it('no cover: the gradient fallback, no image element pretending to be one', async () => {
    stubFetch({ profile: { cover_url: null }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-cover]')).toBeTruthy())
    expect(document.querySelector('[data-pp-cover]')!.getAttribute('data-has-cover')).toBe('false')
    expect(document.querySelector('[data-pp-cover-img]')).toBeNull()
  })

  it('owner: upload goes through POST /api/profile as `cover`, and the new cover replaces the old', async () => {
    stubFetch({ profile: { is_self: true, cover_url: COVER }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-cover-change]')).toBeTruthy())
    const input = document.querySelector('[data-pp-cover-input]') as HTMLInputElement
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'c.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect((document.querySelector('[data-pp-cover-img]') as HTMLImageElement).getAttribute('src')).toContain('author-1-new.jpg'))
    const post = calls.find(c => c.method === 'POST' && c.url === '/api/profile')!
    expect(post.body).toBeInstanceOf(FormData)
    expect((post.body as FormData).get('cover')).toBe(file)
    expect((post.body as FormData).get('avatar')).toBeNull()
  })

  it('owner: remove resets through PATCH {cover_url: null}; the gradient returns', async () => {
    stubFetch({ profile: { is_self: true, cover_url: COVER }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-cover-remove]')).toBeTruthy())
    fireEvent.click(document.querySelector('[data-pp-cover-remove]')!)
    await waitFor(() => expect(document.querySelector('[data-pp-cover-img]')).toBeNull())
    const patch = calls.find(c => c.method === 'PATCH' && c.url === '/api/profile')!
    expect(JSON.parse(patch.body)).toEqual({ cover_url: null })
    expect(document.querySelector('[data-pp-cover-remove]')).toBeNull()
  })

  it('an invalid file is rejected on the device — no request leaves; a server rejection is shown', async () => {
    stubFetch({ profile: { is_self: true, cover_url: null }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-cover-input]')).toBeTruthy())
    const input = document.querySelector('[data-pp-cover-input]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(screen.getByText('v3.publicProfile.coverErrNotImage')).toBeTruthy())
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [big] } })
    await waitFor(() => expect(screen.getByText('v3.publicProfile.coverErrTooLarge')).toBeTruthy())
    expect(called('POST', '/api/profile')).toBe(false)
    // The server's own verdict (magic bytes say "not an image") reaches the owner.
    cleanup()
    stubFetch({ profile: { is_self: true, cover_url: null }, reviews: [], cover: { status: 400, body: { error: 'bad_image_type', message: 'Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF' } } })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-pp-cover-input]')).toBeTruthy())
    fireEvent.change(document.querySelector('[data-pp-cover-input]')!, { target: { files: [new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(document.querySelector('[data-pp-cover-error]')!.textContent).toContain('JPG, PNG, WebP'))
    expect(document.querySelector('[data-pp-cover-img]')).toBeNull()
  })

  it('before the column exists (no cover_url key from the API) the owner is not offered a control that cannot store anything', async () => {
    stubFetch({ profile: { is_self: true }, reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={OWNER} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('v3.publicProfile.edit')).toBeTruthy())
    expect(document.querySelector('[data-pp-cover]')).toBeTruthy()
    expect(document.querySelector('[data-pp-cover-change]')).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('NAVIGATION', () => {
  it('the compact Explore bar: back, Explore current, and no second brand beside the sidebar', async () => {
    stubFetch({ reviews: [] })
    const onBack = vi.fn()
    render(<PublicProfileView userId={AUTHOR} viewer={VISITOR} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('Huy Phạm')).toBeTruthy())
    const bar = document.querySelector('[data-shell-header] [data-pp-bar]') as HTMLElement
    expect(bar).toBeTruthy()
    fireEvent.click(within(bar).getByLabelText('common.back'))
    expect(onBack).toHaveBeenCalled()
    const explore = bar.querySelector('a[href="/reviews"]')!
    expect(explore.getAttribute('aria-current')).toBe('page')
    expect(bar.querySelector('.v3-xp-logo')!.className).toContain('lg:hidden')
    expect(bar.querySelector('a[href="/profile"]')).toBeTruthy()
  })

  it('signed out: the bar\'s account slot returns to this profile after login', async () => {
    stubFetch({ reviews: [] })
    render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Huy Phạm')).toBeTruthy())
    expect(document.querySelector(`[data-pp-bar] a[href="/login?returnTo=${encodeURIComponent(`/users/${AUTHOR}`)}"]`)).toBeTruthy()
  })

  it('a tile opens the shared clip viewer', async () => {
    stubFetch({ reviews: [mk('p1', 'Quán')] })
    render(<PublicProfileView userId={AUTHOR} viewer={null} onBack={() => {}} />)
    await waitFor(() => expect(tiles()).toHaveLength(1))
    fireEvent.click(within(tiles()[0] as HTMLElement).getByRole('button', { name: 'Quán' }))
    await waitFor(() => expect(document.querySelector('[data-testid="video-player"]')).toBeTruthy())
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('route + privacy + i18n contracts (source)', () => {
  const view = readFileSync('src/app/users/[id]/PublicProfileView.tsx', 'utf8')
  const route = readFileSync('src/app/users/[id]/UserProfileView.tsx', 'utf8')
  const collections = readFileSync('src/app/users/[id]/ownerCollections.ts', 'utf8')

  it('/users/[id] renders the Explore profile inside the REAL V3Shell; the owner Hồ sơ tab keeps ProfileTab', () => {
    expect(route).toContain("from './PublicProfileView'")
    expect(route).not.toMatch(/<ProfileTab/)
    expect(view).toContain("import V3Shell from '@/components/v3/V3Shell'")
    expect(view).toMatch(/<V3Shell [^>]*activeTab="\/reviews" header=\{topBar\} flush>/)
    expect(readFileSync('src/app/reviews/page.tsx', 'utf8')).toContain('ProfileTab')
  })

  it('Explore links a creator to this route', () => {
    expect(readFileSync('src/app/reviews/ExploreStage.tsx', 'utf8')).toMatch(/\/users\/\$\{r\.user_id\}/)
  })

  it('the view itself never queries a private table; the private loaders are the only readers and take the OWNER id', () => {
    for (const forbidden of ["from('review_saves')", "from('review_likes')", "from('review_interactions')", "eq('is_hidden'", 'getUserPreferences']) {
      expect(view, forbidden).not.toContain(forbidden)
    }
    expect(view).toMatch(/if \(!isOwn \|\| !viewerId\) return/)
    expect(view).toMatch(/loadLiked\(supabase, viewerId\)/)
    expect(view).toMatch(/loadSaved\(supabase, viewerId\)/)
    expect(collections).toMatch(/from\('review_likes'\)\.select\('review_id'\)\.eq\('user_id', ownerId\)/)
    expect(collections).toMatch(/from\('review_saves'\)\.select\('review_id'\)\.eq\('user_id', ownerId\)/)
    expect(collections).toMatch(/\/api\/reviews\/mine/)
    expect(collections).not.toMatch(/userId=/)
  })

  it('an anonymous session is treated as signed out for the follow action', () => {
    expect(route).toContain("import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'")
    expect(route).toMatch(/isAnonymousUser\(data\.user\)/)
  })

  it('the cover goes through the one shared client path, and the owner never sets a URL', () => {
    expect(view).toContain("from '@/lib/profile/cover'")
    expect(view).not.toMatch(/cover_url:\s*['"`]/)
    const cover = readFileSync('src/lib/profile/cover.ts', 'utf8')
    expect(cover).toMatch(/body\.append\('cover', file\)/)
    expect(cover).toMatch(/JSON\.stringify\(\{ cover_url: null \}\)/)
    expect(readFileSync('src/app/(app)/profile/edit/page.tsx', 'utf8')).toContain("from '@/lib/profile/cover'")
  })

  it('every profile string comes from the dictionary in both languages', () => {
    const dict = readFileSync('src/lib/i18n/v3/web.ts', 'utf8')
    for (const key of ['title', 'posts', 'followers', 'following', 'edit', 'contentAria', 'tabPosts', 'tabShares', 'tabLiked', 'tabSaved', 'tabHidden',
      'emptyPosts', 'emptyShares', 'emptyLiked', 'emptySaved', 'emptyHidden', 'privateNote', 'tabError', 'retry', 'hidePost', 'showPost',
      'coverAlt', 'coverChange', 'coverRemove', 'coverUploading', 'coverErrTooLarge', 'coverErrNotImage', 'coverErrUpload']) {
      expect((dict.match(new RegExp(`'v3\\.publicProfile\\.${key}'`, 'g')) ?? []).length, key).toBe(2)
    }
    const misc = readFileSync('src/lib/i18n/w4/misc.ts', 'utf8')
    for (const key of ['cover', 'coverHint', 'coverChange', 'coverRemove', 'coverUploading', 'coverNone', 'err.coverTooLarge', 'err.cover']) {
      expect((misc.match(new RegExp(`'editProfile\\.${key.replace('.', '\\.')}'`, 'g')) ?? []).length, key).toBe(2)
    }
  })

  it('responsive: the cover is height-clamped per breakpoint and the tab row scrolls instead of wrapping', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(css).toMatch(/\.v3-pp-cover \{[^}]*height: clamp\(/)
    expect((css.match(/\.v3-pp-cover \{ height: clamp\(/g) ?? []).length).toBe(2)
    expect(css).toMatch(/\.v3-pp-tabs \{[^}]*overflow-x: auto/)
    expect(css).toMatch(/\.v3-pp-grid \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/@media \(min-width: 1024px\) \{ \.v3-pp-grid \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); \} \}/)
  })
})
