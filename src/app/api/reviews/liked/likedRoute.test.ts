/**
 * GET /api/reviews/liked — the self profile's "Đã thích" read, pinned to the same contract as
 * `/api/reviews/saved`: bearer-only, 401 signed out, newest like first, hidden + held posts out,
 * unservable media stripped, `{ reviews: [] }` when nothing is liked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = {
    user: null as Row | null,
    likeRows: [] as Row[],
    reviews: [] as Row[],
    filters: [] as string[],
    tables: [] as string[],
    eqs: [] as [string, unknown][],
    limit: null as number | null,
  }
  const builder = (table: string): any => {
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => { state.eqs.push([col, val]); return b },
      in: () => b,
      order: () => b,
      limit: (n: number) => { if (table === 'review_likes') state.limit = n; return b },
      or: (expr: string) => { state.filters.push(expr); return b },
      then: (resolve: (v: unknown) => unknown) =>
        resolve(
          table === 'review_likes'
            ? { data: state.likeRows, error: null }
            : table === 'reviews'
              ? { data: state.reviews, error: null }
              : { data: null, error: null },
        ),
    }
    return b
  }
  const client = { from: (table: string) => { state.tables.push(table); return builder(table) } }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/safety/gate/publicationAccess', () => ({
  publishableFilter: () => 'publication_state.is.null,publication_state.eq.PUBLISHED',
}))
vi.mock('@/lib/media/servableMedia', () => ({
  stripUnservableMedia: (r: Row) => ({ ...r, stripped: true }),
}))
vi.mock('@/lib/i18n/requestLocale', () => ({ requestLocale: () => 'vi' }))
vi.mock('@/lib/i18n/serverMessages', () => ({ serverMessage: (k: string) => `msg:${k}` }))

import { GET } from './route'

async function get() {
  const res = await GET(new Request('https://x/api/reviews/liked') as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.user = { id: 'me' }
  h.state.likeRows = []
  h.state.reviews = []
  h.state.filters = []
  h.state.tables = []
  h.state.eqs = []
  h.state.limit = null
})

describe('GET /api/reviews/liked', () => {
  it('is bearer-only: 401 when signed out', async () => {
    h.state.user = null
    const { status, body } = await get()
    expect(status).toBe(401)
    expect(body.error).toBe('unauthorized')
    expect(h.state.tables).toEqual([])
  })

  it('reads only the caller\'s likes, capped at 100, and answers an empty list without touching reviews', async () => {
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body).toEqual({ reviews: [] })
    expect(h.state.eqs).toEqual([['user_id', 'me']])
    expect(h.state.limit).toBe(100)
    expect(h.state.tables).toEqual(['review_likes'])
  })

  it('orders newest like first, applies the hidden and publication gates, strips media', async () => {
    h.state.likeRows = [
      { review_id: 'old', created_at: '2026-09-01T00:00:00Z' },
      { review_id: 'new', created_at: '2026-09-14T00:00:00Z' },
    ]
    // The database answers in its own order; the route re-sorts by like time.
    h.state.reviews = [{ id: 'old', created_at: '2026-01-01' }, { id: 'new', created_at: '2026-01-02' }]
    const { body } = await get()
    expect(body.reviews.map((r: Row) => r.id)).toEqual(['new', 'old'])
    expect(body.reviews[0]).toMatchObject({ liked_at: '2026-09-14T00:00:00Z', stripped: true })
    expect(h.state.filters).toEqual(['is_hidden.is.null,is_hidden.eq.false', 'publication_state.is.null,publication_state.eq.PUBLISHED'])
    expect(h.state.tables).toEqual(['review_likes', 'reviews'])
  })
})
