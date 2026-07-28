// @vitest-environment jsdom
/**
 * Regression test for WEB-EXPLORE-FOLLOW-002 — the feed avatar's red "+" did nothing.
 *
 * Bug: the "+" badge on an author's avatar was a bare <div> with no onClick, no href and no
 * follow state (feedShared.tsx), so tapping it dispatched no request and changed nothing. The
 * follow capability existed (POST /api/users/[id]/follow) but was never wired to the feed card.
 * Fix: the badge is a real <button> that calls an `onFollow` prop, and it is hidden once the
 * author is followed (`is_following`, now returned by /api/reviews/feed) or on your own posts.
 *
 * These tests drive the REAL Post component and lock in all three behaviours.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Post } from './feedShared'

// ── Heavy / networked deps mocked so Post renders in jsdom ──
vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => <div data-testid="video-player" /> }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/modules/music', () => ({
  useMusicTrack: () => ({ track: null, loading: false }),
  getPreviewUrl: (t: any) => t?.previewUrl ?? t?.audioUrl ?? '',
}))

const ME = 'me-user'
const AUTHOR = 'other-author'

const mkReview = (over: Record<string, unknown> = {}) => ({
  id: 'rev-1', user_id: AUTHOR, place_name: 'Quán A', place_address: null, rating: 5, body: 'ngon',
  photos: null, like_count: 0, comment_count: 0, save_count: 0, created_at: '2026-07-28T00:00:00Z',
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

/** The follow "+" is the only button labelled with the follow i18n key (t() returns the key).
 *  Scoped to THIS render's container — renders are not auto-cleaned between tests here, so a
 *  document-wide query would find the previous test's button and mask a real regression. */
const followBtn = (c: HTMLElement) => c.querySelector('button[aria-label="reviews.follow"]') as HTMLButtonElement | null

describe('WEB-EXPLORE-FOLLOW-002 — feed avatar follow "+"', () => {
  it('renders a real button and calls onFollow with the author id when tapped', () => {
    const onFollow = vi.fn()
    const { container } = render(<Post {...baseProps} r={mkReview()} onFollow={onFollow} />)

    const btn = followBtn(container)
    expect(btn).not.toBeNull()           // regression: used to be an inert <div>
    expect(btn!.tagName).toBe('BUTTON')

    fireEvent.click(btn!)
    expect(onFollow).toHaveBeenCalledTimes(1)
    expect(onFollow).toHaveBeenCalledWith(AUTHOR)
  })

  it('hides the "+" once the author is already followed', () => {
    const { container } = render(<Post {...baseProps} r={mkReview({ is_following: true })} onFollow={vi.fn()} />)
    expect(followBtn(container)).toBeNull()
  })

  it('never shows the "+" on your own post', () => {
    const { container } = render(<Post {...baseProps} r={mkReview({ user_id: ME })} onFollow={vi.fn()} />)
    expect(followBtn(container)).toBeNull()
  })

  it('shows no "+" when no onFollow is provided (profile clip viewer)', () => {
    const { container } = render(<Post {...baseProps} r={mkReview()} />)
    expect(followBtn(container)).toBeNull()
  })
})
