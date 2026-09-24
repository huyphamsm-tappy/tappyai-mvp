// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { readFileSync, existsSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/reviews',
  useSearchParams: () => new URLSearchParams(),
}))

/** The real player mounts media. Here it is a MARKER that forwards the one method the
 *  card calls and renders a bare <video> so the playback strip has something to read. */
const pauseToggle = vi.fn()
vi.mock('@/components/explore/VideoPlayer', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    __esModule: true,
    default: forwardRef(function MockPlayer({ url, active }: { url: string; active?: boolean }, ref: React.Ref<unknown>) {
      useImperativeHandle(ref, () => ({ onUserPauseToggle: pauseToggle }), [])
      return <div data-testid="player" data-url={url} data-active={String(!!active)}><video data-testid="video" /></div>
    }),
    isFeedAudioUnlocked: () => true,
  }
})
/** The off-screen poster: an image, never a player. */
vi.mock('@/components/LinkPoster', () => ({
  __esModule: true,
  default: ({ review }: { review: { id: string } }) => <div data-testid="poster" data-id={review.id} />,
}))
vi.mock('@/modules/music', () => ({ useMusicTrack: () => ({ track: null }), getPreviewUrl: () => null }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
const trackMock = vi.fn()
vi.mock('@/lib/tracking/tracker', () => ({ track: (...args: unknown[]) => trackMock(...args) }))
/** Who is signed in, per test. */
let sessionUser: { id: string; user_metadata?: Record<string, unknown> } | null = null
/** What the last 24h of `review_likes` (joined to the review's place) returns, per test. */
let hotRows: Array<{ reviews: { place_name: string | null } | null }> = []
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const q = {
      select: () => q, gte: () => q, limit: async () => ({ data: hotRows, error: null }),
    }
    return {
      auth: {
        getUser: async () => ({ data: { user: sessionUser } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: (table: string) => { if (table !== 'review_likes') throw new Error(`unexpected table ${table}`); return q },
    }
  },
}))
let unread = 0
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: unread, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import ExploreStage, { slotTransform, slotRole, shortCount } from './ExploreStage'
import { vi as viCopy, en as enCopy } from '@/lib/i18n/v3/web'

// ── V3 Web · EXPLORE — the approved spatial stage ───────────────────────────
//
// 🚨🚨 THE RULE THIS FILE EXISTS FOR: **SEVERAL VISIBLE, ONE PLAYING, ONE INDEX.**
//
// The stage draws up to five clips in one perspective space and mounts the player on the
// active one only — every other card is a poster, so there is exactly one <video>. The
// active index is the single source of truth: the player, the overlay, the Ask-Tappy `ctx`,
// the position readout, the progress line and the highlighted thumbnail all derive from it.
//
// The second thing pinned is data honesty: no invented clips, no engagement figures other
// than the feed's own columns, no topic taxonomy, no subject the clip did not supply, Follow
// and the overflow menu under the feed's own rules — and no static copy on the stage at all
// (the editorial line and the stage-level "Tappy" wordmark were redundant beside the shell's
// branding and are pinned OUT below).
//
// The third is COMPOSITION: the stage lives INSIDE `V3Shell` — the real left sidebar and
// the app's own bottom bar stay — with a page-owned top bar in place of the standard header,
// and a RIGHT COLUMN that draws only from real sources (`/api/recommendations`, the last
// 24h of `review_likes`, creators already on the feed) and omits any panel with no data.

const clip = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: 'u1', place_name: 'Chia sẻ', place_address: null, rating: 0,
  body: `caption ${id}`, photos: null, like_count: 0, comment_count: 0, save_count: 0,
  created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), liked_by_me: false, saved_by_me: false,
  profiles: { full_name: 'Huy', avatar_url: null },
  content_type: 'video', media_url: `https://example.com/${id}.mp4`,
  thumbnail: `https://example.com/${id}.jpg`, source_type: 'upload', hashtags: ['#pho'],
  ...over,
})
const five = () => ['a', 'b', 'c', 'd', 'e'].map(id => clip(id))
const seven = () => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => clip(id))

let lastUrl = ''
let fetchMock: ReturnType<typeof vi.fn>
function mockFeed(rows: unknown[], extra?: (url: string, init?: RequestInit) => Promise<unknown> | undefined) {
  lastUrl = ''
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handled = extra?.(String(url), init)
    if (handled) return handled
    lastUrl = String(url)
    return { ok: true, status: 200, json: async () => ({ reviews: rows, page: 0, limit: 20, hasMore: false }) }
  })
  vi.stubGlobal('fetch', fetchMock)
}

const players = () => screen.queryAllByTestId('player')
const posters = () => screen.queryAllByTestId('poster')
const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-explore-card]'))
const stage = () => document.querySelector<HTMLElement>('[data-explore-stage]')!
const activeId = () => stage().getAttribute('data-active-review-id')
const ask = () => document.querySelector<HTMLAnchorElement>('[data-stage-ask]')
const untilCards = () => waitFor(() => expect(cards().length).toBeGreaterThan(0))

// These assertions read the EN catalogue, so the locale is STATED rather than inherited: the
// product default is Vietnamese (ADR-027, merged with feat/affiliate-cross-platform) and a test
// that wants English must say so — the same rule the admin suites already follow.
beforeEach(() => setLocale('en'))
beforeEach(() => { vi.unstubAllGlobals(); pauseToggle.mockClear(); trackMock.mockClear(); sessionUser = null; unread = 0; hotRows = [] })
afterEach(cleanup)

describe('several visible, ONE playing', () => {
  it('mounts exactly one player for a feed of five, and posters for the rest that are drawn', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    expect(players()).toHaveLength(1)
    expect(document.querySelectorAll('video')).toHaveLength(1)
    expect(posters().length).toBeGreaterThanOrEqual(2)
    expect(players()[0].getAttribute('data-url')).toBe('https://example.com/a.mp4')
  })

  it('never renders a player and a poster on the same card', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    for (const card of cards()) {
      const hasPlayer = !!card.querySelector('[data-testid="player"]')
      const hasPoster = !!card.querySelector('[data-testid="poster"]')
      expect(hasPlayer !== hasPoster, 'a card is a player OR a poster').toBe(true)
    }
  })

  it('MOVES the single player when a neighbour is selected — it does not add one', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    const near = cards().find(c => c.dataset.role === 'near')!
    fireEvent.click(near.querySelector('button')!)
    await waitFor(() => expect(activeId()).toBe('b'))
    expect(players()).toHaveLength(1)
    expect(players()[0].getAttribute('data-url')).toBe('https://example.com/b.mp4')
    expect(cards().filter(c => c.dataset.active === 'true')).toHaveLength(1)
  })

  it('draws the active clip, its neighbours and the far pair — no more than seven cards ever', async () => {
    mockFeed(seven())
    render(<ExploreStage />)
    await untilCards()
    expect(cards().map(c => c.dataset.role)).toEqual(['active', 'near', 'far', 'hidden'])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(activeId()).toBe('d'))
    expect(cards().map(c => c.dataset.role)).toEqual(['hidden', 'far', 'near', 'active', 'near', 'far', 'hidden'])
    expect(players()).toHaveLength(1)
  })
})

describe('the active index is the single source of truth', () => {
  it('player, Ask-Tappy ctx, readout, progress line and thumbnail all follow one review, and move together', async () => {
    mockFeed(five().map(r => ({ ...r, place_name: `Quán ${r.id}` })))
    render(<ExploreStage />)
    await untilCards()
    const check = (id: string, pos: string, pct: string) => {
      expect(activeId()).toBe(id)
      expect(players()[0].getAttribute('data-url')).toBe(`https://example.com/${id}.mp4`)
      expect(ask()!.getAttribute('href')).toContain(`ctx=${id}`)
      expect(ask()!.getAttribute('href')).toContain(encodeURIComponent(`Quán ${id}`))
      expect(document.querySelector('[data-stage-pos]')!.textContent).toBe(pos)
      expect((document.querySelector('[data-xp-line]') as HTMLElement).style.width).toBe(pct)
      const current = document.querySelectorAll('[data-xp-thumbs] [aria-current="true"]')
      expect(current).toHaveLength(1)
      expect(current[0].getAttribute('aria-label')).toBe(`Go to video ${pos.split(' / ')[0]}`)
      expect(document.querySelectorAll('[data-stage-ask]')).toHaveLength(1)
    }
    check('a', '1 / 5', '20%')
    fireEvent.click(document.querySelector('[data-stage-next]')!)
    await waitFor(() => check('b', '2 / 5', '40%'))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => check('c', '3 / 5', '60%'))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => check('b', '2 / 5', '40%'))
    // The thumbnail navigator jumps straight to a clip.
    fireEvent.click(document.querySelectorAll('[data-xp-thumbs] button')[4])
    await waitFor(() => check('e', '5 / 5', '100%'))
  })

  it('a vertical wheel turns the space one clip at a time; prev/next disable at the ends', async () => {
    mockFeed(five().slice(0, 3))
    render(<ExploreStage />)
    await untilCards()
    expect((document.querySelector('[data-stage-prev]') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.wheel(stage(), { deltaY: 120 })
    await waitFor(() => expect(activeId()).toBe('b'))
    fireEvent.wheel(stage(), { deltaY: 120 }) // inside the throttle window: ignored
    expect(activeId()).toBe('b')
    fireEvent.click(document.querySelector('[data-stage-next]')!)
    await waitFor(() => expect(activeId()).toBe('c'))
    expect((document.querySelector('[data-stage-next]') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('the space turns with the pointer', () => {
  const swipe = (dx: number, dt = 100) => {
    const el = stage()
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 500, clientY: 300 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 500 + dx / 2, clientY: 300 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 500 + dx, clientY: 300 })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + dt)
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 500 + dx, clientY: 300 })
    vi.restoreAllMocks()
  }

  it('a leftward swipe advances one clip; a rightward one goes back; the player follows', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    swipe(-160)
    await waitFor(() => expect(activeId()).toBe('b'))
    expect(players()).toHaveLength(1)
    swipe(160)
    await waitFor(() => expect(activeId()).toBe('a'))
  })

  it('mid-drag the active card has already moved, and the stage says it is dragging', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    const el = stage()
    const before = cards()[0].style.transform
    fireEvent.pointerDown(el, { pointerId: 2, button: 0, clientX: 500, clientY: 300 })
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 420, clientY: 300 })
    expect(stage().getAttribute('data-dragging')).toBe('true')
    expect(cards()[0].style.transform).not.toBe(before)
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 420, clientY: 300 })
    await waitFor(() => expect(stage().getAttribute('data-dragging')).toBe('false'))
  })

  it('a tiny movement is a click, not a swipe', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    swipe(-3)
    await new Promise(r => setTimeout(r, 20))
    expect(activeId()).toBe('a')
  })
})

describe('the spatial model (pure)', () => {
  const g = { x: [0, 0.82, 1.3, 1.6], z: [0, -140, -300, -460], rot: [0, 24, 38, 44], sc: [1, 0.86, 0.72, 0.6], op: [1, 0.96, 0.86, 0], widthShare: 0.307, heightShare: 0.78 }
  it('the active clip is nearest, largest, fully opaque and unturned', () => {
    expect(slotTransform(0, g, 442)).toEqual({ transform: 'translate3d(calc(-50% + 0.0px), -50%, 0.0px) rotateY(0.00deg) scale(1.000)', opacity: 1 })
  })
  it('neighbours sit ±0.82 widths out, behind, smaller and turned away, mirrored left and right', () => {
    const right = slotTransform(1, g, 442)
    const left = slotTransform(-1, g, 442)
    expect(right.transform).toBe('translate3d(calc(-50% + 362.4px), -50%, -140.0px) rotateY(-24.00deg) scale(0.860)')
    expect(left.transform).toBe('translate3d(calc(-50% + -362.4px), -50%, -140.0px) rotateY(24.00deg) scale(0.860)')
    expect(right.opacity).toBe(0.96)
  })
  it('the far pair is deeper and further turned; beyond it a card is invisible', () => {
    expect(slotTransform(2, g, 442).transform).toContain('rotateY(-38.00deg) scale(0.720)')
    expect(slotTransform(3, g, 442).opacity).toBe(0)
    expect(slotTransform(9, g, 442).opacity).toBe(0)
  })
  it('a drag interpolates between slots, so the space moves continuously', () => {
    const half = slotTransform(0.5, g, 442)
    expect(half.transform).toBe('translate3d(calc(-50% + 181.2px), -50%, -70.0px) rotateY(-12.00deg) scale(0.930)')
    expect(half.opacity).toBeCloseTo(0.98)
  })
  it('roles come from the integer distance only', () => {
    expect([0, 1, -1, 2, -2, 3, 8].map(slotRole)).toEqual(['active', 'near', 'near', 'far', 'far', 'hidden', 'hidden'])
  })
  it('counts are the feed’s numbers, shortened the way the reference shows them', () => {
    expect([0, 7, 999, 1234, 9950, 12800, 2400000].map(shortCount)).toEqual(['0', '7', '999', '1.2k', '9.9k', '13k', '2.4M'])
  })
})

describe('the approved composition is on screen', () => {
  // Music is hidden on every platform while its catalogue licensing is open (`SHOW_MUSIC`), so
  // the fourth tab is absent by design — `musicHidden.test.tsx` fails if it comes back. Restore it
  // here, and the count below, when the flag flips.
  it('top bar: logo, Explore / Ask Tappy / Plan with Explore current, search, notifications, profile', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    const nav = Array.from(document.querySelectorAll('.v3-xp-nav a')).map(a => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')])
    expect(nav).toEqual([['Explore', '/reviews', 'page'], ['Ask Tappy', '/chat', null], ['Plan', '/planner', null]])
    // The wordmark exists only for the widths where the shell's sidebar (the brand) is hidden.
    const logo = document.querySelector('.v3-xp-logo')!
    expect(logo.getAttribute('href')).toBe('/')
    expect(logo.className).toContain('lg:hidden')
    expect(document.querySelector('[data-xp-search] input')!.getAttribute('placeholder')).toBe('Find places, dishes, experiences…')
    expect(document.querySelector('[data-xp-filter-toggle]')).toBeTruthy()
    expect(document.querySelector('[data-xp-bar] a[href="/profile/notifications"]')).toBeTruthy()
    // Signed out: the avatar slot is a way to sign in, not an invented person.
    expect(document.querySelector(`a[href="/login?returnTo=${encodeURIComponent('/reviews')}"]`)).toBeTruthy()
    expect(document.querySelector('[data-xp-unread]')).toBeNull()
  })

  it('the bell carries the real unread badge, the avatar the signed-in session', async () => {
    unread = 3
    sessionUser = { id: 'me-1', user_metadata: { avatar_url: 'https://cdn.example/me.jpg' } }
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    expect(document.querySelector('[data-xp-unread]')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('a[href="/profile"] img')?.getAttribute('src')).toBe('https://cdn.example/me.jpg'))
  })

  it('position + progress line, the Post CTA and the thumbnail navigator are all there', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    expect(document.querySelector('[data-stage-pos]')!.textContent).toBe('1 / 5')
    expect(document.querySelector('[data-xp-line]')).toBeTruthy()
    expect(document.querySelector('[data-xp-post]')).toBeTruthy()
    const thumbs = document.querySelectorAll('[data-xp-thumbs] button')
    expect(thumbs).toHaveLength(5)
    expect(thumbs[0].querySelector('img')!.getAttribute('src')).toBe('https://example.com/a.jpg')
  })

  describe('the Post CTA, bottom centre', () => {
    it('is a real link labelled "Post" with the create icon, inside the stage — and the old scroll hint is gone', async () => {
      mockFeed(five())
      render(<ExploreStage />)
      await untilCards()
      const cta = stage().querySelector('a[data-xp-post]') as HTMLAnchorElement
      expect(cta).toBeTruthy()
      expect(cta.textContent).toBe('Post')
      expect(cta.getAttribute('aria-label')).toBe('Post')
      expect(cta.classList.contains('v3-xp-post')).toBe(true)
      // The icon is the shell's own "create" glyph (lucide Plus), decorative beside the label.
      const icon = cta.querySelector('svg.lucide-plus')
      expect(icon).toBeTruthy()
      expect(icon!.getAttribute('aria-hidden')).toBe('true')
      // Not a second hint, not both: the mouse / SCROLL • SWIPE • EXPLORE cue no longer exists.
      expect(document.querySelector('[data-xp-hint]')).toBeNull()
      expect(document.querySelector('.v3-xp-hint')).toBeNull()
      expect(document.querySelector('svg.lucide-mouse')).toBeNull()
      expect(document.body.textContent).not.toMatch(/SCROLL\s+•\s+SWIPE|CUỘN\s+•\s+VUỐT/)
      // No tagline was added around it.
      expect(document.body.textContent).not.toMatch(/Chia sẻ khoảnh khắc/)
    })

    it('opens the ONE canonical Post / Upload flow — the same route as the shell — with no second poster', async () => {
      mockFeed(five())
      render(<ExploreStage />)
      await untilCards()
      const cta = stage().querySelector('a[data-xp-post]')!
      expect(cta.getAttribute('href')).toBe('/reviews/new')
      // The shell's own sidebar row still points there, unchanged.
      const sidebar = document.querySelector('aside.sticky a[href="/reviews/new"]')
      expect(sidebar).toBeTruthy()
      // And there is exactly one such destination inside the stage — no duplicate flow.
      expect(stage().querySelectorAll('a[href="/reviews/new"]')).toHaveLength(1)
      expect(stage().querySelector('[data-xp-post]')!.tagName).toBe('A')
    })

    it('renders with a single clip too — the CTA does not depend on the navigator', async () => {
      mockFeed([five()[0]])
      render(<ExploreStage />)
      await untilCards()
      expect(stage().querySelector('a[data-xp-post][href="/reviews/new"]')).toBeTruthy()
      expect(document.querySelector('[data-xp-thumbs]')).toBeNull()
    })

    it('is stage-positioned at bottom centre as a compact pill, hover lifts it and press scales it, reduced motion stills it', () => {
      const css = readFileSync('src/app/globals.css', 'utf8')
      const block = css.match(/\.v3-xp-post \{([^}]*)\}/)![1]
      // Belongs to the stage: absolute inside the positioned stage, never fixed to the viewport.
      expect(block).toMatch(/position: absolute/)
      expect(block).not.toMatch(/position: fixed/)
      expect(block).toMatch(/left: 50%/)
      expect(block).toMatch(/bottom: 26px/)
      expect(block).toMatch(/transform: translateX\(-50%\)/)
      // Compact pill in the approved envelope: ~205–220 × 58–64, fully rounded.
      expect(block).toMatch(/min-width: 212px/)
      expect(block).toMatch(/height: 60px/)
      expect(block).toMatch(/border-radius: 9999px/)
      expect(block).toMatch(/gap: 11px/)
      expect(block).toMatch(/font-size: 17px/)
      expect(block).toMatch(/font-weight: 600/)
      // Blue → blue-violet from the V3 fill tokens, white text, translucent border, restrained glow.
      expect(block).toMatch(/linear-gradient\([^)]*var\(--v3-accent-fill\)[\s\S]*var\(--v3-violet-fill\)/)
      expect(block).toMatch(/color: var\(--v3-on-accent\)/)
      expect(block).toMatch(/border: 1px solid color-mix\(in srgb, var\(--v3-accent\)/)
      expect(block).toMatch(/box-shadow:[\s\S]*var\(--v3-accent\)[\s\S]*var\(--v3-violet\)/)
      expect(block).toMatch(/transition: transform 190ms ease-out/)
      // Hover: 2px lift, brighter, more glow. Active: 0.98 scale. Focus: visible ring.
      expect(css).toMatch(/\.v3-xp-post:hover \{[^}]*translateY\(-2px\)/)
      expect(css).toMatch(/\.v3-xp-post:hover \{[^}]*brightness\(1\.08\)/)
      expect(css).toMatch(/\.v3-xp-post:active \{[^}]*scale\(0\.98\)/)
      expect(css).toMatch(/\.v3-xp-post:focus-visible \{[^}]*outline: 2px solid/)
      // No idle pulse: the stage's ambient light and lit floor are the only animation.
      expect(css).not.toMatch(/\.v3-xp-post[^{]*\{[^}]*animation:/)
      // Below 1280 (1024 and tablet): a notch smaller (~200 × 56), still centred; the tablet
      // block only tightens the bottom offset. Reduced motion turns it all off.
      expect(css).toMatch(/@media \(max-width: 1279px\) \{\s*\.v3-xp-post \{[^}]*min-width: 200px; height: 56px/)
      expect(css).toMatch(/@media \(max-width: 1023px\) \{[\s\S]*?\.v3-xp-post \{ bottom: 20px; \}/)
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.v3-xp-post \{ transition: none; \}/)
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.v3-xp-post:hover, \.v3-xp-post:active \{ transform: translateX\(-50%\); \}/)
      // The old hint's rules are gone with it.
      expect(css).not.toMatch(/\.v3-xp-hint/)
    })
  })

  it('the active card carries creator · time · Follow, the caption + location in the bottom zone, and the compact rail with real counts', async () => {
    mockFeed([clip('a', { body: 'Chill vibes in District 1', place_name: 'The Rooftop', place_address: 'District 1, Ho Chi Minh City', like_count: 1234, comment_count: 128 }), clip('b')])
    render(<ExploreStage />)
    await untilCards()
    const card = cards()[0]
    expect(card.querySelector('a[href="/users/u1"]')!.textContent).toContain('Huy')
    // The feed's own relative-time format (`ago`): "2d" in English.
    expect(card.querySelector('.v3-xp-creator-time')!.textContent).toBe('2d')
    expect(card.querySelector('[data-xp-follow]')!.textContent).toBe('Follow')
    // The caption sits in the bottom gradient zone — not as a headline mid-card — clamped to 3 lines.
    expect(card.querySelector('h2')).toBeNull()
    const caption = card.querySelector('.v3-xp-bottom [data-xp-caption-block] [data-xp-caption]') as HTMLElement
    expect(caption.textContent).toBe('Chill vibes in District 1')
    expect(caption.style.webkitLineClamp).toBe('3')
    expect(card.querySelector('[data-xp-caption-more]')).toBeNull()
    expect(card.querySelector('[data-xp-location]')!.textContent).toBe('The Rooftop · District 1, Ho Chi Minh City')
    // The rail is icon + count only — no text labels on the buttons.
    expect(card.querySelector('[data-xp-like]')!.textContent).toBe('1.2k')
    expect(card.querySelector('[data-xp-comment]')!.textContent).toBe('128')
    expect(card.querySelector('[data-xp-share]')!.textContent).toBe('')
    expect(card.querySelector('[data-xp-save]')!.textContent).toBe('')
    expect(card.querySelector('[data-xp-like-count]')!.textContent).toBe('1.2k')
    expect(card.querySelector('[data-xp-comment-count]')!.textContent).toBe('128')
    expect(card.querySelector('[data-xp-comment]')!.getAttribute('href')).toBe('/reviews/a')
    expect(card.querySelector('[data-xp-share]')!.getAttribute('href')).toBe('/reviews/a')
    expect(card.querySelector('[data-xp-save]')).toBeTruthy()
    // A share-only clip never prints its sentinel as a place.
    expect(cards()[1].textContent).not.toContain('Chia sẻ')
  })

  it('a long caption is clamped with a "Read more" that expands it in place; location is omitted when there is none', async () => {
    const long = 'Bún bò '.repeat(30).trim()
    mockFeed([clip('a', { body: long, place_name: 'Chia sẻ', place_address: null })])
    render(<ExploreStage />)
    await untilCards()
    const card = cards()[0]
    expect(card.querySelector('[data-xp-location]')).toBeNull()
    const caption = card.querySelector('[data-xp-caption]') as HTMLElement
    expect(caption.style.webkitLineClamp).toBe('3')
    const more = card.querySelector('[data-xp-caption-more]')!
    expect(more.textContent).toBe('Read more')
    fireEvent.click(more)
    expect(caption.style.webkitLineClamp).toBe('')
    expect(card.querySelector('[data-xp-caption-more]')).toBeNull()
    // Expanding text is not selecting a clip and not pausing it.
    expect(pauseToggle).not.toHaveBeenCalled()
  })
})

describe('no redundant branding on the stage', () => {
  it('the editorial tagline and the stage-level "Tappy" are gone; the shell keeps its brand, the stage its content', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    const stageEl = stage()
    expect(document.querySelector('[data-xp-editorial]')).toBeNull()
    for (const line of ['Real places.', 'Real people.', 'A more vibrant you.', 'Địa điểm thật.', 'Con người thật.', 'Một bạn sống động hơn.']) {
      expect(document.body.textContent).not.toContain(line)
    }
    // The stage itself carries no "Tappy" wordmark — only the Ask-Tappy bridge on the active card.
    for (const node of Array.from(stageEl.querySelectorAll('a, p, span, div'))) {
      if (node.children.length === 0) expect(node.textContent?.trim()).not.toBe('Tappy')
    }
    // The keys are gone from both dictionaries, not just unused.
    expect(Object.keys(viCopy).filter(k => k.startsWith('v3.explore.editorial'))).toEqual([])
    expect(Object.keys(enCopy).filter(k => k.startsWith('v3.explore.editorial'))).toEqual([])
    // What stays: the shell's sidebar brand, the top navigation, the right column, the stage, the player.
    expect(document.querySelector('aside.sticky')!.textContent).toContain('Tappy')
    // Three while Music is hidden (`SHOW_MUSIC`); four when it returns.
    expect(document.querySelectorAll('.v3-xp-nav a')).toHaveLength(3)
    expect(document.querySelector('[data-xp-right]')).toBeTruthy()
    expect(cards().find(c => c.getAttribute('data-role') === 'active')).toBeTruthy()
    expect(players()).toHaveLength(1)
    // Nothing reserves the space the copy used to take.
    expect(readFileSync('src/app/globals.css', 'utf8')).not.toContain('v3-xp-editorial')
    const src = readFileSync('src/app/reviews/ExploreStage.tsx', 'utf8')
    expect(src).not.toContain('data-xp-editorial')
    expect(src).not.toContain('v3.explore.editorial')
  })
})

describe('the three-column composition: shell sidebar · stage · right column', () => {
  it('renders inside the REAL V3Shell — its sidebar and bottom bar — with the page-owned bar as the only header', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    const aside = document.querySelector('aside.sticky')!
    expect(aside).toBeTruthy()
    expect(aside.querySelector('a[href="/reviews"]')).toBeTruthy()
    const headers = document.querySelectorAll('header')
    expect(headers).toHaveLength(1)
    expect(headers[0].hasAttribute('data-xp-bar')).toBe(true)
    // The stage grid is the shell's main column, run flush (no container padding).
    const main = document.querySelector('main')!
    expect(main.className).toBe('min-w-0')
    expect(main.querySelector('.v3-xp-grid > [data-explore-stage]')).toBeTruthy()
    expect(main.querySelector('.v3-xp-grid > [data-xp-right]')).toBeTruthy()
    // Mobile navigation is the app's own bar, untouched.
    expect(document.querySelector('nav a[href="/reviews"]')).toBeTruthy()
  })

  it('sizes the cards from the main column — 40% of its width, capped by 78% of its height', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    // No layout in jsdom: the nominal 1040×900 column applies until ResizeObserver corrects it.
    const active = cards().find(c => c.getAttribute('data-role') === 'active')!
    expect(active.style.width).toBe('416px')
    expect(active.style.height).toBe('646px')
    expect(stage().getAttribute('data-mode')).toBe('desktop')
  })

  it('right column: suggestions come from /api/recommendations and each one hands off to Chat', async () => {
    mockFeed(five(), url => url === '/api/recommendations'
      ? Promise.resolve({ ok: true, json: async () => ({ recommendations: [
          { placeId: 'p1', placeName: 'Cơm tấm Ba Ghiền', score: 3 },
          { placeId: 'p2', placeName: '   ', score: 2 },
          { placeId: 'p3', placeName: 'The Workshop', score: 1 },
          { placeId: 'p4', placeName: 'Bánh mì Huỳnh Hoa', score: 1 },
          { placeId: 'p5', placeName: 'Phở Lệ', score: 1 },
        ] }) })
      : undefined)
    render(<ExploreStage />)
    await waitFor(() => expect(document.querySelector('[data-xp-recs]')).toBeTruthy())
    const names = Array.from(document.querySelectorAll('[data-xp-recs] .v3-xp-rec-name')).map(e => e.textContent)
    expect(names).toEqual(['Cơm tấm Ba Ghiền', 'The Workshop', 'Bánh mì Huỳnh Hoa'])
    expect(document.querySelector('[data-xp-recs] a[href="/recommendations"]')).toBeTruthy()
    const ask = document.querySelector('[data-xp-recs] a[href^="/chat?q="]')!
    expect(decodeURIComponent(ask.getAttribute('href')!)).toContain('Cơm tấm Ba Ghiền')
  })

  it('right column: trending places are the last 24h of real likes grouped by place, most liked first', async () => {
    hotRows = [
      { reviews: { place_name: 'Phở Lệ' } }, { reviews: { place_name: 'The Workshop' } }, { reviews: { place_name: 'Phở Lệ' } },
      { reviews: { place_name: 'Chia sẻ' } }, { reviews: null }, { reviews: { place_name: null } },
    ]
    mockFeed(five())
    render(<ExploreStage />)
    await waitFor(() => expect(document.querySelector('[data-xp-trends]')).toBeTruthy())
    const rows = Array.from(document.querySelectorAll('[data-xp-trends] .v3-xp-trend')).map(e => e.textContent)
    expect(rows).toEqual(['1Phở Lệ2 likes', '2The Workshop1 likes'])
  })

  it('right column: creators to follow come from the feed itself — not me, not already followed, no duplicates', async () => {
    sessionUser = { id: 'me-1' }
    mockFeed([
      clip('a', { user_id: 'u1', profiles: { full_name: 'Huy', avatar_url: null } }),
      clip('b', { user_id: 'u1', profiles: { full_name: 'Huy', avatar_url: null } }),
      clip('c', { user_id: 'me-1', profiles: { full_name: 'Me', avatar_url: null } }),
      clip('d', { user_id: 'u2', profiles: { full_name: 'Lan', avatar_url: null }, is_following: true }),
      clip('e', { user_id: 'u3', profiles: { full_name: 'Quang', avatar_url: null } }),
      clip('f', { user_id: 'u4', profiles: null }),
    ])
    render(<ExploreStage />)
    await untilCards()
    await waitFor(() => expect(document.querySelectorAll('[data-xp-people] .v3-xp-person')).toHaveLength(2))
    const names = Array.from(document.querySelectorAll('[data-xp-people] .v3-xp-person-name')).map(e => e.textContent)
    expect(names).toEqual(['Huy', 'Quang'])
    fireEvent.click(document.querySelector('[data-xp-person-follow]')!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/u1/follow', expect.objectContaining({ method: 'POST' })))
  })

  it('right column: with nothing real to show, only the Ask-Tappy call to action remains — no placeholders', async () => {
    mockFeed([clip('a', { profiles: null }), clip('b', { profiles: null })])
    render(<ExploreStage />)
    await untilCards()
    const right = document.querySelector('[data-xp-right]')!
    expect(right.querySelector('[data-xp-recs]')).toBeNull()
    expect(right.querySelector('[data-xp-trends]')).toBeNull()
    expect(right.querySelector('[data-xp-people]')).toBeNull()
    expect(right.querySelector('[data-xp-cta] a[href="/chat"]')!.textContent?.trim()).toBe('Ask Tappy now')
    expect(right.querySelectorAll('section')).toHaveLength(1)
  })
})

describe('nothing on a card is invented', () => {
  it('a share-only clip draws no place and no Ask-Tappy bridge without a caption', async () => {
    mockFeed([clip('a', { place_name: 'Chia sẻ', body: '' })])
    render(<ExploreStage />)
    await untilCards()
    expect(cards()[0].querySelector('[data-xp-caption-block]')!.textContent).toBe('')
    expect(ask()).toBeNull()
  })
  it('renders no creator link when the feed sent no profile', async () => {
    mockFeed([clip('a', { profiles: null })])
    render(<ExploreStage />)
    await untilCards()
    expect(document.querySelector('a[href^="/users/"]')).toBeNull()
  })
  it('does NOT invent clips: two clips draw two cards and two thumbnails', async () => {
    mockFeed(five().slice(0, 2))
    render(<ExploreStage />)
    await untilCards()
    expect(cards()).toHaveLength(2)
    expect(document.querySelectorAll('[data-xp-thumbs] button')).toHaveLength(2)
  })
  it('leaves out rows with no playable clip, and says so when nothing is left', async () => {
    mockFeed([clip('a'), clip('b', { content_type: 'photo', media_url: null })])
    render(<ExploreStage />)
    await untilCards()
    expect(cards()).toHaveLength(1)
    cleanup()
    mockFeed([])
    render(<ExploreStage />)
    await waitFor(() => expect(screen.getByText('No videos to show yet.')).toBeTruthy())
    expect(document.querySelectorAll('[data-explore-card]')).toHaveLength(0)
  })
})

describe('Follow and the overflow menu follow the feed’s own rules', () => {
  it('Follow appears on someone else’s unfollowed post and posts to the existing endpoint', async () => {
    sessionUser = { id: 'me-1' }
    mockFeed([clip('a', { user_id: 'u1' })], (url, init) => {
      if (url === '/api/users/u1/follow' && init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ following: true }) })
      return undefined
    })
    render(<ExploreStage />)
    await untilCards()
    await waitFor(() => expect(document.querySelector('[data-xp-follow]')).toBeTruthy())
    fireEvent.click(document.querySelector('[data-xp-follow]')!)
    await waitFor(() => expect(document.querySelector('[data-xp-following]')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith('/api/users/u1/follow', { method: 'POST' })
    expect(document.querySelector('[data-xp-more]')).toBeNull()
  })

  it('an already-followed creator shows Following, not a button', async () => {
    mockFeed([clip('a', { is_following: true })])
    render(<ExploreStage />)
    await untilCards()
    expect(document.querySelector('[data-xp-follow]')).toBeNull()
    expect(document.querySelector('[data-xp-following]')!.textContent).toBe('Following')
  })

  it('the overflow menu exists only on your own post, with the real delete and hide actions', async () => {
    sessionUser = { id: 'u1' }
    mockFeed([clip('a', { user_id: 'u1' }), clip('b', { user_id: 'other' })])
    render(<ExploreStage />)
    await untilCards()
    await waitFor(() => expect(document.querySelector('[data-xp-more]')).toBeTruthy())
    expect(document.querySelector('[data-xp-follow]')).toBeNull()
    fireEvent.click(document.querySelector('[data-xp-more]')!)
    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map(b => b.textContent!.trim())
    expect(items).toEqual(['Delete post', 'Hide post'])
    // Move to the other person's clip: no menu, a Follow instead.
    fireEvent.click(document.querySelector('[data-stage-next]')!)
    await waitFor(() => expect(activeId()).toBe('b'))
    expect(document.querySelector('[data-xp-more]')).toBeNull()
    expect(document.querySelector('[data-xp-follow]')).toBeTruthy()
  })
})

describe('it uses the mechanisms that already exist', () => {
  it('reads the existing feed endpoint; the sorts live behind the filter glyph and still hit it', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    expect(lastUrl).toBe('/api/reviews/feed?page=0&limit=20')
    expect(document.querySelector('[data-xp-filters]')).toBeNull()
    fireEvent.click(document.querySelector('[data-xp-filter-toggle]')!)
    const chips = Array.from(document.querySelectorAll('.v3-xp-chip')).map(c => c.textContent)
    expect(chips).toEqual(['For You', 'Following', 'Latest'])
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    await waitFor(() => expect(lastUrl).toBe('/api/reviews/feed?page=0&limit=20&sort=latest'))
    // Picking a sort closes the popover; it opens again from the same glyph.
    expect(document.querySelector('[data-xp-filters]')).toBeNull()
    fireEvent.click(document.querySelector('[data-xp-filter-toggle]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Following' }))
    await waitFor(() => expect(lastUrl).toBe('/api/reviews/feed?page=0&limit=20&following=true'))
  })
  it('searches through the same endpoint rather than a new one', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    const input = document.querySelector('[data-xp-search] input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bún bò' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(lastUrl).toBe(`/api/reviews/feed?search=${encodeURIComponent('bún bò')}&limit=20`))
  })
  it('hands off to Chat through the existing bridge, carrying the ACTIVE clip and what it IS', async () => {
    mockFeed([clip('a', { place_name: 'Bún bò Cô Ba' }), clip('b')])
    render(<ExploreStage />)
    await untilCards()
    const href = ask()!.getAttribute('href')!
    expect(href.startsWith('/chat?q=')).toBe(true)
    expect(href).toContain('ctx=a')
    expect(decodeURIComponent(href)).toContain('Bún bò Cô Ba')
    expect(decodeURIComponent(href)).not.toMatch(/muốn|want/i)
  })
  it('measures the bridge: ONE ask_tappy_place click with source_surface explore_desktop, and no pause', async () => {
    mockFeed([clip('a', { place_name: 'Quán A', place_address: '1 Lê Lợi' })])
    render(<ExploreStage />)
    await untilCards()
    fireEvent.click(ask()!)
    expect(trackMock).toHaveBeenCalledTimes(1)
    const [type, meta] = trackMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(type).toBe('ask_tappy_place')
    expect(meta).toMatchObject({ phase: 'click', review_id: 'a', source_surface: 'explore_desktop', has_address: true })
    expect(pauseToggle).not.toHaveBeenCalled()
  })
  it('like and save call the existing endpoints, optimistically, and the like count follows', async () => {
    mockFeed([clip('a', { like_count: 10 })], (url, init) => {
      if (url === '/api/reviews/a/like' && init?.method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ liked: true }) })
      if (url === '/api/reviews/a/save' && init?.method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ saved: true }) })
      return undefined
    })
    render(<ExploreStage />)
    await untilCards()
    fireEvent.click(document.querySelector('[data-xp-like]')!)
    await waitFor(() => expect(document.querySelector('[data-xp-like-count]')!.textContent).toBe('11'))
    expect(document.querySelector('[data-xp-like]')!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(document.querySelector('[data-xp-save]')!)
    await waitFor(() => expect(document.querySelector('[data-xp-save]')!.getAttribute('aria-pressed')).toBe('true'))
    expect(pauseToggle).not.toHaveBeenCalled()
  })
})

describe('the playing clip can be paused, from the frame and from the playback strip', () => {
  it('the frame tells the session the user toggled pause instead of re-selecting', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    fireEvent.click(cards()[0].querySelector('button')!)
    expect(pauseToggle).toHaveBeenCalledTimes(1)
    expect(activeId()).toBe('a')
    expect(document.querySelector('.fill-white.text-white')).toBeTruthy()
  })
  it('the strip reads the player’s own <video> and pauses through the same session call', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 30 })
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { configurable: true, get: () => 12, set: () => {} })
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    const video = document.querySelector('video')!
    await act(async () => { video.dispatchEvent(new Event('loadedmetadata')) })
    await waitFor(() => expect(document.querySelector('[data-xp-time]')!.textContent).toBe('00:12 / 00:30'))
    expect((document.querySelector('.v3-xp-track > span') as HTMLElement).style.width).toBe('40%')
    fireEvent.click(document.querySelector('[data-xp-pause]')!)
    expect(pauseToggle).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-xp-fullscreen]')).toBeTruthy()
  })
  it('selects an inactive card rather than pausing it', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilCards()
    fireEvent.click(cards()[2].querySelector('button')!)
    await waitFor(() => expect(activeId()).toBe('c'))
    expect(pauseToggle).not.toHaveBeenCalled()
  })
})

describe('the page wiring', () => {
  const page = readFileSync('src/app/reviews/page.tsx', 'utf8')
  it('mounts the stage from 768px up and the phone feed below; the old desktop surface is gone', () => {
    expect(page).toContain("const DESKTOP_QUERY = '(min-width: 768px)'")
    expect(page).toContain("import ExploreStage from './ExploreStage'")
    expect(page).toContain('if (isDesktop) return <ExploreStage />')
    expect(page).not.toContain('ExploreV3Desktop')
    expect(existsSync('src/app/reviews/ExploreV3Desktop.tsx')).toBe(false)
  })
  it('the stage is CSS 3D with no new dependency, always dark, and reduced motion turns its transitions off', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(css).toMatch(/\.v3-xp-stage \{[^}]*perspective: 1600px/)
    // Three columns from 1280px: the right column is a real 300px track, and below that it
    // stacks under the stage rather than disappearing.
    expect(css).toMatch(/\.v3-xp-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\);/)
    expect(css).toMatch(/@media \(min-width: 1280px\) \{\s*\.v3-xp-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\) 300px/)
    expect(css).not.toMatch(/\.v3-xp-right \{[^}]*display: none/)
    expect(css).toMatch(/\.v3-xp-stage \{[^}]*height: calc\(100dvh - var\(--v3-header-h\)\)/)
    expect(css).toMatch(/\.v3-xp-space \{[^}]*transform-style: preserve-3d/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.v3-xp-card[^}]*transition: none/)
    const src = readFileSync('src/app/reviews/ExploreStage.tsx', 'utf8')
    expect(src).toContain('className="v3-theme dark v3-xp"')
    // Inside the shell, as a page-owned header replacing the standard one — not a second chrome.
    expect(src).toMatch(/<V3Shell [^>]*header=\{topBar\} flush>/)
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    for (const dep of ['framer-motion', 'motion', 'swiper', 'embla-carousel', 'three', 'gsap', '@react-spring/web']) {
      expect(pkg.dependencies?.[dep] ?? pkg.devDependencies?.[dep]).toBeUndefined()
    }
  })
})
