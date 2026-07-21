// @vitest-environment jsdom
/**
 * Regression test for the profile-grid delete-reflow bug (Batch #10 / item "Profile Grid").
 *
 * Bug: deleting a clip from the swipeable ClipViewer only updated the viewer's own local list,
 * never the parent ProfileTab grid, so the deleted clip lingered as a broken/empty tile until a
 * page reload ("empty cell inserted, last clip not showing"). Fix: ClipViewer takes an `onDelete`
 * prop and calls it, and ProfileTab passes one that filters `posts`/`hidden` so the grid reflows
 * immediately. This test drives the REAL ProfileTab + ClipViewer: it renders 3 clips, opens the
 * viewer, deletes the active clip, and asserts the grid immediately reflows to 2 tiles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { ProfileTab } from './ProfileTab'

// ── Heavy / networked deps mocked so ProfileTab renders in jsdom ──
vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => {
  const thenable: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit']) thenable[m] = () => thenable
  thenable.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res)
  // Stable singleton: ProfileTab's load effect depends on `supabase`, so a fresh object per call
  // would re-run the effect on every render (grid flicker / reload loop).
  const client = { from: () => thenable, auth: { getUser: async () => ({ data: { user: null } }) } }
  return { createClient: () => client }
})
vi.mock('@/lib/tracking/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/userMemory', () => ({ getUserPreferences: vi.fn().mockResolvedValue(null), logUserEvent: vi.fn(), inferPreferencesFromEvents: vi.fn() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => <div data-testid="video-player" /> }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))

const ME = 'me-user'
const mkClip = (id: string, thumb: string) => ({
  id, user_id: ME, place_name: 'Nơi ' + id, place_address: null, rating: 5, body: 'clip ' + id,
  photos: null, like_count: 0, comment_count: 0, save_count: 0, created_at: '2026-07-20T00:00:00Z',
  liked_by_me: false, saved_by_me: false, profiles: { full_name: 'Me', avatar_url: null },
  content_type: 'video', media_url: 'https://x/' + id + '.mp4', thumbnail: thumb, source_type: 'upload', source_url: null,
})

function gridTiles(_c?: HTMLElement): HTMLButtonElement[] {
  const grids = Array.from(document.querySelectorAll('div')).filter(d => /(^| )grid-cols-3( |$)/.test(d.className))
  const grid = grids[0]
  return grid ? (Array.from(grid.children).filter(el => el.tagName === 'BUTTON') as HTMLButtonElement[]) : []
}

beforeEach(() => {
  // jsdom polyfills for the feed/viewer UI
  ;(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {})
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {})
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  ;(navigator as any).vibrate = () => true
  vi.spyOn(window, 'confirm').mockReturnValue(true)

  const clips = [mkClip('p1', 't1.jpg'), mkClip('p2', 't2.jpg'), mkClip('p3', 't3.jpg')]
  vi.stubGlobal('fetch', vi.fn(async (url: any, opts?: any) => {
    const u = String(url)
    if (u.includes('/api/users/')) return { ok: true, json: async () => ({ full_name: 'Me', avatar_url: null, follower_count: 0, following_count: 0, review_count: 3 }) } as any
    if (u.includes('/api/reviews/feed')) return { ok: true, json: async () => ({ reviews: clips }) } as any
    if (opts?.method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) } as any
    return { ok: true, json: async () => ({}) } as any
  }))
})

describe('Profile grid delete reflow', () => {
  it('removes the deleted clip from the grid immediately (reflows 3 → 2, no empty tile)', async () => {
    const { container } = render(<ProfileTab userId={ME} />)

    // 1) grid loads with 3 clips
    await waitFor(() => expect(gridTiles(container).length).toBe(3), { timeout: 4000 })

    // 2) open the swipe viewer on the first clip
    fireEvent.click(gridTiles(container)[0])
    const moreSel = '[class*="more-vertical"], [class*="ellipsis-vertical"], [class*="ellipsis"]'

    // 3) open the active post's overflow menu then click Delete
    await waitFor(() => expect(document.querySelector(moreSel)).toBeTruthy(), { timeout: 4000 })
    const moreBtn = (document.querySelector(moreSel) as Element).closest('button')!
    fireEvent.click(moreBtn)

    const delBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('reviews.deletePost'))!
    expect(delBtn).toBeTruthy()
    fireEvent.click(delBtn)

    // 4) grid must reflow to 2 tiles (the fix) — before the fix it stayed 3
    await waitFor(() => expect(gridTiles(container).length).toBe(2), { timeout: 4000 })
  })
})
