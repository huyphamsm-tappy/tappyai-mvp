// @vitest-environment jsdom
//
// ── The first tap unlocked the sound and then killed it ──────────────────────
//
// Owner report, iOS Safari: enter Explore, clips autoplay silently, tap once — still no sound —
// tap again and sound works.
//
// Re-measured on production 432cc7e in real WebKit with the media API instrumented. The unlock
// is NOT what fails; the feed's own pause gesture cancels it:
//
//   8362  CLICK          → audio.play() starts  (unlock works, inside the gesture)
//   8672  PAUSE VIDEO    → the feed's 300ms single-tap timer fires
//   8693  PAUSE AUDIO    → the video's 'pause' event stops the companion track
//   8720  play REJECTED  AbortError   ← the first tap's audio, aborted before it was audible
//   9238  CLICK (tap 2)  → play VIDEO + play AUDIO → sound
//
// So the muted autoplay is Safari's rule and correct, and the unlock gesture is implemented
// correctly — but the very same tap is also the pause gesture, and pausing ~330ms later throws
// away the sound it had just been granted.
//
// The fix is to let the tap that unlocks audio do only that. Every later tap pauses and resumes
// exactly as before, so this costs one tap per session and only while sound is still locked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

const onUserPauseToggle = vi.fn()
let unlocked = false

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/modules/music', () => ({
  useMusicTrack: () => ({ track: null, loading: false }),
  getPreviewUrl: (t: any) => t?.previewUrl ?? '',
}))

// The player itself is not under test — its handle and its unlock state are.
vi.mock('@/components/explore/VideoPlayer', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    default: forwardRef(function MockPlayer(_p: any, ref: any) {
      useImperativeHandle(ref, () => ({ onUserPauseToggle, setActive: () => {}, dispose: () => {} }), [])
      return <div data-testid="video-player" />
    }),
    isFeedAudioUnlocked: () => unlocked,
  }
})

const { Post } = await import('./feedShared')

const review = {
  id: 'rev-1', user_id: 'author', place_name: 'Quán A', place_address: null, rating: 5, body: 'ngon',
  photos: null, like_count: 0, comment_count: 0, save_count: 0, created_at: '2026-07-28T00:00:00Z',
  liked_by_me: false, saved_by_me: false, is_following: false,
  profiles: { full_name: 'Tác giả', avatar_url: null },
  content_type: 'video', media_url: 'https://x/a.mp4', thumbnail: null, source_type: 'upload', source_url: null,
} as any

const noop = () => {}
const props = {
  me: 'me', feedType: 'for-you' as const, renderVideo: true, active: true,
  onFeedTypeChange: noop, onLike: noop, onLikeDouble: noop, onSave: noop,
  onComment: noop, onShare: noop, onDelete: noop, onFollow: noop,
}

const gestureLayer = (c: HTMLElement) => c.querySelector('div.z-\\[5\\]') as HTMLElement

const tap = (c: HTMLElement) => {
  const el = gestureLayer(c)
  fireEvent.pointerDown(el, { clientX: 100, clientY: 200 })
  fireEvent.pointerUp(el, { clientX: 100, clientY: 200 })
}

beforeEach(() => { onUserPauseToggle.mockClear(); unlocked = false; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('the tap that unlocks audio must not also pause the clip', () => {
  it('does NOT pause on the first tap while sound is still locked', () => {
    const { container } = render(<Post {...props} r={review} />)
    tap(container)
    vi.advanceTimersByTime(400) // past the 300ms single-tap window

    expect(onUserPauseToggle).not.toHaveBeenCalled()
  })

  it('pauses on the next tap, once sound is unlocked', () => {
    const { container } = render(<Post {...props} r={review} />)
    tap(container)
    vi.advanceTimersByTime(400)
    unlocked = true // the first tap unlocked page audio

    tap(container)
    vi.advanceTimersByTime(400)
    expect(onUserPauseToggle).toHaveBeenCalledTimes(1)
  })

  it('pauses on the very first tap when audio was already unlocked elsewhere', () => {
    // e.g. the user dismissed the language sheet first — that click unlocked audio, so the tap
    // on the clip is an ordinary pause and must behave like one.
    unlocked = true
    const { container } = render(<Post {...props} r={review} />)
    tap(container)
    vi.advanceTimersByTime(400)

    expect(onUserPauseToggle).toHaveBeenCalledTimes(1)
  })

  it('still likes on double-tap while locked — the unlock rule must not eat that gesture', () => {
    const onLikeDouble = vi.fn()
    const { container } = render(<Post {...props} r={review} onLikeDouble={onLikeDouble} />)
    tap(container)
    vi.advanceTimersByTime(50)
    tap(container)
    vi.advanceTimersByTime(400)

    expect(onLikeDouble).toHaveBeenCalledTimes(1)
    expect(onUserPauseToggle).not.toHaveBeenCalled()
  })
})
