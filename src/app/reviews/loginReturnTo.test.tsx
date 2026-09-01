// @vitest-environment jsdom
/**
 * BUG-008 — signing in from a clip threw the clip away.
 *
 * ============================================================================
 * WHAT WENT WRONG
 * ============================================================================
 * `ClipViewer.requireLogin` sent a signed-out visitor to `/login?returnTo=/reviews` — a literal.
 * That was merely imprecise while the viewer only opened from the profile grid. Once PR #234 made
 * it the destination of every share link and push notification, it became: receive a link, tap the
 * heart, sign in, land on the feed with the clip gone.
 *
 * `CommentDrawer` and `SoundSheet` carry the same literal and are rendered *inside* that viewer,
 * so they lose the clip too.
 *
 * ============================================================================
 * THE CONTRACT THAT ALREADY EXISTED
 * ============================================================================
 * 🔑 `@/lib/auth/returnTo` says it out loud: "Producers MUST use `loginPathFor` rather than
 * hand-writing the query string". These call sites hand-wrote it. The fix is to honour the
 * contract with the CURRENT path, not to invent anything.
 *
 * `src/app/reviews/page.tsx` keeps its literal on purpose — that component only ever renders at
 * `/reviews`, so there the literal and the current path are the same string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => null }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('./LikeListSheet', () => ({ default: () => null }))
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
import { CommentDrawer } from './feedShared'

const CLIP = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', user_id: 'author-1', place_name: 'Quán A',
  place_address: null, rating: 5, body: 'ngon', photos: null, like_count: 1, comment_count: 0,
  save_count: 0, created_at: '2026-08-01T00:00:00Z', liked_by_me: false, saved_by_me: false,
  profiles: { full_name: 'Tác giả', avatar_url: null }, content_type: 'video',
  media_url: 'https://x/a.mp4', thumbnail: null, source_type: 'upload', source_url: null, music: null,
} as any

/** jsdom refuses real navigation; a plain object records what the code tried to go to. */
function atPath(pathname: string, search = '') {
  Object.defineProperty(window, 'location', {
    value: { pathname, search, href: '', origin: 'https://www.tappyai.com' },
    writable: true, configurable: true,
  })
}

const heartOf = (c: HTMLElement) => {
  const count = c.querySelector('button[aria-label="reviews.likesOpen"]') as HTMLElement
  return count.parentElement!.querySelector('button') as HTMLButtonElement
}

beforeEach(() => {
  cleanup()
  Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), writable: true, configurable: true })
})

describe('BUG-008 — signing in from a clip comes back to that clip', () => {
  it('🚨 anonymous like on /reviews/<id> returns to THAT clip, not the feed', () => {
    atPath('/reviews/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me={null} onClose={vi.fn()} />)

    fireEvent.click(heartOf(container))

    expect(window.location.href).toBe('/login?returnTo=%2Freviews%2Faaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(window.location.href).not.toContain('returnTo=%2Freviews&')
  })

  it('the same viewer opened from a profile returns to that profile', () => {
    // ClipViewer is also mounted by the profile grid; the destination follows the page it is on
    // rather than a literal, so one rule covers both hosts.
    atPath('/users/f9077a52-b0f3-453a-a497-97da115ae386')
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me={null} onClose={vi.fn()} />)

    fireEvent.click(heartOf(container))

    expect(window.location.href).toBe('/login?returnTo=%2Fusers%2Ff9077a52-b0f3-453a-a497-97da115ae386')
  })

  it('a query string on the current page is preserved', () => {
    atPath('/reviews', '?tab=inbox')
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me={null} onClose={vi.fn()} />)

    fireEvent.click(heartOf(container))

    expect(window.location.href).toBe('/login?returnTo=%2Freviews%3Ftab%3Dinbox')
  })

  it('an authenticated viewer is never redirected', () => {
    atPath('/reviews/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ liked: true }) })) as any)
    const { container } = render(<ClipViewer posts={[CLIP]} startIndex={0} me="me" onClose={vi.fn()} />)

    fireEvent.click(heartOf(container))

    expect(window.location.href).toBe('')
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('🚨 the comment composer inside the viewer returns to the clip too', () => {
    // CommentDrawer is rendered BY ClipViewer, so its literal lost the clip in exactly the same way.
    atPath('/reviews/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ comments: [], count: 0 }) })) as any)
    const { container } = render(<CommentDrawer review={CLIP} me={null} onClose={vi.fn()} onAdded={vi.fn()} />)

    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hay quá' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(window.location.href).toBe('/login?returnTo=%2Freviews%2Faaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    vi.unstubAllGlobals()
  })
})
