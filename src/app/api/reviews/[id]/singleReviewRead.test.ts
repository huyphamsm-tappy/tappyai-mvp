/**
 * `GET /api/reviews/[id]` — the single-review read the native clients had to do without.
 *
 * ============================================================================
 * WHAT THIS PROVES
 * ============================================================================
 * The route is new, and a new PUBLIC read route is exactly the place where a publication filter
 * gets forgotten. So these tests assert on the FILTERS THE ROUTE ACTUALLY APPLIES, captured from
 * the query builder, rather than on a response body a fake could produce either way.
 *
 * Also proved here: the comment count is COUNTED, not read off `reviews.comment_count`. That
 * column drifts (the trigger maintaining it is blocked by RLS for ordinary users), which is why
 * the web detail page counts rows too. A detail screen is the one surface where the discrepancy
 * is visible — "3 bình luận" above two comments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string } | null,
    review: null as Row | null,
    /** Every `.or()` argument the route passed, in order. */
    filters: [] as string[],
    /** `from()` targets, so "did it even look at review_comments?" is checkable. */
    tables: [] as string[],
    commentCount: 0,
    likeRow: null as Row | null,
    saveRow: null as Row | null,
  }

  const builder = (table: string): any => {
    const b: any = {
      select: () => b,
      eq: () => b,
      // PostgREST builders are thenables: a count query is `select(…).eq(…)` and is awaited
      // without a terminal call. Only the comment count is awaited that way here.
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ count: state.commentCount, error: null }),
      or: (expr: string) => {
        state.filters.push(expr)
        return b
      },
      maybeSingle: () => {
        if (table === 'reviews') return Promise.resolve({ data: state.review, error: null })
        if (table === 'review_likes') return Promise.resolve({ data: state.likeRow, error: null })
        if (table === 'review_saves') return Promise.resolve({ data: state.saveRow, error: null })
        return Promise.resolve({ data: null, error: null })
      },
    }
    return b
  }

  const client = {
    from: (table: string) => {
      state.tables.push(table)
      return builder(table)
    },
  }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))

import { GET } from './route'

const PUBLISHED: Row = {
  id: 'r1',
  user_id: 'author-1',
  place_name: 'Quán Ngon',
  body: 'Ngon',
  like_count: 4,
  comment_count: 99, // deliberately wrong — the column drifts
  save_count: 2,
  created_at: '2026-08-01T00:00:00Z',
  profiles: { full_name: 'An', avatar_url: null },
}

const get = async (id = 'r1') => {
  const req = {
    nextUrl: new URL(`http://localhost/api/reviews/${id}`),
    headers: new Headers(),
  }
  const res = await GET(req as any, { params: { id } })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.user = null
  h.state.review = { ...PUBLISHED }
  h.state.filters = []
  h.state.tables = []
  h.state.commentCount = 2
  h.state.likeRow = null
  h.state.saveRow = null
  process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true'
})

describe('GET /api/reviews/[id] — access', () => {
  it('applies BOTH the hidden filter and the publication filter', async () => {
    await get()
    expect(h.state.filters).toContain('is_hidden.is.null,is_hidden.eq.false')
    expect(h.state.filters).toContain('publication_state.is.null,publication_state.eq.PUBLISHED')
  })

  it('🚨 there is no author exemption — the author gets the same filters', async () => {
    // The author reaching their own held post through the PUBLIC url would produce a link that
    // works for them and 404s for everyone they send it to. `/api/reviews/mine` is the surface
    // built for their held content.
    h.state.user = { id: 'author-1' }
    await get()
    expect(h.state.filters).toContain('publication_state.is.null,publication_state.eq.PUBLISHED')
  })

  it('an unreachable row is 404 with a machine code, not a 200 with null', async () => {
    h.state.review = null
    const { status, body } = await get('missing')
    expect(status).toBe(404)
    expect(body.error).toBe('not_found')
    expect(typeof body.message).toBe('string')
    // The contract: `error` is the stable machine code, `message` is the human sentence.
    expect(body.error).not.toBe(body.message)
  })

  it('an anonymous caller can read a published review', async () => {
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.id).toBe('r1')
  })
})

describe('GET /api/reviews/[id] — viewer state', () => {
  it('liked/saved are false for an anonymous caller, and no per-user lookup happens', async () => {
    const { body } = await get()
    expect(body.liked_by_me).toBe(false)
    expect(body.saved_by_me).toBe(false)
    expect(h.state.tables).not.toContain('review_likes')
    expect(h.state.tables).not.toContain('review_saves')
  })

  it('liked/saved reflect the CALLER', async () => {
    h.state.user = { id: 'viewer-9' }
    h.state.likeRow = { id: 'like-1' }
    const { body } = await get()
    expect(body.liked_by_me).toBe(true)
    expect(body.saved_by_me).toBe(false)
  })
})

describe('GET /api/reviews/[id] — counts', () => {
  it('🚨 comment_count is COUNTED, not taken from the drifting column', async () => {
    h.state.commentCount = 2
    const { body } = await get()
    expect(h.state.tables).toContain('review_comments')
    expect(body.comment_count).toBe(2)
    expect(body.comment_count).not.toBe(PUBLISHED.comment_count)
  })

  it('null counts arrive as 0, so a client decoding a non-optional Int does not fail', async () => {
    // iOS decodes `likeCount`/`saveCount` as non-optional `Int`. A null here is a decode error
    // that shows as "could not load" on a review that loaded fine.
    h.state.review = { ...PUBLISHED, like_count: null, save_count: null }
    const { body } = await get()
    expect(body.like_count).toBe(0)
    expect(body.save_count).toBe(0)
  })
})
