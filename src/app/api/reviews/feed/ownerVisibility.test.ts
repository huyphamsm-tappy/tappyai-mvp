import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// OWNER VISIBILITY on the profile feed.
//
// Found in real UAT, 2026-08-18: a user uploaded a clip, `POST /api/reviews`
// returned 200, the row was correctly written UNDER_REVIEW — and the author
// could not see their own clip on their own web profile. `/api/reviews/feed`
// backs "Bài của tôi" and the profile grid, which is the only place an author
// can reach a post to hide or delete it. Filtering a held post out THERE hides
// it from nobody and strands it from the one person who could act on it.
//
// The fix must not widen anything: a held post stays invisible to every other
// caller. That is the whole matrix below, asserted BEHAVIOURALLY — the fake
// really applies `.eq`, `.or` and `.range` to fixture rows, so deleting the
// gate makes a held row appear and the test fails.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = 'f9077a52-b0f3-453a-a497-97da115ae386'
const HELD = '82ee2711-877c-4f7d-a84e-4813db2649f3'
const PUBLISHED = '11111111-1111-4111-8111-111111111111'
const LEGACY = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => {
  const state = { rows: [] as Row[], user: null as any }

  const orClause = (row: Row, clause: string): boolean => {
    const [col, ...rest] = clause.split('.')
    const op = rest.join('.')
    if (op === 'is.null') return row[col] === null || row[col] === undefined
    if (op === 'not.is.null') return row[col] !== null && row[col] !== undefined
    if (op.startsWith('eq.')) return String(row[col]) === op.slice(3)
    if (op.startsWith('ilike.')) return true // search path, not under test here
    throw new Error(`fake supabase: unsupported or() clause "${clause}"`)
  }

  const builder = (table: string) => {
    const preds: ((r: Row) => boolean)[] = []
    let from = 0
    let to = Infinity
    const source = () => (table === 'reviews' ? state.rows : [])

    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => { preds.push((r) => r[col] === val); return b },
      neq: (col: string, val: unknown) => { preds.push((r) => r[col] !== val); return b },
      in: () => b,
      or: (expr: string) => {
        const clauses = expr.split(',')
        preds.push((r) => clauses.some((c) => orClause(r, c)))
        return b
      },
      order: () => b,
      limit: () => b,
      range: (a: number, z: number) => { from = a; to = z; return b },
      then: (res: any, rej: any) => {
        const all = source().filter((r) => preds.every((p) => p(r)))
        return Promise.resolve({ data: all.slice(from, to + 1), error: null }).then(res, rej)
      },
    }
    return b
  }

  const client = { from: (t: string) => builder(t) }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/policy/explore/reviewFeedObservation', () => ({
  observePrivacyForFeed: () => undefined,
}))

import { GET } from './route'

const review = (id: string, userId: string, publication_state: string | null): Row => ({
  id,
  user_id: userId,
  place_id: 'p',
  place_name: 'Quán',
  place_address: 'HN',
  rating: 5,
  body: 'ngon',
  photos: null,
  is_verified: false,
  like_count: 0,
  comment_count: 0,
  save_count: 0,
  watch_time_avg: 0,
  completion_rate: 0,
  view_count: 0,
  content_type: 'video',
  // GCS, not the suspended Blob host — so stripUnservableMedia keeps it.
  media_url: `https://storage.googleapis.com/tappyai-media-prod/videos/${id}.mp4`,
  thumbnail: `https://storage.googleapis.com/tappyai-media-prod/thumbnails/${id}.jpg`,
  hashtags: [],
  source_type: 'upload',
  source_url: null,
  created_at: '2026-08-18T04:31:11Z',
  music: null,
  is_hidden: false,
  publication_state,
  profiles: { full_name: 'A', avatar_url: null },
})

// The route reads `req.nextUrl.searchParams` and nothing else off the request;
// identity comes from the mocked getRequestUser.
const call = async (qs: string) => {
  const req = { nextUrl: new URL('http://localhost/api/reviews/feed' + qs) }
  const res = await GET(req as any)
  return (await res.json()).reviews as Row[]
}
const ids = (rows: Row[]) => rows.map((r) => r.id)

beforeEach(() => {
  // The gate's filter is inert unless the schema is migrated. Production has
  // this set; without it every assertion below would be vacuous.
  process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true'
  h.state.user = null
  h.state.rows = [
    review(HELD, OWNER, 'UNDER_REVIEW'),
    review(PUBLISHED, OWNER, 'PUBLISHED'),
    review(LEGACY, OWNER, null),
  ]
})

describe('profile feed — the visibility matrix', () => {
  it('OWNER + UNDER_REVIEW → VISIBLE (the UAT bug)', async () => {
    h.state.user = { id: OWNER }
    expect(ids(await call(`?userId=${OWNER}&limit=50`))).toContain(HELD)
  })

  it('OWNER + PUBLISHED → VISIBLE', async () => {
    h.state.user = { id: OWNER }
    expect(ids(await call(`?userId=${OWNER}&limit=50`))).toContain(PUBLISHED)
  })

  it('OTHER USER + UNDER_REVIEW → HIDDEN', async () => {
    h.state.user = { id: OTHER }
    const got = ids(await call(`?userId=${OWNER}&limit=50`))
    expect(got, 'a held post must not reach another signed-in user').not.toContain(HELD)
  })

  it('OTHER USER + PUBLISHED → VISIBLE, unchanged', async () => {
    h.state.user = { id: OTHER }
    const got = ids(await call(`?userId=${OWNER}&limit=50`))
    expect(got).toContain(PUBLISHED)
    expect(got).toContain(LEGACY)
  })

  it('ANONYMOUS + UNDER_REVIEW → HIDDEN', async () => {
    h.state.user = null
    const got = ids(await call(`?userId=${OWNER}&limit=50`))
    expect(got).not.toContain(HELD)
    expect(got).toContain(PUBLISHED)
  })

  it('legacy rows (publication_state NULL) stay visible to everyone', async () => {
    for (const u of [null, { id: OTHER }, { id: OWNER }]) {
      h.state.user = u
      expect(ids(await call(`?userId=${OWNER}&limit=50`)), `viewer ${JSON.stringify(u)}`).toContain(LEGACY)
    }
  })
})

describe('the exemption is scoped to the author, not to the shape of the request', () => {
  it('🚨 asking for someone else\'s profile does not unlock their held post', async () => {
    // `userId` is a query parameter; `user.id` comes from a verified session.
    // Only their being the same person may relax the gate.
    h.state.user = { id: OTHER }
    expect(ids(await call(`?userId=${OWNER}&limit=50`))).not.toContain(HELD)
  })

  it('🚨 the general Explore feed never relaxes the gate, even for the author', async () => {
    // No `userId` at all — this is discovery, not management.
    h.state.user = { id: OWNER }
    h.state.rows = [review(HELD, OWNER, 'UNDER_REVIEW'), review(PUBLISHED, OTHER, 'PUBLISHED')]
    expect(ids(await call('?limit=50'))).not.toContain(HELD)
  })

  it('the following feed never relaxes the gate', async () => {
    h.state.user = { id: OTHER }
    expect(ids(await call('?following=true&limit=50'))).not.toContain(HELD)
  })

  it('an anonymous caller cannot claim to be the author', async () => {
    // user is null, so `filterUserId === user.id` can never hold.
    h.state.user = null
    expect(ids(await call(`?userId=${OWNER}&limit=50`))).not.toContain(HELD)
  })
})

describe('nothing else about the profile feed changed', () => {
  it('still scopes the query to the requested author', async () => {
    h.state.rows.push(review('33333333-3333-4333-8333-333333333333', OTHER, 'PUBLISHED'))
    h.state.user = { id: OWNER }
    const got = await call(`?userId=${OWNER}&limit=50`)
    expect(got.every((r) => r.user_id === OWNER), 'no other author leaked in').toBe(true)
  })

  it('still honours pagination', async () => {
    h.state.user = { id: OWNER }
    const page0 = await call(`?userId=${OWNER}&page=0&limit=2`)
    expect(page0).toHaveLength(2)
  })

  it('still drops hidden rows', async () => {
    const hidden = review('44444444-4444-4444-8444-444444444444', OWNER, 'PUBLISHED')
    hidden.is_hidden = true
    h.state.rows.push(hidden)
    h.state.user = { id: OWNER }
    expect(ids(await call(`?userId=${OWNER}&limit=50`))).not.toContain(hidden.id)
  })
})
