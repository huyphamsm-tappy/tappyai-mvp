// @vitest-environment jsdom
/**
 * Regression test for Bug #8 — feed active-clip restoration on Back navigation.
 *
 * Bug: Feed → open Clip A → tap into the author's profile (a real /users/[id] route
 * change) → Back. The feed remounted at the top slide of a freshly-fetched (and, for
 * "trending", re-ordered) feed, so the user landed on a DIFFERENT clip (Clip B) instead
 * of Clip A. Root cause: the active clip lived only in an inner snap-scroll container
 * (no per-clip URL, no history entry, nothing persisted).
 *
 * Fix: on leave, persist the active clip's ID + feed type to sessionStorage; after the
 * feed reloads on a Back/Forward traversal, scroll to that clip BY ID (index is
 * unreliable because "trending" re-orders between fetches) and clear the marker.
 *
 * This test drives the REAL ReviewsPage: it seeds a Back-navigation (popstate) plus a
 * saved marker pointing at the MIDDLE clip, renders the feed of 3 clips, and asserts the
 * container scrolls to the middle clip's offset (index 1 → one viewport down) and that
 * the marker is cleared. Index-based restore would have scrolled to the top (0).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// ReviewsPage is imported dynamically per-test (see below): page.tsx keeps a
// module-level "last popstate" timestamp that intentionally survives across mounts
// in a real session, so tests must reset the module to stay isolated.

// Must match RETURN_KEY in page.tsx (module-private there).
const RETURN_KEY = 'tappy:reviewsReturn'
const VIEWPORT = 800 // stubbed clientHeight; middle clip (index 1) → scrollTo top = 800

// ── Heavy / networked deps mocked so ReviewsPage renders in jsdom ──
vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => {
  const thenable: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit']) thenable[m] = () => thenable
  thenable.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res)
  // Anonymous: me stays null so the city/hashtag/preferences effects short-circuit.
  const client = { from: () => thenable, auth: { getUser: async () => ({ data: { user: null } }) } }
  return { createClient: () => client }
})
vi.mock('@/lib/tracking/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/userMemory', () => ({ getUserPreferences: vi.fn().mockResolvedValue(null), logUserEvent: vi.fn(), inferPreferencesFromEvents: vi.fn() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => <div data-testid="video-player" /> }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('./ReviewMusicDisc', () => ({ default: () => null }))
vi.mock('./SoundSheet', () => ({ default: () => null }))
vi.mock('./ProfileTab', () => ({ ProfileTab: () => null }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))

const mkClip = (id: string) => ({
  id, user_id: 'author-' + id, place_name: 'Nơi ' + id, place_address: null, rating: 5, body: 'clip ' + id,
  photos: null, like_count: 0, comment_count: 0, save_count: 0, created_at: '2026-07-20T00:00:00Z', hashtags: [],
  liked_by_me: false, saved_by_me: false, profiles: { full_name: 'Author ' + id, avatar_url: null },
  content_type: 'video', media_url: 'https://x/' + id + '.mp4', thumbnail: null, source_type: 'upload', source_url: null,
})

let scrollTops: number[]

beforeEach(() => {
  vi.resetModules() // fresh page.tsx module → fresh module-level popstate timestamp
  sessionStorage.clear()
  scrollTops = []
  // jsdom polyfills for the feed UI
  ;(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  ;(window as any).matchMedia = (window as any).matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Element.prototype.scrollTo = function (opts: any) { if (opts && typeof opts.top === 'number') scrollTops.push(opts.top) } as any
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {})
  // jsdom reports clientHeight 0; the restore maths needs a real viewport height.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEWPORT })
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  ;(navigator as any).vibrate = () => true

  const clips = [mkClip('a'), mkClip('b'), mkClip('c')]
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url)
    if (u.includes('/api/reviews/feed')) return { ok: true, json: async () => ({ reviews: clips }) } as any
    if (u.includes('/api/notifications')) return { ok: true, json: async () => [] } as any
    return { ok: true, json: async () => ({}) } as any
  }))
})

describe('Bug #8 — feed active-clip restoration on Back', () => {
  it('restores the saved clip BY ID (scrolls to the middle clip, not the top) and clears the marker', async () => {
    // User had scrolled to the 2nd clip ('b') before opening a profile.
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ clipId: 'b', feedType: 'for-you' }))
    const ReviewsPage = (await import('./page')).default
    // Simulate the browser Back traversal that remounts the feed.
    window.dispatchEvent(new PopStateEvent('popstate'))

    render(<ReviewsPage />)

    // After the feed loads, the container must scroll to index 1 (clip 'b') = one
    // viewport down. Top-of-feed (0) would mean the bug is still present.
    await waitFor(() => expect(scrollTops).toContain(VIEWPORT), { timeout: 4000 })
    expect(scrollTops).not.toEqual([0]) // never settled on the top slide only

    // Marker removed after a successful restore.
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull()
  })

  it('does NOT restore on a fresh visit (no popstate) — feed stays at the top', async () => {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ clipId: 'b', feedType: 'for-you' }))
    // No popstate dispatched → this is a fresh/push navigation.

    const ReviewsPage = (await import('./page')).default
    render(<ReviewsPage />)

    // Give the feed time to load and any (unwanted) restore to fire.
    await waitFor(() => expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/api/reviews/feed'))).toBe(true), { timeout: 4000 })
    await new Promise(r => setTimeout(r, 50))

    expect(scrollTops).not.toContain(VIEWPORT) // never jumped to the saved clip
    expect(sessionStorage.getItem(RETURN_KEY)).toBe(JSON.stringify({ clipId: 'b', feedType: 'for-you' })) // marker untouched
  })
})
