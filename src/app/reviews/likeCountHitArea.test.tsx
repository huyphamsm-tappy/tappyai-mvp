// @vitest-environment jsdom
/**
 * BUG-009 — the like count was a 5×16px tap target.
 *
 * ============================================================================
 * WHAT WENT WRONG
 * ============================================================================
 * PR #224 made the count its own control so that tapping the number opens the like list instead of
 * silently unliking the post. It got the semantics right and the geometry wrong: a <button> whose
 * only child is the character "1" shrink-wraps to the width of that character. Measured on
 * production at 375×812 the rail's count button was 5×16 = 77px². The next smallest control on the
 * same rail was 784px². WCAG 2.2 asks for 24×24; Apple asks for 44×44.
 *
 * So the feature shipped and was, on the phone this feed is built for, unreachable by thumb.
 *
 * ============================================================================
 * WHAT THIS FILE CAN AND CANNOT PROVE
 * ============================================================================
 * 🚨 jsdom has NO layout engine and does not compile Tailwind, so `getBoundingClientRect()` here
 * returns zeros no matter what the code does. A test in this file therefore CANNOT measure a hit
 * area, and any assertion pretending otherwise would be theatre.
 *
 * What it can do is hold the sizing floor: it reads the min-width/min-height utilities off the
 * rendered element and asserts the NUMBER inside them clears 24. That kills the regression this
 * bug actually was — a control with no minimum, or one dialled back below the target — while
 * staying honest that it is a tripwire and not a measurement.
 *
 * The measurement is done in a real browser at 375 / 390 / 430 CSS px, recorded in the PR.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => null }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('./LikeListSheet', () => ({ default: () => null }))
vi.mock('@/app/reviews/LikeListSheet', () => ({ default: () => null }))
vi.mock('@/components/LinkPoster', () => ({ default: () => null }))
vi.mock('@/lib/ui/gridFill', () => ({ trailingFillerCount: () => 0 }))
vi.mock('@/lib/userMemory', () => ({ getUserPreferences: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => {
      const b: any = { select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: null }), then: (r: any) => r({ data: [], error: null }) }
      return b
    },
  }),
}))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/modules/music', () => ({ useMusicTrack: () => ({ track: null, loading: false }), getPreviewUrl: () => '' }))

import { ClipViewer } from './ProfileTab'
import ReviewLikeButton from './[id]/ReviewLikeButton'

const CLIP = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', user_id: 'author-1', place_name: 'Quán A',
  place_address: null, rating: 5, body: 'ngon', photos: null, like_count: 1, comment_count: 0,
  save_count: 0, created_at: '2026-08-01T00:00:00Z', liked_by_me: false, saved_by_me: false,
  profiles: { full_name: 'Tác giả', avatar_url: null }, content_type: 'video',
  media_url: 'https://x/a.mp4', thumbnail: null, source_type: 'upload', source_url: null, music: null,
} as any

/** WCAG 2.2 Target Size (Minimum), 2.5.8. */
const FLOOR = 24

/**
 * Pull the number out of `min-w-[44px]` / `min-h-[24px]`.
 *
 * Reading the digits rather than matching a fixed string is what makes this a floor instead of a
 * spelling check: `min-h-[16px]` is a distinct, failing value, not a passing "the class is there".
 */
function minSize(el: Element): { w: number; h: number } {
  const cls = el.className
  const num = (prefix: string) => {
    const m = new RegExp(`min-${prefix}-\\[(\\d+)px\\]`).exec(cls)
    return m ? Number(m[1]) : 0
  }
  return { w: num('w'), h: num('h') }
}

beforeEach(() => {
  cleanup()
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), writable: true, configurable: true })
})

describe('BUG-009 — the like count is big enough to hit', () => {
  it('🚨 the feed / ClipViewer rail count clears the 24×24 floor', () => {
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me={null} onClose={vi.fn()} />)
    const count = container.querySelector('button[aria-label="reviews.likesOpen"]')!

    const { w, h } = minSize(count)
    expect(w).toBeGreaterThanOrEqual(FLOOR)
    expect(h).toBeGreaterThanOrEqual(FLOOR)
  })

  it('the rail count is a comfortable 44 wide, since nothing sits beside it', () => {
    // Height stays at the 24 floor on purpose: the heart is 4px above (`gap-1`), and a taller box
    // would begin swallowing taps meant for it. Width has no such neighbour, so it takes the full
    // Apple HIG target.
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me={null} onClose={vi.fn()} />)
    const count = container.querySelector('button[aria-label="reviews.likesOpen"]')!

    expect(minSize(count).w).toBeGreaterThanOrEqual(44)
  })

  it('the post-detail count clears the floor too', () => {
    const { container } = render(<ReviewLikeButton reviewId={CLIP.id} initialLiked={false} initialCount={1} />)
    const count = container.querySelector('button[aria-label="reviews.likesOpen"]')!

    const { w, h } = minSize(count)
    expect(w).toBeGreaterThanOrEqual(FLOOR)
    expect(h).toBeGreaterThanOrEqual(FLOOR)
  })

  it('growing the target did not merge it back into the heart', () => {
    // The whole point of PR #224 was that these are TWO controls. A fix that made the count large
    // by absorbing it into the like button would pass a size check and reintroduce the original
    // bug — tapping the number would unlike the post.
    const { container } = render(<ReviewLikeButton reviewId={CLIP.id} initialLiked={false} initialCount={1} />)
    const count = container.querySelector('button[aria-label="reviews.likesOpen"]')!
    const heart = container.querySelector('button[aria-label="Thích"]')!

    expect(count).not.toBe(heart)
    expect(count.contains(heart)).toBe(false)
    expect(heart.contains(count)).toBe(false)
  })
})
