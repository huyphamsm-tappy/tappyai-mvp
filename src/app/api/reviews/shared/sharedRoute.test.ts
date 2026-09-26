/**
 * GET /api/reviews/shared — the self profile's "Đã share" read, pinned to the same contract as
 * `/saved` and `/liked`: bearer-only, 401 signed out, newest share first, one row per review
 * (the latest share), hidden + held posts out, unservable media stripped, bounded by `?limit=`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = {
    user: null as Row | null,
    shareRows: [] as Row[],
    reviews: [] as Row[],
    filters: [] as string[],
    tables: [] as string[],
    eqs: [] as [string, unknown][],
    ins: [] as string[][],
    limit: null as number | null,
  }
  const builder = (table: string): any => {
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => { state.eqs.push([col, val]); return b },
      in: (_col: string, ids: string[]) => { state.ins.push(ids); return b },
      order: () => b,
      limit: (n: number) => { if (table === 'review_shares') state.limit = n; return b },
      or: (expr: string) => { state.filters.push(expr); return b },
      then: (resolve: (v: unknown) => unknown) =>
        resolve(
          table === 'review_shares'
            ? { data: state.shareRows, error: null }
            : table === 'reviews'
              ? { data: state.reviews.filter((r) => state.ins.at(-1)?.includes(r.id)), error: null }
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

async function get(qs = '') {
  const res = await GET(new Request(`https://x/api/reviews/shared${qs}`) as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.user = { id: 'me' }
  h.state.shareRows = []
  h.state.reviews = []
  h.state.filters = []
  h.state.tables = []
  h.state.eqs = []
  h.state.ins = []
  h.state.limit = null
})

describe('GET /api/reviews/shared', () => {
  it('is bearer-only: 401 when signed out, nothing read', async () => {
    h.state.user = null
    expect((await get()).status).toBe(401)
    expect(h.state.tables).toEqual([])
  })

  it("reads only the caller's shares and answers an empty list without touching reviews", async () => {
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body).toEqual({ reviews: [] })
    expect(h.state.eqs).toEqual([['user_id', 'me']])
    expect(h.state.tables).toEqual(['review_shares'])
  })

  it('collapses repeated shares to the latest per review, newest first, gated and stripped', async () => {
    h.state.shareRows = [
      { review_id: 'b', created_at: '2026-09-15T10:00:00Z', channel: 'zalo' },
      { review_id: 'a', created_at: '2026-09-15T09:00:00Z', channel: 'copy' },
      { review_id: 'b', created_at: '2026-09-14T00:00:00Z', channel: 'copy' },
    ]
    h.state.reviews = [{ id: 'a', created_at: '2026-01-01' }, { id: 'b', created_at: '2026-01-02' }]
    const { body } = await get()
    expect(body.reviews.map((r: Row) => r.id)).toEqual(['b', 'a'])
    expect(body.reviews[0]).toMatchObject({ shared_at: '2026-09-15T10:00:00Z', share_channel: 'zalo', stripped: true })
    expect(h.state.ins.at(-1)).toEqual(['b', 'a'])
    expect(h.state.filters).toEqual(['is_hidden.is.null,is_hidden.eq.false', 'publication_state.is.null,publication_state.eq.PUBLISHED'])
  })

  it('drops a share whose review is gone or filtered by the gates — never a blank card', async () => {
    h.state.shareRows = [{ review_id: 'gone', created_at: '2026-09-15T10:00:00Z', channel: 'copy' }]
    h.state.reviews = [] // deleted / hidden / held: the gated select returns nothing
    expect((await get()).body).toEqual({ reviews: [] })
  })

  it('bounds the page: ?limit narrows, never widens, and the default is 100', async () => {
    h.state.shareRows = Array.from({ length: 5 }, (_, i) => ({ review_id: `r${i}`, created_at: `2026-09-1${i}T00:00:00Z`, channel: 'copy' }))
    h.state.reviews = h.state.shareRows.map((s) => ({ id: s.review_id, created_at: '2026-01-01' }))
    expect((await get('?limit=2')).body.reviews).toHaveLength(2)
    expect(h.state.limit).toBe(6)
    expect((await get('?limit=1000')).body.reviews).toHaveLength(5)
    expect(h.state.limit).toBe(300)
    await get()
    expect(h.state.limit).toBe(300)
  })
})
