// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { readFileSync, existsSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/reviews',
  useSearchParams: () => new URLSearchParams(),
}))

/** The real player mounts media. Here it is a MARKER that forwards the one method the
 *  card calls, so the tests can count the thing that matters: how many players exist. */
const pauseToggle = vi.fn()
vi.mock('@/components/explore/VideoPlayer', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    __esModule: true,
    default: forwardRef(function MockPlayer({ url, active }: { url: string; active?: boolean }, ref: React.Ref<unknown>) {
      useImperativeHandle(ref, () => ({ onUserPauseToggle: pauseToggle }), [])
      return <div data-testid="player" data-url={url} data-active={String(!!active)} />
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

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import ExploreStage, { slotTransform, slotRole } from './ExploreStage'

// ── V3 Web · EXPLORE — the spatial stage ────────────────────────────────────
//
// 🚨🚨 THE RULE THIS FILE EXISTS FOR: **SEVERAL VISIBLE, ONE PLAYING, ONE INDEX.**
//
// The stage draws up to five clips in one perspective space and mounts the player on the
// active one only — every other card is a poster, so there is exactly one <video>. The
// active index is the single source of truth: the player, the overlay, the Ask-Tappy `ctx`
// and the position readout all derive from it, and the tests below read all of them from
// the same `data-active-review-id`.
//
// The second thing pinned is data honesty, carried over from the previous desktop surface:
// no invented clips, no engagement figures, no topic taxonomy, no subject that the clip did
// not supply.

const clip = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: 'u1', place_name: 'Chia sẻ', place_address: null, rating: 0,
  body: `caption ${id}`, photos: null, like_count: 0, comment_count: 0, save_count: 0,
  created_at: new Date().toISOString(), liked_by_me: false, saved_by_me: false,
  profiles: { full_name: 'Huy', avatar_url: null },
  content_type: 'video', media_url: `https://example.com/${id}.mp4`,
  thumbnail: `https://example.com/${id}.jpg`, source_type: 'upload', hashtags: ['#pho'],
  ...over,
})
const five = () => ['a', 'b', 'c', 'd', 'e'].map(id => clip(id))
const seven = () => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => clip(id))

let lastUrl = ''
function mockFeed(rows: unknown[]) {
  lastUrl = ''
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    lastUrl = String(url)
    return { ok: true, status: 200, json: async () => ({ reviews: rows, page: 0, limit: 20, hasMore: false }) }
  }))
}

const players = () => screen.queryAllByTestId('player')
const posters = () => screen.queryAllByTestId('poster')
const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-explore-card]'))
const stage = () => document.querySelector<HTMLElement>('[data-explore-stage]')!
const activeId = () => stage().getAttribute('data-active-review-id')
const ask = () => document.querySelector<HTMLAnchorElement>('[data-stage-ask]')
const untilStage = () => waitFor(() => expect(stage()).toBeTruthy())

beforeEach(() => { vi.unstubAllGlobals(); pauseToggle.mockClear(); trackMock.mockClear() })
afterEach(cleanup)

describe('several visible, ONE playing', () => {
  it('mounts exactly one player for a feed of five, and posters for the rest that are drawn', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    expect(players()).toHaveLength(1)
    expect(posters().length).toBeGreaterThanOrEqual(2)
    expect(players()[0].getAttribute('data-url')).toBe('https://example.com/a.mp4')
  })

  it('never renders a player and a poster on the same card', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    for (const card of cards()) {
      const hasPlayer = !!card.querySelector('[data-testid="player"]')
      const hasPoster = !!card.querySelector('[data-testid="poster"]')
      expect(hasPlayer !== hasPoster, 'a card is a player OR a poster').toBe(true)
    }
  })

  it('marks exactly one card active and starts on the first clip', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    expect(cards().filter(c => c.dataset.active === 'true')).toHaveLength(1)
    expect(stage().getAttribute('data-active-index')).toBe('0')
    expect(activeId()).toBe('a')
  })

  it('MOVES the single player when a neighbour is selected — it does not add one', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
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
    await untilStage()
    // At index 0 only the forward side exists: active + 3.
    expect(cards().map(c => c.dataset.role)).toEqual(['active', 'near', 'far', 'hidden'])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(activeId()).toBe('d'))
    expect(cards().map(c => c.dataset.role)).toEqual(['hidden', 'far', 'near', 'active', 'near', 'far', 'hidden'])
    expect(cards().length).toBeLessThanOrEqual(7)
    expect(players()).toHaveLength(1)
  })
})

describe('the active index is the single source of truth', () => {
  it('player url, Ask-Tappy ctx and the readout all follow the same review, and move together', async () => {
    mockFeed(five().map(r => ({ ...r, place_name: `Quán ${r.id}` })))
    render(<ExploreStage />)
    await untilStage()
    const check = (id: string, pos: string) => {
      expect(activeId()).toBe(id)
      expect(players()[0].getAttribute('data-url')).toBe(`https://example.com/${id}.mp4`)
      expect(ask()!.getAttribute('href')).toContain(`ctx=${id}`)
      expect(ask()!.getAttribute('href')).toContain(encodeURIComponent(`Quán ${id}`))
      expect(document.querySelector('[data-stage-pos]')!.textContent).toBe(pos)
      expect(document.querySelectorAll('[data-stage-ask]')).toHaveLength(1)
    }
    check('a', '1 / 5')
    fireEvent.click(document.querySelector('[data-stage-next]')!)
    await waitFor(() => check('b', '2 / 5'))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => check('c', '3 / 5'))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => check('b', '2 / 5'))
  })

  it('prev is disabled on the first clip and next on the last', async () => {
    mockFeed(five().slice(0, 2))
    render(<ExploreStage />)
    await untilStage()
    expect((document.querySelector('[data-stage-prev]') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(document.querySelector('[data-stage-next]')!)
    await waitFor(() => expect(activeId()).toBe('b'))
    expect((document.querySelector('[data-stage-next]') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('the space turns with the pointer', () => {
  const swipe = (dx: number, dt = 100) => {
    const el = stage()
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 500, clientY: 300 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 500 + dx / 2, clientY: 300 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 500 + dx, clientY: 300 })
    // The release carries the same coordinates the last move did.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + dt)
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 500 + dx, clientY: 300 })
    vi.restoreAllMocks()
  }

  it('a leftward swipe advances one clip; a rightward one goes back; the player follows', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    swipe(-160)
    await waitFor(() => expect(activeId()).toBe('b'))
    expect(players()).toHaveLength(1)
    swipe(160)
    await waitFor(() => expect(activeId()).toBe('a'))
  })

  it('mid-drag the active card has already moved, and the stage says it is dragging', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
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
    await untilStage()
    swipe(-3)
    await new Promise(r => setTimeout(r, 20))
    expect(activeId()).toBe('a')
  })
})

describe('the spatial model (pure)', () => {
  const g = { x: [0, 0.82, 1.46, 1.8], z: [0, -230, -460, -640], rot: [0, 18, 28, 34], sc: [1, 0.8, 0.64, 0.52], op: [1, 0.78, 0.46, 0], divisor: 3.2 }
  it('the active clip is nearest, largest, fully opaque and unturned', () => {
    expect(slotTransform(0, g, 300)).toEqual({ transform: 'translate3d(calc(-50% + 0.0px), -50%, 0.0px) rotateY(0.00deg) scale(1.000)', opacity: 1 })
  })
  it('neighbours sit behind, smaller and turned away, mirrored left and right', () => {
    const right = slotTransform(1, g, 300)
    const left = slotTransform(-1, g, 300)
    expect(right.transform).toBe('translate3d(calc(-50% + 246.0px), -50%, -230.0px) rotateY(-18.00deg) scale(0.800)')
    expect(left.transform).toBe('translate3d(calc(-50% + -246.0px), -50%, -230.0px) rotateY(18.00deg) scale(0.800)')
    expect(right.opacity).toBe(0.78)
  })
  it('the far pair is deeper and dimmer; beyond it a card is invisible', () => {
    expect(slotTransform(2, g, 300).opacity).toBe(0.46)
    expect(slotTransform(3, g, 300).opacity).toBe(0)
    expect(slotTransform(9, g, 300).opacity).toBe(0)
  })
  it('a drag interpolates between slots, so the space moves continuously', () => {
    const half = slotTransform(0.5, g, 300)
    expect(half.transform).toBe('translate3d(calc(-50% + 123.0px), -50%, -115.0px) rotateY(-9.00deg) scale(0.900)')
    expect(half.opacity).toBeCloseTo(0.89)
  })
  it('roles come from the integer distance only', () => {
    expect([0, 1, -1, 2, -2, 3, 8].map(slotRole)).toEqual(['active', 'near', 'near', 'far', 'far', 'hidden', 'hidden'])
  })
})

describe('it shows the videos that exist, and only those', () => {
  it('leaves out rows with no playable clip', async () => {
    mockFeed([clip('a'), clip('b', { content_type: 'photo', media_url: null }), clip('c', { media_url: null })])
    render(<ExploreStage />)
    await untilStage()
    expect(cards()).toHaveLength(1)
    expect(document.querySelector('[data-stage-pos]')!.textContent).toBe('1 / 1')
  })
  it('does NOT invent clips: two clips draw two cards', async () => {
    mockFeed(five().slice(0, 2))
    render(<ExploreStage />)
    await untilStage()
    expect(cards()).toHaveLength(2)
    expect(document.querySelectorAll('.v3-stage-dot')).toHaveLength(2)
  })
  it('says so when there is nothing to play', async () => {
    mockFeed([])
    render(<ExploreStage />)
    await waitFor(() => expect(screen.getByText('No videos to show yet.')).toBeTruthy())
    expect(document.querySelector('[data-explore-stage]')).toBeNull()
  })
})

describe('nothing on a card is invented', () => {
  it('prints no engagement figures', async () => {
    mockFeed([clip('a', { like_count: 1234, comment_count: 56, view_count: 9999 })])
    render(<ExploreStage />)
    await untilStage()
    expect(cards()[0].textContent).not.toMatch(/1234|56|9999|1\.2K/)
  })
  it('renders no creator block when the feed sent no profile', async () => {
    mockFeed([clip('a', { profiles: null })])
    render(<ExploreStage />)
    await untilStage()
    expect(document.querySelector('a[href^="/users/"]')).toBeNull()
  })
  it('offers the filters the endpoint really supports, not the mockup taxonomy', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    const chips = Array.from(document.querySelectorAll('.v3-stage-chip')).map(c => c.textContent)
    expect(chips).toEqual(['For You', 'Following', 'Latest'])
  })
})

describe('it uses the mechanisms that already exist', () => {
  it('reads the existing feed endpoint, and its existing sorts', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    expect(lastUrl).toBe('/api/reviews/feed?page=0&limit=20')
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    await waitFor(() => expect(lastUrl).toBe('/api/reviews/feed?page=0&limit=20&sort=latest'))
    fireEvent.click(screen.getByRole('button', { name: 'Following' }))
    await waitFor(() => expect(lastUrl).toBe('/api/reviews/feed?page=0&limit=20&following=true'))
  })
  it('searches through the same endpoint rather than a new one', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    const input = document.querySelector('.v3-stage-search') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bún bò' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(lastUrl).toBe(`/api/reviews/feed?search=${encodeURIComponent('bún bò')}&limit=20`))
  })
  it('hands off to Chat through the existing bridge, carrying the ACTIVE clip and what it IS', async () => {
    mockFeed([clip('a', { place_name: 'Bún bò Cô Ba' }), clip('b')])
    render(<ExploreStage />)
    await untilStage()
    const href = ask()!.getAttribute('href')!
    expect(href.startsWith('/chat?q=')).toBe(true)
    expect(href).toContain('ctx=a')
    expect(decodeURIComponent(href)).toContain('Bún bò Cô Ba')
    expect(decodeURIComponent(href)).not.toMatch(/muốn|want/i)
  })
  it('has no bridge at all when the clip has neither a place nor a caption', async () => {
    mockFeed([clip('a', { place_name: 'Chia sẻ', body: '' })])
    render(<ExploreStage />)
    await untilStage()
    expect(ask()).toBeNull()
  })
  it('measures the bridge: ONE ask_tappy_place click with source_surface explore_desktop', async () => {
    mockFeed([clip('a', { place_name: 'Quán A', place_address: '1 Lê Lợi' })])
    render(<ExploreStage />)
    await untilStage()
    fireEvent.click(ask()!)
    expect(trackMock).toHaveBeenCalledTimes(1)
    const [type, meta] = trackMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(type).toBe('ask_tappy_place')
    expect(meta).toMatchObject({ phase: 'click', review_id: 'a', source_surface: 'explore_desktop', has_address: true })
  })
  it('the click on the bridge does not also pause the card', async () => {
    mockFeed([clip('a', { place_name: 'Quán A' })])
    render(<ExploreStage />)
    await untilStage()
    fireEvent.click(ask()!)
    expect(pauseToggle).not.toHaveBeenCalled()
  })
})

describe('the author is a way into the profile that already exists', () => {
  it('links the creator block to /users/[id] on the active card, and the click does not pause', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    const link = document.querySelector('a[href="/users/u1"]')!
    expect(link).toBeTruthy()
    fireEvent.click(link)
    expect(pauseToggle).not.toHaveBeenCalled()
  })
})

describe('the playing clip can be paused', () => {
  it('tells the session the user toggled pause, instead of re-selecting the card', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
    const frame = cards()[0].querySelector('button')!
    fireEvent.click(frame)
    expect(pauseToggle).toHaveBeenCalledTimes(1)
    expect(activeId()).toBe('a')
    expect(document.querySelector('.fill-white')).toBeTruthy()
  })
  it('selects an inactive card rather than pausing it', async () => {
    mockFeed(five())
    render(<ExploreStage />)
    await untilStage()
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
  it('the stage is CSS 3D with no new dependency, and reduced motion turns its transitions off', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(css).toMatch(/\.v3-stage \{[^}]*perspective: 1500px/)
    expect(css).toMatch(/\.v3-stage-space \{[^}]*transform-style: preserve-3d/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.v3-stage-card[^}]*transition: none/)
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    for (const dep of ['framer-motion', 'motion', 'swiper', 'embla-carousel', 'three', 'gsap', '@react-spring/web']) {
      expect(pkg.dependencies?.[dep] ?? pkg.devDependencies?.[dep]).toBeUndefined()
    }
  })
})
