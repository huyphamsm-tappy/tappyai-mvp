import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Module 08 §4 enforcement, asserted through the ROUTES rather than the helper.
//
// The static source check beside the helper proves the guard is wired; this
// proves it actually stops a suspended user, and — just as important — that it
// does NOT stop everyone else. A guard that 403s the whole userbase would pass
// every "is it enforced?" assertion ever written.
//
// The supabase stub answers exactly one query shape: the guard's
// `.from('account_status').select(...).eq('user_id', ...).maybeSingle()`.
// Anything the route does afterwards is irrelevant here — a blocked request must
// return before it, and that is part of what these tests assert.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  // These routes build Supabase clients at module scope, so the env must exist
  // before the imports below run. Values are placeholders — every client this
  // test can reach is replaced by the stub, and nothing here opens a socket.
  // CI runs Node 20, which has no native WebSocket; a newer local Node does.
  // @supabase/supabase-js throws on construction without one, so a route that
  // builds a client at module scope loads locally and fails in CI. Removing the
  // global here reproduces the CI platform in the harness rather than leaving
  // the difference to be discovered by a red pipeline (ADR-019's principle:
  // platform facts belong in the harness, not inside a test).
  // vitest isolates test files, so this affects nothing else.
  delete (globalThis as { WebSocket?: unknown }).WebSocket

  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'
  // No service-role key is set: `@/lib/supabase/admin` is mocked below, so the
  // real factory never runs. Setting one here would also trip the architecture
  // guard's no-adhoc-service-role-client rule, correctly.

  const state = {
    user: { id: 'u1' } as { id: string; is_anonymous?: boolean } | null,
    status: null as null | { is_suspended: boolean; suspended_until: string | null; is_banned: boolean },
    error: null as null | { message: string },
    accountStatusQueried: false,
  }
  let lastTable = ''
  const builder: Record<string, unknown> = {}
  // Every builder verb returns the builder, so a route may chain freely past the
  // guard. Only the guard's own query is answered with data; everything else
  // resolves empty, which is enough for "did this request reach a 403 or not".
  for (const m of [
    'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'not',
    'or', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'match', 'filter', 'contains',
    'order', 'limit', 'range', 'single', 'returns',
  ]) {
    builder[m] = () => builder
  }
  builder.from = (table: string) => {
    lastTable = table
    if (table === 'account_status') state.accountStatusQueried = true
    return builder
  }
  builder.maybeSingle = async () =>
    lastTable === 'account_status'
      ? { data: state.status, error: state.error }
      : { data: null, error: null }
  builder.then = (res: (v: unknown) => unknown) =>
    Promise.resolve(
      lastTable === 'review_comments'
        ? { data: { id: 'c1', body: 'hay quá', created_at: '2026-08-19T00:00:00Z', user_id: 'u1', parent_comment_id: null }, error: null }
        : { data: null, error: null }
    ).then(res)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser, builder }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
// Downstream side effects of an ALLOWED request. Stubbed so this file measures
// the guard rather than the notification pipeline, and so no test opens a socket.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.builder }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: vi.fn(async () => undefined) }))
// `@/modules/music/server` reaches musicRepository.ts, which builds a Supabase
// client at MODULE scope. That construction needs a WebSocket, which Node 20 —
// what CI runs — does not provide natively, so importing the reviews route for
// real fails there while passing on a newer local Node. Mocking the module keeps
// the eager client out of the graph entirely; none of it runs before the 403.
vi.mock('@/modules/music/server', () => ({
  createSelection: vi.fn(async () => null),
  getTrack: vi.fn(async () => null),
  recordUsage: vi.fn(async () => undefined),
  createOriginalSound: vi.fn(async () => null),
}))

import { POST as reviewsPOST } from './reviews/route'
import { POST as commentsPOST } from './reviews/[id]/comments/route'

const SUSPENDED = { is_suspended: true, suspended_until: null, is_banned: false }
const BANNED = { is_suspended: false, suspended_until: null, is_banned: true }
const EXPIRED = { is_suspended: true, suspended_until: '2020-01-01T00:00:00Z', is_banned: false }

const reviewReq = () =>
  new Request('http://localhost/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId: 'p1', placeName: 'Quán', rating: 5, body: 'ngon' }),
  }) as never

const commentReq = () =>
  new Request('http://localhost/api/reviews/r1/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'hay quá' }),
  }) as never

const commentCtx = { params: { id: 'r1' } }

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: `u${Math.floor(performance.now() * 1000) % 100000}` }
  h.state.status = null
  h.state.error = null
  h.state.accountStatusQueried = false
})

describe('POST /api/reviews — "cannot post content"', () => {
  it('403s a suspended account with a machine-readable code', async () => {
    h.state.status = SUSPENDED
    const res = await reviewsPOST(reviewReq())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('account_suspended')
    expect(body.error).toBeTruthy()
  })

  it('403s a banned account', async () => {
    h.state.status = BANNED
    const res = await reviewsPOST(reviewReq())
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('account_banned')
  })

  it('does NOT 403 a user with no status row — the overwhelming majority', async () => {
    h.state.status = null
    const res = await reviewsPOST(reviewReq())
    expect(res.status).not.toBe(403)
    expect(h.state.accountStatusQueried).toBe(true)
  })

  it('does NOT 403 once the suspension has expired', async () => {
    h.state.status = EXPIRED
    const res = await reviewsPOST(reviewReq())
    expect(res.status).not.toBe(403)
  })

  it('does NOT 403 when the status read fails — the stated fail-open', async () => {
    h.state.error = { message: 'db down' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await reviewsPOST(reviewReq())
    expect(res.status).not.toBe(403)
  })
})

describe('POST /api/reviews/[id]/comments — "cannot comment"', () => {
  it('403s a suspended account', async () => {
    h.state.status = SUSPENDED
    const res = await commentsPOST(commentReq(), commentCtx)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('account_suspended')
  })

  it('403s a banned account', async () => {
    h.state.status = BANNED
    const res = await commentsPOST(commentReq(), commentCtx)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('account_banned')
  })

  it('does NOT 403 an unmoderated account', async () => {
    h.state.status = null
    const res = await commentsPOST(commentReq(), commentCtx)
    expect(res.status).not.toBe(403)
    expect(h.state.accountStatusQueried).toBe(true)
  })
})

describe('the guard runs before the work, not after', () => {
  it('rejects a suspended post without needing a valid body', async () => {
    h.state.status = SUSPENDED
    const res = await reviewsPOST(
      new Request('http://localhost/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json at all',
      }) as never
    )
    // 403, not 400: the account check precedes body parsing, so a blocked
    // request costs no upload, no music lookup and no DB write.
    expect(res.status).toBe(403)
  })
})

describe('anonymous callers are untouched', () => {
  it('an unauthenticated post is 401, and never queries account_status', async () => {
    h.state.user = null
    const res = await reviewsPOST(reviewReq())
    expect(res.status).toBe(401)
    expect(h.state.accountStatusQueried).toBe(false)
  })
})
