import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── V2.2-2 — the person's own marketing consent ─────────────────────────────
//
// These assertions are about the ROW THE ROUTE WOULD WRITE and the STATE IT
// READS BACK, never about a 200. A route can return 200 having written nothing,
// having written the wrong user, or having written the opposite value — and
// `fetch` does not throw on a 4xx, so a client cannot tell the difference
// either. The write is captured and inspected.

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    /** Every row passed to `.upsert()`, in order. */
    upserts: [] as Record<string, unknown>[],
    /** Rows the mocked SELECT returns. */
    rows: [] as { channel: string; opted_in: boolean }[],
    selectFilter: null as [string, unknown] | null,
    rateLimited: false,
    anonRefusal: null as Response | null,
  }

  const builder: {
    from: (t: string) => typeof builder
    select: () => typeof builder
    eq: (c: string, v: unknown) => Promise<{ data: unknown; error: null }>
    upsert: (row: Record<string, unknown>) => Promise<{ error: null }>
  } = {
    from: () => builder,
    select: () => builder,
    eq: (column: string, value: unknown) => {
      state.selectFilter = [column, value]
      return Promise.resolve({ data: state.rows, error: null })
    },
    upsert: (row: Record<string, unknown>) => {
      state.upserts.push(row)
      return Promise.resolve({ error: null })
    },
  }

  return {
    state,
    getRequestUser: vi.fn(async () => ({ user: state.user, supabase: builder })),
    createAdminClient: vi.fn(() => builder),
    refuseAnonymousSocialWrite: vi.fn(() => state.anonRefusal),
    distributedRateLimit: vi.fn(async () =>
      state.rateLimited ? { ok: false, retryAfter: 60 } : { ok: true, remaining: 29 },
    ),
  }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: h.createAdminClient }))
vi.mock('@/lib/auth/socialWriteAccess', () => ({
  refuseAnonymousSocialWrite: h.refuseAnonymousSocialWrite,
}))
vi.mock('@/lib/security/distributedRateLimit', () => ({
  distributedRateLimit: h.distributedRateLimit,
}))

import { GET, PUT } from './route'

const URL_ = 'http://localhost/api/notifications/marketing-consent'
const get = () => new Request(URL_)
const put = (body: unknown) =>
  new Request(URL_, { method: 'PUT', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.upserts = []
  h.state.rows = []
  h.state.selectFilter = null
  h.state.rateLimited = false
  h.state.anonRefusal = null
})

// ═════════════════════════════════════════════════════════════════════════════
describe('GET — what this user has agreed to', () => {
  it('🚨 a user with NO rows reads as opted out on every channel', async () => {
    const res = await GET(get())
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toEqual({
      channels: { push: false, email: false, in_app: false },
      globallyUnsubscribed: false,
    })
  })

  it('reflects a stored opt-in — positive control', async () => {
    h.state.rows = [{ channel: 'push', opted_in: true }]
    const { data } = await (await GET(get())).json()
    expect(data.channels.push).toBe(true)
    expect(data.channels.email).toBe(false)
  })

  it('reports a global unsubscribe', async () => {
    h.state.rows = [
      { channel: 'push', opted_in: true },
      { channel: 'global', opted_in: false },
    ]
    const { data } = await (await GET(get())).json()
    expect(data.globallyUnsubscribed).toBe(true)
    // The per-channel row is reported as-is: the OVERRIDE happens at dispatch,
    // not by rewriting what the person chose.
    expect(data.channels.push).toBe(true)
  })

  it('reads only the session user’s rows', async () => {
    await GET(get())
    expect(h.state.selectFilter).toEqual(['user_id', 'u1'])
  })

  it('refuses an unauthenticated caller', async () => {
    h.state.user = null
    expect((await GET(get())).status).toBe(401)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('PUT — changing it', () => {
  it('writes an opt-in for the session user on the named channel', async () => {
    const res = await PUT(put({ channel: 'push', optedIn: true }))
    expect(res.status).toBe(200)
    expect(h.state.upserts).toHaveLength(1)
    expect(h.state.upserts[0]).toMatchObject({
      user_id: 'u1',
      channel: 'push',
      opted_in: true,
    })
    expect(h.state.upserts[0].opted_in_at).toEqual(expect.any(String))
  })

  it('🚨 the user id comes from the SESSION, never from the body', async () => {
    // This endpoint is reachable by every signed-in account. A body-supplied id
    // would let anyone opt anyone else in.
    await PUT(put({ channel: 'push', optedIn: true, userId: 'victim' }))
    expect(h.state.upserts[0].user_id).toBe('u1')
  })

  it('writes an opt-OUT without erasing when consent was first given', async () => {
    await PUT(put({ channel: 'push', optedIn: false }))
    const row = h.state.upserts[0]
    expect(row.opted_in).toBe(false)
    expect(row.opted_out_at).toEqual(expect.any(String))
    // When they first agreed is a separate fact from when they withdrew.
    expect(row).not.toHaveProperty('opted_in_at')
  })

  it('sets the global unsubscribe on the reserved `global` row', async () => {
    await PUT(put({ globallyUnsubscribed: true }))
    expect(h.state.upserts[0]).toMatchObject({ channel: 'global', opted_in: false })
  })

  it('clearing the global unsubscribe does NOT re-grant channel consent', async () => {
    await PUT(put({ globallyUnsubscribed: false }))
    // One row written, and it is the global one. Nothing touched `push`.
    expect(h.state.upserts).toHaveLength(1)
    expect(h.state.upserts[0]).toMatchObject({ channel: 'global', opted_in: true })
  })

  it('returns the state READ BACK from the database, not an echo of the request', async () => {
    // The client renders what is stored. An optimistic echo would let the UI and
    // the table disagree with nothing failing.
    h.state.rows = [{ channel: 'push', opted_in: false }]
    const { data } = await (await PUT(put({ channel: 'push', optedIn: true }))).json()
    expect(data.channels.push).toBe(false)
  })

  it('rejects an unknown channel', async () => {
    const res = await PUT(put({ channel: 'sms', optedIn: true }))
    expect(res.status).toBe(400)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('rejects a request that names neither operation — no silent no-op', async () => {
    const res = await PUT(put({}))
    expect(res.status).toBe(400)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('rejects a non-boolean optedIn rather than coercing it', async () => {
    const res = await PUT(put({ channel: 'push', optedIn: 'yes' }))
    expect(res.status).toBe(400)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('refuses an unauthenticated caller and writes nothing', async () => {
    h.state.user = null
    expect((await PUT(put({ channel: 'push', optedIn: true }))).status).toBe(401)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('🚨 refuses an anonymous session and writes nothing', async () => {
    h.state.anonRefusal = new Response(null, { status: 403 })
    expect((await PUT(put({ channel: 'push', optedIn: true }))).status).toBe(403)
    expect(h.state.upserts).toHaveLength(0)
  })

  it('refuses when rate limited and writes nothing', async () => {
    h.state.rateLimited = true
    const res = await PUT(put({ channel: 'push', optedIn: true }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(h.state.upserts).toHaveLength(0)
  })

  it('the anonymous check runs BEFORE the write, not after', async () => {
    h.state.anonRefusal = new Response(null, { status: 403 })
    await PUT(put({ channel: 'push', optedIn: true }))
    expect(h.state.upserts).toHaveLength(0)
    expect(h.refuseAnonymousSocialWrite).toHaveBeenCalled()
  })
})
