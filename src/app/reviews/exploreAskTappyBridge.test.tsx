// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

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
})
