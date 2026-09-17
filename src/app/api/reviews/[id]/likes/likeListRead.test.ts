/**
 * `GET /api/reviews/[id]/likes` — who currently likes a review.
 *
 * ============================================================================
 * WHAT THIS PROVES
 * ============================================================================
 * 1. It is gated on the REVIEW, with the same publication + hidden filters the single-review read
 *    applies. A new public read route is exactly where a publication filter gets forgotten, so the
 *    assertions capture the filters the route actually passed, not a body a fake could produce
 *    either way.
 * 2. It reads `review_likes` — CURRENT state — never `notifications`. The inbox is an append-only
 *    log that keeps "X liked your post" after X unlikes; a like list built on it would name people
 *    who no longer like the post. That is the exact mismatch this feature must not reproduce.
 * 3. It serves only id / full_name / avatar_url. No email, no auth fields.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = {
    review: null as Row | null,
    likeRows: [] as Row[],
    profiles: [] as Row[],
    /** Every `.or()` argument the route passed, in order. */
    filters: [] as string[],
    /** `from()` targets, so "did it read the notifications table?" is checkable. */
    tables: [] as string[],
    /** Every `rpc()` call — since 20260915b the likers come from `review_likers`, not the table. */
    rpcs: [] as { fn: string; args: Record<string, unknown> }[],
    /** The limit the like read asked for, and any cursor. */
    limit: null as number | null,
    lt: null as [string, string] | null,
  }

  const builder = (table: string): any => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: (n: number) => { if (table === 'review_likes') state.limit = n; return b },
      lt: (col: string, val: string) => { state.lt = [col, val]; return b },
      or: (expr: string) => { state.filters.push(expr); return b },
      // PostgREST builders are thenables — the like query and the profiles query are both awaited
      // without a terminal call.
      then: (resolve: (v: unknown) => unknown) =>
        resolve(
          table === 'review_likes'
            ? { data: state.likeRows, error: null }
            : table === 'profiles'
              ? { data: state.profiles, error: null }
              : { data: null, error: null },
        ),
      maybeSingle: () =>
        Promise.resolve({ data: table === 'reviews' ? state.review : null, error: null }),
    }
    return b
  }

  const client = {
    from: (table: string) => { state.tables.push(table); return builder(table) },
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcs.push({ fn, args })
      if (fn === 'review_likers') {
        state.limit = args.p_limit as number
        state.lt = args.p_before ? ['created_at', String(args.p_before)] : null
        return Promise.resolve({ data: state.likeRows, error: null })
      }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } })
    },
  }

  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: null, supabase: h.client }),
}))
vi.mock('@/lib/safety/gate/publicationAccess', () => ({
  publishableFilter: () => 'publication_state.is.null,publication_state.eq.PUBLISHED',
}))
vi.mock('@/lib/i18n/requestLocale', () => ({ requestLocale: () => 'vi' }))
vi.mock('@/lib/i18n/serverMessages', () => ({ serverMessage: (k: string) => `msg:${k}` }))

import { GET } from './route'

const REVIEW_ID = 'rev-1'

async function get(qs = '') {
  const req = new Request(`https://x/api/reviews/${REVIEW_ID}/likes${qs}`) as any
  const res = await GET(req, { params: { id: REVIEW_ID } })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.review = { id: REVIEW_ID }
  h.state.likeRows = []
  h.state.profiles = []
  h.state.filters = []
  h.state.tables = []
  h.state.rpcs = []
  h.state.limit = null
  h.state.lt = null
})

describe('GET /api/reviews/[id]/likes — access', () => {
  it('applies the hidden AND publication filters to the review, not to the likes', async () => {
    await get()
    expect(h.state.filters).toContain('is_hidden.is.null,is_hidden.eq.false')
    expect(h.state.filters).toContain('publication_state.is.null,publication_state.eq.PUBLISHED')
  })

  it('404s when the review is not readable — and never reads the likes', async () => {
    h.state.review = null
    const { status, body } = await get()
    expect(status).toBe(404)
    expect(body.error).toBe('not_found')
    // If you may not read the post, you may not enumerate who liked it.
    expect(h.state.tables).not.toContain('review_likes')
    expect(h.state.rpcs).toHaveLength(0)
  })

  it('an anonymous caller can read the list — this is a public read', async () => {
    h.state.likeRows = [{ user_id: 'u1', created_at: '2026-08-01T00:00:00Z' }]
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.likers).toHaveLength(1)
  })
})

describe('GET /api/reviews/[id]/likes — the list', () => {
  it('🚨 reads CURRENT likes through review_likers(), NEVER notifications (an append-only log)', async () => {
    await get()
    // The table is owner-read since 20260915b_review_likes_private.sql: the per-review list is the
    // one cross-user read, and it goes through the review-scoped SECURITY DEFINER function.
    expect(h.state.tables).not.toContain('review_likes')
    expect(h.state.rpcs.map(r => r.fn)).toEqual(['review_likers'])
    expect(h.state.rpcs[0].args).toMatchObject({ p_review_id: REVIEW_ID })
    expect(h.state.tables).not.toContain('notifications')
  })

  it('joins display data through ONE batched profiles fetch', async () => {
    h.state.likeRows = [
      { user_id: 'u1', created_at: '2026-08-02T00:00:00Z' },
      { user_id: 'u2', created_at: '2026-08-01T00:00:00Z' },
    ]
    h.state.profiles = [
      { id: 'u1', full_name: 'Người A', avatar_url: 'https://a/1.png' },
      { id: 'u2', full_name: 'Người B', avatar_url: null },
    ]
    const { body } = await get()
    expect(body.likers.map((l: Row) => l.id)).toEqual(['u1', 'u2'])
    expect(body.likers[0].full_name).toBe('Người A')
    expect(body.likers[1].avatar_url).toBeNull()
    // review_likes.user_id references auth.users, so PostgREST cannot embed profiles — exactly one
    // extra query, the same two-step GET /api/notifications uses.
    expect(h.state.tables.filter(t => t === 'profiles')).toHaveLength(1)
  })

  it('keeps a liker who has no profile row instead of dropping them', async () => {
    // Anonymous sessions never got a profiles row. Dropping them would make the list disagree with
    // the count printed next to it — which is the class of bug this whole change is about.
    h.state.likeRows = [{ user_id: 'anon-1', created_at: '2026-08-02T00:00:00Z' }]
    h.state.profiles = []
    const { body } = await get()
    expect(body.likers).toHaveLength(1)
    expect(body.likers[0].id).toBe('anon-1')
    expect(body.likers[0].full_name).toBeNull()   // the client localizes its own fallback
  })

  it('serves no email or auth fields', async () => {
    h.state.likeRows = [{ user_id: 'u1', created_at: '2026-08-02T00:00:00Z', email: 'leak@x.com' }]
    h.state.profiles = [{ id: 'u1', full_name: 'A', avatar_url: null, email: 'leak@x.com' }]
    const { body } = await get()
    expect(Object.keys(body.likers[0]).sort()).toEqual(['avatar_url', 'created_at', 'full_name', 'id'])
    expect(JSON.stringify(body)).not.toContain('leak@x.com')
  })
})

describe('GET /api/reviews/[id]/likes — paging', () => {
  it('defaults to 30 and clamps an oversized limit to 50', async () => {
    await get()
    expect(h.state.limit).toBe(30)
    await get('?limit=500')
    expect(h.state.limit).toBe(50)
  })

  it('passes ?before through as a created_at cursor', async () => {
    await get('?before=2026-08-01T00%3A00%3A00Z')
    expect(h.state.lt).toEqual(['created_at', '2026-08-01T00:00:00Z'])
  })

  it('a short page ends the list; a full page carries a cursor', async () => {
    h.state.likeRows = [{ user_id: 'u1', created_at: '2026-08-02T00:00:00Z' }]
    expect((await get()).body.next_cursor).toBeNull()

    h.state.likeRows = Array.from({ length: 30 }, (_, i) => ({
      user_id: `u${i}`, created_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    expect((await get()).body.next_cursor).toBe('2026-08-30T00:00:00Z')
  })
})
