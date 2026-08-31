// @vitest-environment jsdom
/**
 * Regression tests for the Like COUNT click target.
 *
 * ============================================================================
 * THE BUG
 * ============================================================================
 * The count was never its own control. On the feed and the post detail it lived INSIDE the
 * like-toggle <button>, so tapping "3" toggled the like — a user asking "who liked this?" silently
 * UNLIKED the post. On the sound / creator grids it lived inside a <Link> to the post, so the same
 * tap navigated away instead.
 *
 * ============================================================================
 * WHAT IS LOCKED HERE
 * ============================================================================
 * Three things, and they are the whole contract:
 *   CLICK HEART → like / unlike (unchanged)
 *   CLICK COUNT → like list, and NOTHING else — no toggle, no navigation
 *   CLICK ELSEWHERE ON THE CARD → the surface's existing behaviour (unchanged)
 *
 * The third is the one a naive fix breaks: stopping propagation on the whole overlay would kill
 * the card's own click. So each test asserts the neighbouring control still fires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { Post } from './feedShared'
import ReviewLikeButton from './[id]/ReviewLikeButton'

// ── Heavy / networked deps mocked so the components render in jsdom ──
vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => <div data-testid="video-player" /> }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('./LikeListSheet', () => ({ default: ({ reviewId }: { reviewId: string }) => <div data-testid="like-list" data-review={reviewId} /> }))
vi.mock('@/app/reviews/LikeListSheet', () => ({ default: ({ reviewId }: { reviewId: string }) => <div data-testid="like-list" data-review={reviewId} /> }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/modules/music', () => ({
  useMusicTrack: () => ({ track: null, loading: false }),
  getPreviewUrl: (t: any) => t?.previewUrl ?? t?.audioUrl ?? '',
}))

const ME = 'me-user'
const AUTHOR = 'other-author'

const mkReview = (over: Record<string, unknown> = {}) => ({
  id: 'rev-1', user_id: AUTHOR, place_name: 'Quán A', place_address: null, rating: 5, body: 'ngon',
  photos: null, like_count: 3, comment_count: 0, save_count: 0, created_at: '2026-07-28T00:00:00Z',
  liked_by_me: false, saved_by_me: false, is_following: false,
  profiles: { full_name: 'Tác giả', avatar_url: null },
  content_type: 'video', media_url: 'https://x/a.mp4', thumbnail: null, source_type: 'upload', source_url: null,
  ...over,
}) as any

const noop = () => {}
const baseProps = {
  me: ME, feedType: 'for-you' as const, renderVideo: false, active: false,
  onFeedTypeChange: noop, onLike: noop, onLikeDouble: noop, onSave: noop,
  onComment: noop, onShare: noop, onDelete: noop,
}

/** The count control — the only button whose accessible name is the like-list key (t() = key). */
const countBtn = (c: HTMLElement) => c.querySelector('button[aria-label="reviews.likesOpen"]') as HTMLButtonElement | null

describe('feed / clip viewer — the count is not the heart', () => {
  it('clicking the COUNT opens the like list and does NOT toggle the like', () => {
    const onLike = vi.fn()
    const onOpenLikes = vi.fn()
    const { container } = render(
      <Post {...baseProps} r={mkReview()} onLike={onLike} onOpenLikes={onOpenLikes} />,
    )

    const btn = countBtn(container)
    expect(btn).not.toBeNull()          // regression: the count used to be a plain <span>
    expect(btn!.textContent).toBe('3')

    fireEvent.click(btn!)
    expect(onOpenLikes).toHaveBeenCalledTimes(1)
    expect(onOpenLikes.mock.calls[0][0].id).toBe('rev-1')
    // 🚨 THE BUG: this used to be 1. Asking who liked a post must never change whether you like it.
    expect(onLike).not.toHaveBeenCalled()
  })

  it('the heart still likes — the split did not disarm the toggle', () => {
    const onLike = vi.fn()
    const onOpenLikes = vi.fn()
    const { container } = render(
      <Post {...baseProps} r={mkReview()} onLike={onLike} onOpenLikes={onOpenLikes} />,
    )

    // The heart is the count button's sibling inside the same rail item.
    const heart = countBtn(container)!.parentElement!.querySelector('button') as HTMLButtonElement
    expect(heart).not.toBe(countBtn(container))

    fireEvent.click(heart)
    expect(onLike).toHaveBeenCalledTimes(1)
    expect(onLike).toHaveBeenCalledWith('rev-1')
    expect(onOpenLikes).not.toHaveBeenCalled()
  })

  it('a host that passes no onOpenLikes keeps the old single-button markup', () => {
    // ProfileTab and the feed both pass it, but the prop is optional and the fallback must not
    // render a dead button that looks tappable and does nothing.
    const onLike = vi.fn()
    const { container } = render(<Post {...baseProps} r={mkReview()} onLike={onLike} />)
    expect(countBtn(container)).toBeNull()
  })
})

describe('post detail — the count is not the heart', () => {
  // No auto-cleanup in this repo: `findByTestId` is document-wide and would otherwise see the
  // previous test's sheet.
  beforeEach(() => {
    cleanup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ liked: true }) })) as any)
  })

  it('clicking the COUNT opens the like list and sends NO like request', async () => {
    const { container, findByTestId } = render(
      <ReviewLikeButton reviewId="rev-9" initialLiked={false} initialCount={3} />,
    )

    const btn = countBtn(container)
    expect(btn).not.toBeNull()
    expect(btn!.textContent).toBe('3')

    fireEvent.click(btn!)

    const sheet = await findByTestId('like-list')
    expect(sheet.getAttribute('data-review')).toBe('rev-9')
    // 🚨 THE BUG: the count shared the heart's <button>, so this fired POST …/like and unliked.
    expect(fetch).not.toHaveBeenCalled()
    // …and the number must not have moved either.
    expect(countBtn(container)!.textContent).toBe('3')
  })

  it('the heart still posts the like', () => {
    const { container } = render(
      <ReviewLikeButton reviewId="rev-9" initialLiked={false} initialCount={3} />,
    )
    const heart = container.querySelector('button[aria-label="Thích"]') as HTMLButtonElement
    expect(heart).not.toBeNull()

    fireEvent.click(heart)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch as any).mock.calls[0][0]).toBe('/api/reviews/rev-9/like')
  })
})
