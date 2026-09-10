// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/reviews',
  useSearchParams: () => new URLSearchParams(),
}))

// The feed item pulls in the video player and the music module; neither is what this file guards.
vi.mock('@/components/explore/VideoPlayer', () => ({
  __esModule: true,
  default: () => null,
  isFeedAudioUnlocked: () => true,
}))
vi.mock('@/modules/music', () => ({
  useMusicTrack: () => ({ track: null }),
  getPreviewUrl: () => null,
}))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))

import { Post, type Review } from './feedShared'
// Aliased: `vi` is already vitest's mocking utility in this file.
import { en as enCopy, vi as viCopy } from '@/lib/i18n/w2/reviews'

// V3 Web · Explore (`/reviews`) — the ONE approved change to this surface.
//
// Explore keeps its identity (OD-2): feed mechanics, the always-dark stage, TikNav, and
// like/comment/share are all untouched, and the global shell nav stays hidden here. The single
// addition is a bridge into /chat, and it has two honesty rules that are easy to break silently:
//
//   1. it carries WHAT THE ITEM IS, never what the user wants;
//   2. it does not appear at all when there is no real place to ask about.
//
// Rule 2 is the one a refactor would quietly lose: a share-only post has no `place_name`, and a
// bridge built from it would open a thread about an empty string. That reads as a working button.

afterEach(cleanup)

const BASE = {
  id: 'r1',
  user_id: 'u1',
  place_name: 'Bún bò Huế Cô Ba',
  body: 'Ngon bá cháy',
  rating: 5,
  like_count: 1,
  comment_count: 0,
  liked_by_me: false,
  saved_by_me: false,
  created_at: new Date().toISOString(),
  profiles: { full_name: 'Huy', avatar_url: null },
  content_type: 'video',
  media_url: 'https://example.com/v.mp4',
  source_type: 'upload',
  is_following: false,
} as unknown as Review

function renderPost(overrides: Partial<Review> = {}) {
  const noop = () => {}
  return render(
    <Post
      r={{ ...BASE, ...overrides }}
      me="u2"
      feedType="for-you"
      onFeedTypeChange={noop}
      renderVideo={false}
      onLike={noop}
      onLikeDouble={noop}
      onSave={noop}
      onComment={noop}
      onShare={noop}
      onDelete={noop}
      onSoundTap={noop}
    />,
  )
}

/** The bridge link, if the feed item rendered one. */
function bridge(container: HTMLElement): HTMLAnchorElement | null {
  return container.querySelector('a[href^="/chat?q="]')
}

describe('Explore → Chat bridge (the one thing V3 adds to Explore)', () => {
  it('carries the place the item is about', () => {
    const { container } = renderPost()
    const href = bridge(container)?.getAttribute('href')
    expect(href, 'the feed item must offer a way to ask Tappy about the place').toBeTruthy()
    expect(decodeURIComponent(href!)).toContain('Bún bò Huế Cô Ba')
  })

  it('does not decide what the user wants', () => {
    // The prompt arrives in the thread as if the user typed it, so it may name the subject and
    // ask about it — it may not assert an intent the user never expressed.
    const { container } = renderPost()
    const q = decodeURIComponent(bridge(container)!.getAttribute('href')!)
    for (const fabricated of [/đặt bàn/i, /book a table/i, /giá bao nhiêu/i, /how much/i]) {
      expect(q, 'the bridge carries what the item IS, not what the user wants').not.toMatch(fabricated)
    }
  })

  it('is absent entirely when the post has no real place to ask about', () => {
    // A share-only post carries no subject. An empty-subject bridge would look like a working
    // button and open a thread about nothing.
    const { container } = renderPost({ place_name: '' })
    expect(bridge(container), 'no subject, no bridge').toBeNull()
  })

  it('leaves the rest of the rail alone (OD-2)', () => {
    // Identity unchanged: like, comment, save and share all still there.
    const { container } = renderPost()
    const buttons = container.querySelectorAll('button')
    expect(buttons.length, 'the feed rail must keep its own actions').toBeGreaterThanOrEqual(4)
  })

  it('meets the 44px touch floor and shows focus (cross-screen invariant 5)', () => {
    // The feed's neighbouring gesture layer turns an undersized target into a
    // swipe. The class is asserted rather than the computed height because jsdom
    // does not apply Tailwind — what ships is the class, so that is the contract.
    const { container } = renderPost()
    const cls = bridge(container)!.className
    expect(cls, 'the bridge must meet the 44x44 floor').toContain('min-h-[44px]')
    expect(cls, 'an invisible focus ring is an invisible control').toContain('focus-visible:ring')
  })
})

// ── S-07 offline state ──────────────────────────────────────────────────────
//
// The spec is precise about what offline means here: cached items stay READABLE
// and the ask affordance is DISABLED. Both halves are asserted, because either
// one alone is the wrong behaviour — a feed that blanks out, or a live button
// that cannot work.

describe('offline', () => {
  const setOnline = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
  }
  afterEach(() => setOnline(true))

  it('withholds the bridge, and says why in words rather than only in colour', () => {
    setOnline(false)
    const { container, getByTestId, getByText } = renderPost()
    expect(bridge(container), 'offline: the bridge must not be a live link').toBeNull()
    // Still present, still named — inert, not vanished. A control that disappears
    // when the connection drops reads as a broken page.
    const disabled = getByTestId('ask-tappy-offline')
    expect(disabled.getAttribute('aria-disabled')).toBe('true')
    // Asserted against the dictionary rather than a hard-coded string: this suite
    // renders in English, and pinning the Vietnamese copy here would make the test
    // a statement about the test harness's locale instead of about the control.
    expect(disabled.textContent).toContain(enCopy['reviews.askAboutPlace'])
    // Invariant 6: the reason is carried by text, not by the dimming alone.
    expect(getByText(enCopy['reviews.askOfflineReason'])).toBeTruthy()
  })

  it('leaves the item itself readable — offline hides nothing but the bridge', () => {
    setOnline(false)
    const { getByText } = renderPost()
    expect(getByText('Bún bò Huế Cô Ba'), 'the place must still be readable offline').toBeTruthy()
    expect(getByText('Ngon bá cháy'), 'the caption must still be readable offline').toBeTruthy()
  })

  it('has the copy in BOTH languages — a Vietnamese user must not meet English here', () => {
    // The offline reason is new copy, and new copy is exactly what ships
    // half-translated. Both dictionaries carry it, and neither falls back.
    for (const key of ['reviews.askAboutPlace', 'reviews.askOfflineReason']) {
      expect(viCopy[key], `${key} missing from vi`).toBeTruthy()
      expect(enCopy[key], `${key} missing from en`).toBeTruthy()
      expect(viCopy[key], `${key} was not translated`).not.toBe(enCopy[key])
    }
  })

  it('offers no bridge at all offline when there was no subject either', () => {
    // The two rules compose: no place means no control, disabled or otherwise.
    setOnline(false)
    const { container } = renderPost({ place_name: '' })
    expect(container.querySelector('[data-testid="ask-tappy-offline"]')).toBeNull()
  })

  it('comes back when the connection does — the browser event, not a reload', () => {
    setOnline(false)
    const { container } = renderPost()
    expect(container.querySelector('[data-testid="ask-tappy-offline"]')).toBeTruthy()

    // The hook listens for the real 'online' event, so recovery must not need a
    // navigation. If it did, a user who regained signal would sit looking at a
    // dead control until they scrolled away and back.
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(bridge(container), 'the bridge must return without a reload').toBeTruthy()
    expect(container.querySelector('[data-testid="ask-tappy-offline"]')).toBeNull()
  })
})
