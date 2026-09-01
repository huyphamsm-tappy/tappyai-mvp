// @vitest-environment jsdom
/**
 * BUG-006 — the viewer the Inbox now reuses, driven with ONE post.
 *
 * The notification path hands `ClipViewer` a single review fetched by id, which is a shape the
 * profile grid never produced (it always passes the whole grid). These tests drive the REAL
 * component that way and check the clip experience survives it: the right post on screen, the
 * full action rail, and the PR #224 contract that the like COUNT is its own control.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => <div data-testid="video-player" /> }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('./LikeListSheet', () => ({ default: ({ reviewId }: { reviewId: string }) => <div data-testid="like-list" data-review={reviewId} /> }))
vi.mock('@/components/LinkPoster', () => ({ default: () => null }))
vi.mock('@/lib/ui/gridFill', () => ({ trailingFillerCount: () => 0 }))
vi.mock('@/lib/userMemory', () => ({ getUserPreferences: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
    from: () => {
      const b: any = { select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: null }), then: (r: any) => r({ data: [], error: null }) }
      return b
    },
  }),
}))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))
vi.mock('@/modules/music', () => ({ useMusicTrack: () => ({ track: null, loading: false }), getPreviewUrl: () => '' }))

import { ClipViewer } from './ProfileTab'

const TARGET = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const CLIP = {
  id: TARGET, user_id: 'author-1', place_name: 'Quán A', place_address: null, rating: 5,
  body: 'ngon', photos: null, like_count: 1, comment_count: 2, save_count: 0,
  created_at: '2026-08-01T00:00:00Z', liked_by_me: false, saved_by_me: false,
  profiles: { full_name: 'Tác giả', avatar_url: null },
  content_type: 'video', media_url: 'https://x/a.mp4', thumbnail: null,
  source_type: 'upload', source_url: null, music: null,
} as any

const countBtn = (c: HTMLElement) => c.querySelector('button[aria-label="reviews.likesOpen"]') as HTMLButtonElement | null
const labels = (c: HTMLElement) => [...c.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label'))

// jsdom implements no scrolling; ClipViewer jumps to its start index on mount. A product concern
// this is not — without the stub the component cannot mount here at all.
beforeEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), writable: true, configurable: true })
})

describe('ClipViewer driven with a single post (the Inbox path)', () => {
  it('renders the clip experience, not an article: full-height black slide with a video', () => {
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me="me" onClose={vi.fn()} />)
    // `h-dvh … snap-start bg-black` is the feed/clip presentation; the detail page uses h-[55vh].
    expect(container.querySelector('.h-dvh.flex-shrink-0.snap-start.bg-black')).not.toBeNull()
    expect(container.querySelector('[data-testid="video-player"]')).not.toBeNull()
  })

  it('shows the whole action rail — like, comment, save, share', () => {
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me="me" onClose={vi.fn()} />)
    const rail = labels(container)
    expect(rail).toContain('reviews.likeAction')   // heart
    expect(rail).toContain('reviews.likesOpen')    // the count, its own control (PR #224)
    expect(container.textContent).toContain('reviews.railSave')
    expect(container.textContent).toContain('reviews.railShare')
    expect(container.textContent).toContain('2')   // comment count
  })

  it('🚨 PR #224 holds here: the COUNT opens the like list and does not toggle the like', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ liked: true }) }))
    vi.stubGlobal('fetch', f as any)
    const { container, findByTestId } = render(<ClipViewer posts={[CLIP]} startIndex={0} me="me" onClose={vi.fn()} />)

    const btn = countBtn(container)!
    expect(btn.textContent).toBe('1')             // CURRENT like_count, not the notification's actor count
    fireEvent.click(btn)

    const sheet = await findByTestId('like-list')
    expect(sheet.getAttribute('data-review')).toBe(TARGET)
    expect(f).not.toHaveBeenCalled()              // no like/unlike was fired
    expect(countBtn(container)!.textContent).toBe('1')
  })

  it('the heart still likes, and the count reflects the server', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ liked: true }) }))
    vi.stubGlobal('fetch', f as any)
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me="me" onClose={vi.fn()} />)

    const heart = countBtn(container)!.parentElement!.querySelector('button') as HTMLButtonElement
    fireEvent.click(heart)
    expect(f).toHaveBeenCalledTimes(1)
    expect(String((f as any).mock.calls[0][0])).toBe(`/api/reviews/${TARGET}/like`)
  })

  it('closing is the caller’s business — it never navigates on its own', () => {
    const onClose = vi.fn()
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me="me" onClose={onClose} />)
    const close = container.querySelector('button[aria-label="Đóng"]') as HTMLButtonElement
    expect(close).not.toBeNull()
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
