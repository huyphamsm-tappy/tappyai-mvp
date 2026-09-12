// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/reviews',
  useSearchParams: () => new URLSearchParams(),
}))

/** The real player mounts media. Here it is a MARKER, so the tests can count the
 *  thing that actually matters: how many players exist at once.
 *
 *  🔑 It FORWARDS A REF exposing the one method the card is supposed to call.
 *  The card cannot pause a clip it never took a handle to, and that omission is
 *  exactly the bug the pause tests below pin — a marker with no ref would have
 *  let the regression back in silently. */
const pauseToggle = vi.fn()
vi.mock('@/components/explore/VideoPlayer', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    __esModule: true,
    default: forwardRef(function MockPlayer(
      { url, active }: { url: string; active?: boolean },
      ref: React.Ref<unknown>,
    ) {
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

// `feedShared` is imported for `Review` and `isShareOnlyName`, and it drags the music module in
// with it — which builds a Supabase client at import time and needs credentials this suite has no
// business holding. Same mocks the neighbouring bridge test uses; neither is what this file guards.
vi.mock('@/modules/music', () => ({
  useMusicTrack: () => ({ track: null }),
  getPreviewUrl: () => null,
}))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
/** The analytics batcher, recorded rather than flushed — the desktop CTA emits `ask_tappy_place`. */
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

import ExploreV3Desktop from './ExploreV3Desktop'

// V3 Web · Page 3 — EXPLORE (desktop).
//
// 🚨🚨 THE RULE THIS FILE EXISTS FOR: **FIVE VISIBLE, ONE PLAYING.**
//
// Five simultaneously autoplaying clips is both a UX failure and a performance one, and it is the
// default outcome of a naive carousel. The implementation does not rely on remembering to pause:
// only the active card mounts a player at all, and every other card renders a poster. So the
// assertions below count PLAYERS, not paused flags — a paused player can be resumed by a stray
// event, and a player that was never mounted cannot.
//
// The second thing pinned here is data honesty, because Explore is where invention is most
// tempting: the design reference is full of illustrative view counts, follower counts and a
// ten-topic taxonomy, and none of that exists in this repository.

const clip = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: 'u1', place_name: 'Chia sẻ', place_address: null, rating: 0,
  body: `caption ${id}`, photos: null, like_count: 0, comment_count: 0, save_count: 0,
  created_at: new Date().toISOString(), liked_by_me: false, saved_by_me: false,
  profiles: { full_name: 'Huy', avatar_url: null },
  content_type: 'video', media_url: `https://example.com/${id}.mp4`,
  thumbnail: `https://example.com/${id}.jpg`, source_type: 'upload', hashtags: ['#pho'],
  ...over,
})

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
const cards = () => document.querySelectorAll('[data-explore-card]')

beforeEach(() => { vi.unstubAllGlobals(); pauseToggle.mockClear(); trackMock.mockClear() })
afterEach(cleanup)

describe('five visible, ONE playing', () => {
  it('mounts exactly one player for a full row of clips', async () => {
    mockFeed(['a', 'b', 'c', 'd', 'e'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(5))

    expect(players().length, 'a second player means a second clip is playing').toBe(1)
    expect(posters().length, 'every other card is a poster, not a paused player').toBe(4)
  })

  it('never renders a player and a poster for the same card', async () => {
    mockFeed(['a', 'b', 'c'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(3))
    for (const card of cards()) {
      const hasPlayer = !!card.querySelector('[data-testid="player"]')
      const hasPoster = !!card.querySelector('[data-testid="poster"]')
      expect(hasPlayer && hasPoster, 'a card is either playing or a still, never both').toBe(false)
    }
  })

  it('marks exactly one card active', async () => {
    mockFeed(['a', 'b', 'c', 'd', 'e'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(5))
    const active = [...cards()].filter(c => c.getAttribute('data-active') === 'true')
    expect(active.length).toBe(1)
  })

  it('MOVES the single player when another clip is selected — it does not add one', async () => {
    // 🚨 The regression this catches is the expensive one: selecting a new clip while the old
    // player stays mounted. The page would then have two <video> elements, and the previous clip
    // would keep running behind the new one — audible, and exactly what the brief forbids.
    mockFeed(['a', 'b', 'c', 'd', 'e'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(5))

    const before = players()[0].getAttribute('data-url')
    const inactive = [...cards()].find(c => c.getAttribute('data-active') !== 'true')!
    fireEvent.click(inactive.querySelector('button[aria-pressed]')!)

    await waitFor(() => {
      expect(players()[0].getAttribute('data-url'), 'the player must move to the new clip').not.toBe(before)
    })
    expect(players().length, 'still exactly one player after switching').toBe(1)
    expect([...cards()].filter(c => c.getAttribute('data-active') === 'true').length).toBe(1)
  })

  it('starts on the centre card, the way the composition reads', async () => {
    mockFeed(['a', 'b', 'c', 'd', 'e'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(5))
    const idx = [...cards()].findIndex(c => c.getAttribute('data-active') === 'true')
    expect(idx, 'the eye lands in the middle of a five-card row').toBe(2)
  })

  it('clamps the focus to a short feed instead of pointing at an empty slot', async () => {
    mockFeed([clip('a'), clip('b')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(2))
    expect(players().length).toBe(1)
    expect([...cards()].filter(c => c.getAttribute('data-active') === 'true').length).toBe(1)
  })
})

describe('the row gets denser as the feed grows — one rule, no low-content branch', () => {
  // 🚨 The database really does hold two clips today, and the design target really is five. The
  // component must make BOTH look deliberate without a special case, so the number of slots the
  // row divides itself into is the real clip count capped at the window, and the card's width is
  // `min(even share of the row, its own height x 9/16)`. jsdom performs no layout, so what is
  // asserted here is the input to that formula — the geometry itself is verified in a browser.
  const slots = () => document.querySelector('[data-explore-track]')?.getAttribute('data-slots')

  it('divides the row by 2 when two clips exist', async () => {
    mockFeed([clip('a'), clip('b')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(2))
    expect(slots()).toBe('2')
  })

  it('divides by 3 when three exist', async () => {
    mockFeed(['a', 'b', 'c'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(3))
    expect(slots()).toBe('3')
  })

  it('reaches the five-card composition at five', async () => {
    mockFeed(['a', 'b', 'c', 'd', 'e'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(5))
    expect(slots(), 'the mature state the reference specifies').toBe('5')
  })

  it('stays at five once the feed outgrows the window', async () => {
    // Growth past five must not keep shrinking the cards — it fills the carousel instead.
    mockFeed(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => clip(id)))
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(5))
    expect(slots()).toBe('5')
  })

  it('offers pagination only when there is somewhere to page to', async () => {
    // Dots under a feed that is entirely on screen would imply clips that do not exist.
    mockFeed([clip('a'), clip('b')])
    const { container } = render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(2))
    expect(container.querySelector('[aria-label*="tiếp"], [aria-label*="Next"]'), 'nothing to advance to').toBeNull()
    // …and instead says, in words, that the feed will fill as people post.
    expect(container.textContent).toMatch(/cộng đồng đăng tải|as people post/i)
  })

  it('shows the carousel controls once there IS a next window', async () => {
    mockFeed(['a', 'b', 'c', 'd', 'e', 'f'].map(id => clip(id)))
    const { container } = render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(5))
    expect(container.querySelector('button[aria-label]'), 'a six-clip feed can advance').toBeTruthy()
    expect(container.textContent, 'and stops claiming the feed is still filling up')
      .not.toMatch(/cộng đồng đăng tải|as people post/i)
  })
})

describe('the page has ONE identity', () => {
  it('does not print its own title under the shell’s', async () => {
    // 🚨 The shell header said "Explore (Video)" while the content said the page title in
    // Vietnamese — one destination named twice, in two different strings, reading as two pages.
    // The shell's existing `title` prop carries it now, so the content must not repeat it.
    mockFeed([clip('a')])
    const { container } = render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    const headings = [...container.querySelectorAll('h1')].map(h => (h.textContent ?? '').trim())
    expect(headings.length, 'exactly one page title, and it belongs to the shell').toBeLessThanOrEqual(1)
    expect(headings.filter(h => /explore \(video\)/i.test(h)), 'the nav label is not a page title').toEqual([])
  })
})

describe('it shows the videos that exist, and only those', () => {
  it('leaves out rows with no playable clip', async () => {
    // Explore is a video surface. A photo review has nothing to show in a 9:16 frame, and
    // padding the row with one would be filling a video feed with things that are not videos.
    mockFeed([
      clip('a'),
      clip('b', { content_type: 'photo', media_url: null, photos: ['https://example.com/p.jpg'] }),
      clip('c', { media_url: null }),
    ])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
  })

  it('does NOT invent clips to reach five', async () => {
    // 🚨 The composition targets five cards; the data decides how many there are. Repeating a
    // clip to fill the row would put content on screen that does not exist.
    mockFeed([clip('a'), clip('b')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(2))
    const urls = [...cards()].map(c =>
      c.querySelector('[data-testid="player"]')?.getAttribute('data-url')
      ?? c.querySelector('[data-testid="poster"]')?.getAttribute('data-id'))
    expect(new Set(urls).size, 'no clip appears twice').toBe(urls.length)
  })

  it('says so when there is nothing to play', async () => {
    mockFeed([])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(screen.getByText(/chưa có video|no videos/i)).toBeTruthy())
    expect(cards().length).toBe(0)
  })
})

describe('nothing on a card is invented', () => {
  it('prints no engagement figures', async () => {
    // 🚨 The design reference shows view counts, like counts and follower counts. This feed's
    // real numbers are mostly zero, and the reference's are illustrative. Neither belongs on a
    // card: printing "0" states something about a creator, and printing the mockup's numbers
    // states something false.
    mockFeed([clip('a', { like_count: 0, comment_count: 0, save_count: 0 })])
    const { container } = render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    const text = cards()[0].textContent ?? ''
    for (const pattern of [/\b\d+(\.\d+)?[KM]\b/, /\b\d+\s*(views?|likes?|followers?|lượt)/i, /^\s*0\s*$/m]) {
      expect(text, `a card is printing an engagement figure: ${text}`).not.toMatch(pattern)
    }
    expect(container.textContent).not.toMatch(/\bfollow\b/i)
  })

  it('renders no creator block when the feed sent no profile', async () => {
    mockFeed([clip('a', { profiles: null })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    expect(cards()[0].textContent).not.toContain('Huy')
  })

  it('offers the filters the endpoint really supports, not the mockup taxonomy', async () => {
    // 🚨 `reviews` has NO category column — see the note on SORTS. The reference's ten topic
    // chips would be either inert controls or an invented taxonomy, so the row carries the three
    // real feed sorts. If a category column ever lands, this test changes with the feature.
    mockFeed([clip('a')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    const chips = [...document.querySelectorAll('button[aria-pressed]')]
      .map(b => (b.textContent ?? '').trim()).filter(Boolean)
    expect(chips.length, 'three real sorts').toBe(3)
    for (const invented of [/ẩm thực/i, /du lịch/i, /cafe/i, /giải trí/i, /làm đẹp/i, /sức khỏe/i, /công nghệ/i]) {
      expect(chips.join(' '), 'a topic chip with no data behind it').not.toMatch(invented)
    }
  })
})

describe('it uses the mechanisms that already exist', () => {
  it('reads the existing feed endpoint, and its existing sorts', async () => {
    mockFeed([clip('a')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(lastUrl).toContain('/api/reviews/feed'))

    const latest = [...document.querySelectorAll('button[aria-pressed]')]
      .find(b => /mới nhất|latest/i.test(b.textContent ?? ''))!
    fireEvent.click(latest)
    await waitFor(() => expect(lastUrl).toContain('sort=latest'))
  })

  it('searches through the same endpoint rather than a new one', async () => {
    mockFeed([clip('a')])
    const { container } = render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))

    // 🔑 TARGETS EXPLORE'S OWN FIELD BY NAME, not "the first input on the page".
    // The V3 header now carries a global command search (it asks Tappy — see V3Shell), so a
    // page hosting the shell has two search inputs and this used to drive whichever came first
    // in the DOM. Selecting by accessible name is what this test always meant: prove EXPLORE's
    // search goes through the feed endpoint.
    const input = screen.getByLabelText(/search videos|tìm video/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bún bò' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(lastUrl).toContain('search='))
    expect(lastUrl, 'no second search service').toContain('/api/reviews/feed')
  })

  it('hands off to Chat through the existing bridge', async () => {
    mockFeed([clip('a', { place_name: 'Bún bò Huế Cô Ba' })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    const bridge = cards()[0].querySelector('a[href^="/chat?q="]')
    expect(bridge, 'the differentiator is video -> ask Tappy').toBeTruthy()
    expect(decodeURIComponent(bridge!.getAttribute('href')!)).toContain('Bún bò Huế Cô Ba')
  })

  it('carries what the clip IS, never what the user supposedly wants', async () => {
    mockFeed([clip('a', { place_name: 'Bún bò Huế Cô Ba' })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    const q = decodeURIComponent(cards()[0].querySelector('a[href^="/chat?q="]')!.getAttribute('href')!)
    for (const fabricated of [/đặt bàn/i, /book a table/i, /giá bao nhiêu/i, /how much/i, /giảm giá/i]) {
      expect(q).not.toMatch(fabricated)
    }
  })

  it('has no bridge at all when the clip has neither a place nor a caption', async () => {
    // Share-only clips carry a sentinel place name. With no caption either there is no subject,
    // and a bridge built from nothing would open a thread about nothing.
    mockFeed([clip('a', { place_name: 'Chia sẻ', body: '' })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    expect(cards()[0].querySelector('a[href^="/chat?q="]'), 'no subject, no bridge').toBeNull()
  })

  it('measures the bridge: ONE ask_tappy_place click with source_surface explore_desktop', async () => {
    mockFeed([clip('review-9', { place_name: 'GÓC HUẾ', place_address: '155 Nguyễn Thái Bình, Quận 1' })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    const bridge = cards()[0].querySelector<HTMLAnchorElement>('a[href^="/chat?q="]')!
    expect(trackMock, 'rendering is not a click').not.toHaveBeenCalled()
    bridge.addEventListener('click', e => e.preventDefault())
    fireEvent.click(bridge)
    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('ask_tappy_place', {
      phase: 'click', review_id: 'review-9', source_surface: 'explore_desktop', clip_target_status: 'unknown', has_address: true,
    })
    // Ids and enums only — the place name and caption stay out of the payload.
    const payload = JSON.stringify(trackMock.mock.calls[0][1])
    for (const leak of ['GÓC HUẾ', 'Nguyễn Thái Bình', 'caption review-9']) expect(payload, leak).not.toContain(leak)
  })

  it('the click on the bridge does not also select or toggle the card', async () => {
    mockFeed([clip('a', { place_name: 'GÓC HUẾ' }), clip('b', { place_name: 'Cô Ba' })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(2))
    const before = Array.from(cards()).map(c => c.getAttribute('data-active'))
    const bridge = cards()[1].querySelector<HTMLAnchorElement>('a[href^="/chat?q="]')!
    bridge.addEventListener('click', e => e.preventDefault())
    fireEvent.click(bridge)
    expect(trackMock.mock.calls[0][1]).toMatchObject({ review_id: 'b', source_surface: 'explore_desktop', has_address: false })
    expect(Array.from(cards()).map(c => c.getAttribute('data-active'))).toEqual(before)
    expect(pauseToggle).not.toHaveBeenCalled()
  })
})

describe('the author is a way into the profile that already exists', () => {
  it('links the creator block to /users/[id]', async () => {
    // 🚨 THE PROFILE WAS NEVER MISSING — THIS SURFACE HAD NO WAY IN.
    // `/users/[id]` ships, and the MOBILE feed has linked to it from the avatar
    // all along. The desktop card rendered the same name and picture as plain
    // spans, so on a wide screen the author was simply not clickable.
    mockFeed([clip('a', { user_id: 'author-9', profiles: { full_name: 'Mai Anh', avatar_url: null } })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))

    const link = screen.getByRole('link', { name: /mai anh/i })
    expect(link.getAttribute('href')).toBe('/users/author-9')
  })

  it('does not also select the card when the author is clicked', async () => {
    // The frame button underneath owns every other click on the tile; without
    // stopPropagation the author link would fight it.
    mockFeed([clip('a'), clip('b')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(2))

    const link = screen.getAllByRole('link', { name: /huy/i })[0]
    fireEvent.click(link)
    // Still exactly one player, and still on the first card: nothing was reselected.
    expect(players()).toHaveLength(1)
  })

  it('renders no author link when the feed sent no profile', async () => {
    // Nothing invented: no profile, no name, no link to a page about nobody.
    mockFeed([clip('a', { profiles: null })])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(1))
    expect(screen.queryByRole('link', { name: /huy/i })).toBeNull()
  })
})

describe('the playing clip can be paused', () => {
  it('tells the session the user toggled pause, instead of re-selecting the card', async () => {
    /**
     * 🚨 THE BUG: the frame-sized button sits above the player and its only job
     * was `onSelect()`. On the card that is ALREADY active that call is a no-op,
     * so a click on a playing clip did nothing at all — the click never reached
     * the <video>, and nothing else was listening.
     *
     * The fix is not a new pause implementation: `PlaybackSession.onUserPauseToggle()`
     * has existed since WEB-EXPLORE-YOUTUBE-001 and the mobile feed has called it
     * for as long. Desktop simply never took the handle.
     */
    mockFeed([clip('a')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(players()).toHaveLength(1))

    const frame = screen.getAllByRole('button', { pressed: true })
      .find(b => /phát|pause|play/i.test(b.getAttribute('aria-label') ?? ''))!
    fireEvent.click(frame)
    expect(pauseToggle).toHaveBeenCalledTimes(1)

    // And again to resume — the session owns the sticky intent, the card only reports the tap.
    fireEvent.click(frame)
    expect(pauseToggle).toHaveBeenCalledTimes(2)
  })

  it('selects an inactive card rather than pausing it', async () => {
    mockFeed([clip('a'), clip('b')])
    render(<ExploreV3Desktop />)
    await waitFor(() => expect(cards().length).toBe(2))

    const inactiveFrame = screen.getAllByRole('button', { pressed: false })
      .find(b => /phát|play/i.test(b.getAttribute('aria-label') ?? ''))!
    fireEvent.click(inactiveFrame)

    // A card that is not playing has nothing to pause; the click selects it.
    expect(pauseToggle).not.toHaveBeenCalled()
    await waitFor(() => expect(players()).toHaveLength(1))
  })

  it('shows the paused affordance only after the user pauses', async () => {
    mockFeed([clip('a')])
    const { container } = render(<ExploreV3Desktop />)
    await waitFor(() => expect(players()).toHaveLength(1))

    // An autoplaying clip is not a paused one and must not claim to be.
    expect(container.querySelector('svg.lucide-play')).toBeNull()

    const frame = screen.getAllByRole('button', { pressed: true })
      .find(b => /phát|pause|play/i.test(b.getAttribute('aria-label') ?? ''))!
    fireEvent.click(frame)
    await waitFor(() => expect(container.querySelector('svg.lucide-play')).toBeTruthy())
  })
})
