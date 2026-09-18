/**
 * `GET /api/reviews/[id]` — visibility, proved by APPLYING the route's own filters to a row.
 *
 * `singleReviewRead.test.ts` proves the route *emits* the hidden and publication filters. This
 * file proves what they *do*: the fake below evaluates every `.eq()` / `.or()` the route passes
 * the way PostgREST would, so a hidden row, a held (UNDER_REVIEW) row or a restricted row
 * answers 404 — for an anonymous caller, for another signed-in user, AND for the author (the
 * author's own hidden/held content is served by `/api/reviews/mine`, never by the public url).
 *
 * Why now (2026-09-17): Android's detail screen started fetching uncached rows by id (a liked or
 * shared post opened from the self profile). That makes this route the boundary between "a row
 * someone once liked" and "a row anyone may still read"; a liked post its author has since hidden
 * must come back 404, and the client renders "không còn khả dụng".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string } | null,
    rows: [] as Row[],
  }

  /** One PostgREST `or=` clause: `a.op.v,b.op.v` — only the operators this route uses. */
  const matchesOr = (row: Row, expr: string): boolean =>
    expr.split(',').some(term => {
      const [col, op, ...rest] = term.split('.')
      const value = rest.join('.')
      const actual = row[col]
      if (op === 'is' && value === 'null') return actual === null || actual === undefined
      if (op === 'eq') return String(actual) === value
      if (op === 'not' && rest[0] === 'is' && rest[1] === 'null') return actual !== null && actual !== undefined
      throw new Error(`unhandled or-term: ${term}`)
    })

  const builder = (table: string): any => {
    let candidates: Row[] = table === 'reviews' ? [...state.rows] : []
    const b: any = {
      select: () => b,
      eq: (col: string, v: unknown) => { candidates = candidates.filter(r => r[col] === v); return b },
      or: (expr: string) => { candidates = candidates.filter(r => matchesOr(r, expr)); return b },
      // The count query for review_comments is awaited as a thenable.
      then: (resolve: (v: unknown) => unknown) => resolve({ count: 0, error: null }),
      maybeSingle: () => Promise.resolve({ data: candidates[0] ?? null, error: null }),
    }
    return b
  }

  const client = { from: (table: string) => builder(table) }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))

import { GET } from './route'

const base = (over: Row): Row => ({
  id: 'r',
  user_id: 'author-1',
  place_name: 'Quán Ngon',
  body: 'Ngon',
  like_count: 1,
  comment_count: 0,
  save_count: 0,
  created_at: '2026-08-01T00:00:00Z',
  is_hidden: false,
  publication_state: 'PUBLISHED',
  profiles: { full_name: 'An', avatar_url: null },
  ...over,
})

const get = async (id: string) => {
  const req = { nextUrl: new URL(`http://localhost/api/reviews/${id}`), headers: new Headers() }
  const res = await GET(req as any, { params: { id } })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.user = null
  process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true'
  h.state.rows = [
    base({ id: 'public' }),
    base({ id: 'legacy-null-state', publication_state: null, is_hidden: null }),
    base({ id: 'hidden', is_hidden: true }),
    base({ id: 'held', publication_state: 'UNDER_REVIEW' }),
    base({ id: 'restricted', publication_state: 'RESTRICTED' }),
    base({ id: 'hidden-and-held', is_hidden: true, publication_state: 'UNDER_REVIEW' }),
  ]
})

const VIEWERS: Array<[string, { id: string } | null]> = [
  ['anonymous', null],
  ['another signed-in user', { id: 'someone-else' }],
  ['the author', { id: 'author-1' }],
]

describe('GET /api/reviews/[id] — what the filters let through', () => {
  it.each(VIEWERS)('%s can read a published row and a legacy row with no lifecycle state', async (_who, user) => {
    h.state.user = user
    expect((await get('public')).status).toBe(200)
    expect((await get('legacy-null-state')).status).toBe(200)
  })

  it.each(VIEWERS)('%s gets 404 for a hidden row', async (_who, user) => {
    h.state.user = user
    const { status, body } = await get('hidden')
    expect(status).toBe(404)
    expect(body.error).toBe('not_found')
    expect(body).not.toHaveProperty('body')
  })

  it.each(VIEWERS)('%s gets 404 for a held (UNDER_REVIEW) row and a RESTRICTED row', async (_who, user) => {
    h.state.user = user
    expect((await get('held')).status).toBe(404)
    expect((await get('restricted')).status).toBe(404)
    expect((await get('hidden-and-held')).status).toBe(404)
  })

  it('the id scopes the read — a visible row never answers for another id', async () => {
    expect((await get('does-not-exist')).status).toBe(404)
  })

  it('🚨 the author has no exemption on the public url — their hidden/held rows are /api/reviews/mine only', async () => {
    h.state.user = { id: 'author-1' }
    expect((await get('hidden')).status).toBe(404)
    expect((await get('held')).status).toBe(404)
  })

  it('before the lifecycle column exists, the publication filter is inert but the hidden filter still applies', async () => {
    process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'false'
    h.state.rows = [base({ id: 'held', publication_state: 'UNDER_REVIEW' }), base({ id: 'hidden', is_hidden: true })]
    expect((await get('held')).status).toBe(200)
    expect((await get('hidden')).status).toBe(404)
  })
})
