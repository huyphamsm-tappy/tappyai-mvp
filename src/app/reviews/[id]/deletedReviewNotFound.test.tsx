/**
 * BUG-004 — a deleted review answered HTTP 200 with the not-found UI inside it (a soft 404).
 *
 * ============================================================================
 * WHAT ACTUALLY DECIDES THE STATUS CODE
 * ============================================================================
 * The page's `notFound()` was always correct. What broke it was `src/app/loading.tsx` sitting at
 * the APP ROOT: a Suspense boundary above a page swallows that page's `notFound()` — the
 * not-found UI renders, but the response stays 200.
 *
 * Proven by ablation on a local production build of the deployed commit, one variable changed:
 *
 *   root loading.tsx PRESENT   deleted → 200 · malformed → 200 · sync notFound() probe → 200
 *   root loading.tsx SCOPED    deleted → 404 · malformed → 404 · existing → 200
 *
 * (An unmatched URL answered 404 in both, because it renders no page at all.)
 *
 * ============================================================================
 * WHAT THIS FILE CAN AND CANNOT PROVE
 * ============================================================================
 * 🚨 A unit test CANNOT assert an HTTP status — that needs a built server, and the acceptance
 * evidence for this fix is exactly that: `curl` against `next start` locally and against
 * production. What a unit test CAN do is guard the two things that produce it, so neither can be
 * undone silently:
 *
 *   1. the page still refuses a missing / hidden / non-publishable review, and
 *   2. no `loading.tsx` returns to the app root.
 *
 * The second is the load-bearing one and is the reason this file is not only about `[id]`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ review: null as Record<string, unknown> | null }))

vi.mock('./getReview', () => ({ getReview: async () => h.review }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => {
      const b: any = {
        select: () => b, eq: () => b,
        maybeSingle: async () => ({ data: null }),
        then: (r: (v: unknown) => unknown) => r({ count: 0 }),
      }
      return b
    },
  }),
}))
vi.mock('./ReviewDetailView', () => ({ default: () => null }))
// The route now also imports the clip view for video rows. Stubbed for the same reason as its
// sibling: pulling the real one drags in the music module, which builds a Supabase client at
// import time and cannot run here. Nothing in this file renders either of them.
vi.mock('./ReviewClipView', () => ({ default: () => null }))

import ReviewDetailPage, { generateMetadata } from './page'

const PUBLISHED = {
  id: 'r1', user_id: 'u1', place_name: 'Quán A', place_address: null, rating: 5,
  body: 'ngon lắm', photos: null, is_verified: true, like_count: 1, comment_count: 0,
  created_at: '2026-08-01T00:00:00Z', music: null, content_type: 'video',
  media_url: 'https://x/a.mp4', thumbnail: null, source_type: 'upload', source_url: null,
  profiles: { full_name: 'Tác giả', avatar_url: null },
}

/** `notFound()` throws a sentinel Next recognises; this is how a unit test observes the refusal. */
async function refuses(run: () => Promise<unknown>): Promise<boolean> {
  try { await run(); return false } catch (e: any) { return /NEXT_NOT_FOUND/.test(e?.digest ?? e?.message ?? '') }
}

beforeEach(() => { h.review = null })

describe('BUG-004 — the page refuses a review it must not serve', () => {
  it('an existing published review renders', async () => {
    h.review = PUBLISHED
    await expect(ReviewDetailPage({ params: { id: 'r1' } })).resolves.toBeTruthy()
  })

  it('🚨 a DELETED review triggers notFound()', async () => {
    h.review = null
    expect(await refuses(() => ReviewDetailPage({ params: { id: 'gone' } }))).toBe(true)
  })

  it('🚨 a MALFORMED id triggers notFound()', async () => {
    // `getReview` finds nothing for a non-uuid, so it takes the same path — the route must not
    // answer differently for a shape it cannot parse.
    h.review = null
    expect(await refuses(() => ReviewDetailPage({ params: { id: 'not-a-uuid' } }))).toBe(true)
  })

  it('🚨 an UNDER_REVIEW / hidden review triggers notFound() — visibility is NOT relaxed', async () => {
    // `getReview` applies the hidden + publication filters; a row it refuses arrives here as null,
    // exactly like a deleted one. Verified on production data too: the one real UNDER_REVIEW row
    // answers 404, not 200.
    h.review = null
    expect(await refuses(() => ReviewDetailPage({ params: { id: 'held' } }))).toBe(true)
  })
})

describe('BUG-004 — metadata', () => {
  it('an existing review keeps its real title, description and OG card', async () => {
    h.review = PUBLISHED
    const meta: any = await generateMetadata({ params: { id: 'r1' } })
    expect(meta.title).toContain('Quán A')
    expect(meta.openGraph.title).toBe('Quán A — 5/5 sao')
    expect(meta.description).toContain('ngon lắm')
    expect(meta.openGraph.images).toHaveLength(1)
  })

  it('🚨 a missing review publishes no review title, description or OG card', async () => {
    // The old fallback was `{ title: 'Review | TappyAI' }`, so a link to a DELETED post previewed
    // as a real one. With the status fixed the not-found route supplies the head instead; this
    // asserts nothing here fabricates review metadata for a row that does not exist.
    h.review = null
    const meta: any = await generateMetadata({ params: { id: 'gone' } })
    expect(meta.openGraph).toBeUndefined()
    expect(meta.description).toBeUndefined()
    expect(meta.twitter).toBeUndefined()
  })
})

describe('BUG-004 — the app-root Suspense boundary must not come back', () => {
  const APP = 'src/app'

  it('🚨 there is NO loading.tsx directly under src/app', () => {
    // THIS is the fix. A loading.tsx here is an implicit Suspense boundary over every route, and
    // it makes `notFound()` unable to set a status code ANYWHERE in the application — not just on
    // this page. Restoring one silently reintroduces soft 404s across the whole site.
    expect(existsSync(join(APP, 'loading.tsx'))).toBe(false)
    expect(existsSync(join(APP, 'loading.jsx'))).toBe(false)
  })

  it('the Home skeleton still exists, scoped to the (home) route group', () => {
    // Option (b): the boundary was moved, not deleted. Home is an async server component and is
    // the one route the skeleton was ever drawn for.
    expect(existsSync(join(APP, '(home)', 'loading.tsx'))).toBe(true)
    expect(existsSync(join(APP, '(home)', 'page.tsx'))).toBe(true)
  })

  it('no OTHER route group at the app root re-creates a global boundary', () => {
    // A `loading.tsx` inside any root-level route group covers every route in that group. Only
    // `(home)` may have one, and `(home)` contains only Home.
    const groups = readdirSync(APP, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('(') && d.name !== '(home)')
      .filter(d => existsSync(join(APP, d.name, 'loading.tsx')))
      .map(d => d.name)
    expect(groups).toEqual([])
  })
})
