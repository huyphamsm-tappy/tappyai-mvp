import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── F03 — an anonymous visitor may not create recurring paid work ───────────────────────────────
//
// A price watch is not an inert private row. `/api/cron/price-check` runs daily, takes up to 100
// active watches ordered by `last_checked` with `nullsFirst: true`, and spends a paid Serper
// search plus a paid model call on each one — every day, until it triggers or is cancelled.
//
// The route required a session but never asked whether that session was anonymous, and an
// anonymous Supabase JWT carries `role: authenticated`, so `user` was truthy and the insert went
// through. Anonymous identities are mintable without limit and the ceiling is 10 per identity, so
// the spend had no upper bound — and because new rows sort first, they displaced real users'
// watches inside the worker's daily budget rather than merely adding to it.
//
// 🚨 The assertions here are about SIDE EFFECTS, not just status codes. A 403 that still wrote a
// row would satisfy a status-only test and none of the reasons this guard exists, so every refusal
// case also asserts that the database was never touched.
//
// Ownership and the existing product behaviour are covered in `route.test.ts`; this file adds the
// anonymous boundary and re-asserts ownership at the same layer so a change to one cannot quietly
// weaken the other.

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
    activeCount: 0,
    insertResult: { data: { id: 'w1' }, error: null } as { data: unknown; error: unknown },
    selectResult: { data: [] as unknown[], error: null } as { data: unknown; error: unknown },
    updateResult: { data: [{ id: 'w1' }] as unknown[], error: null } as { data: unknown; error: unknown },
    /** Every builder verb, in order. The proof that a refusal did no work. */
    calls: [] as string[],
    inserted: null as Record<string, unknown> | null,
    filters: [] as Array<[string, unknown]>,
  }

  const builder: Record<string, unknown> = {}
  let mode: 'select' | 'insert' | 'update' | 'count' | 'profile' = 'select'

  builder.from = (t: string) => { state.calls.push('from:' + t); if (t === 'profiles') mode = 'profile'; return builder }
  builder.select = (_c?: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) { mode = 'count'; return builder }
    if (mode !== 'profile') state.calls.push('select')
    return builder
  }
  builder.insert = (row: Record<string, unknown>) => { mode = 'insert'; state.inserted = row; state.calls.push('insert'); return builder }
  builder.update = (row: Record<string, unknown>) => { mode = 'update'; state.calls.push('update:' + JSON.stringify(row)); return builder }
  builder.eq = (c: string, v: unknown) => { state.filters.push([c, v]); return builder }
  builder.neq = () => builder
  builder.order = () => builder
  builder.limit = () => builder
  builder.single = () => {
    if (mode === 'profile') { mode = 'select'; return Promise.resolve({ data: { language: null }, error: null }) }
    return Promise.resolve(state.insertResult)
  }
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    const value = mode === 'count' ? { count: state.activeCount }
      : mode === 'update' ? state.updateResult
      : state.selectResult
    if (mode === 'count') mode = 'select'
    return Promise.resolve(value).then(res, rej)
  }

  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser, reset: () => { mode = 'select' } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
import { GET, POST, DELETE } from './route'

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api/price-watch', {
    method,
    headers: { 'Accept-Language': 'en' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/** A request whose body would throw if anything tried to parse it. */
const reqWithBrokenBody = (method: string) =>
  new Request('http://localhost/api/price-watch', {
    method, headers: { 'Accept-Language': 'en' }, body: '{ this is not json',
  })

const VALID = { product_name: 'AirPods Pro 2', target_price: 4_500_000, search_query: 'AirPods Pro 2 gia Shopee' }

const ANONYMOUS = { id: 'anon-1', is_anonymous: true }
const ACCOUNT = { id: 'u1', is_anonymous: false }

/** Did anything reach the price_watches table? */
const touchedDatabase = () =>
  h.state.calls.some((c) => c.startsWith('from:price_watches') || c === 'insert' || c.startsWith('update:'))

beforeEach(() => {
  vi.clearAllMocks()
  h.reset()
  h.state.user = { ...ACCOUNT }
  h.state.activeCount = 0
  h.state.insertResult = { data: { id: 'w1' }, error: null }
  h.state.selectResult = { data: [], error: null }
  h.state.updateResult = { data: [{ id: 'w1' }], error: null }
  h.state.calls = []
  h.state.inserted = null
  h.state.filters = []
})

// ── The refusal ────────────────────────────────────────────────────────────────────────────────

describe('F03 — an anonymous identity cannot mutate price watches', () => {
  it('POST is refused 403 account_required', async () => {
    h.state.user = { ...ANONYMOUS }
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('account_required')
    expect(typeof body.message).toBe('string')
    expect(body.message.length).toBeGreaterThan(0)
  })

  it('🚨 the refused POST writes NOTHING — no row, therefore no scheduled work', async () => {
    h.state.user = { ...ANONYMOUS }
    await POST(req('POST', VALID))
    expect(h.state.calls).toEqual([])
    expect(h.state.inserted).toBeNull()
    expect(touchedDatabase()).toBe(false)
  })

  it('DELETE is refused 403 account_required and cancels nothing', async () => {
    h.state.user = { ...ANONYMOUS }
    const res = await DELETE(req('DELETE', { id: 'w1' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('account_required')
    expect(touchedDatabase()).toBe(false)
    expect(h.state.calls.some((c) => c.startsWith('update:'))).toBe(false)
  })

  it('🔑 the guard runs BEFORE the body is read', async () => {
    // Unparseable body: if authorization happened after `await req.json()`, this would be a
    // thrown error or a 500, not a clean refusal. It is the cheapest proof of ordering there is.
    h.state.user = { ...ANONYMOUS }
    for (const res of [await POST(reqWithBrokenBody('POST')), await DELETE(reqWithBrokenBody('DELETE'))]) {
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe('account_required')
    }
    expect(touchedDatabase()).toBe(false)
  })

  it('403, not 401 — the identity is understood and not permitted', async () => {
    // A 401 tells a client to authenticate, and an anonymous client "authenticates" by minting
    // another anonymous session, which loops forever. 403 tells it to offer sign-in.
    h.state.user = { ...ANONYMOUS }
    expect((await POST(req('POST', VALID))).status).not.toBe(401)
    expect((await POST(req('POST', VALID))).status).toBe(403)
  })
})

// ── Reading stays open ─────────────────────────────────────────────────────────────────────────

describe('F03 — anonymous is read-only, not locked out', () => {
  it('GET still succeeds for an anonymous identity', async () => {
    h.state.user = { ...ANONYMOUS }
    h.state.selectResult = { data: [], error: null }
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ watches: [] })
  })

  it('and the read is scoped to that identity, never to a client-supplied id', async () => {
    h.state.user = { ...ANONYMOUS }
    await GET(req('GET'))
    expect(h.state.filters).toContainEqual(['user_id', 'anon-1'])
  })
})

// ── The account path is untouched ──────────────────────────────────────────────────────────────

describe('F03 — an account keeps every existing capability', () => {
  it('POST still creates, bound to the session user', async () => {
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'w1', ok: true })
    expect(h.state.inserted).toMatchObject({ user_id: 'u1', product_name: VALID.product_name })
    expect(h.state.calls).toContain('insert')
  })

  it('DELETE still cancels', async () => {
    const res = await DELETE(req('DELETE', { id: 'w1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.state.calls.some((c) => c.startsWith('update:'))).toBe(true)
  })

  it('GET still lists', async () => {
    h.state.selectResult = { data: [{ id: 'w1', product_name: 'X' }], error: null }
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).watches).toHaveLength(1)
  })

  it('the 10-watch ceiling still applies', async () => {
    h.state.activeCount = 10
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(429)
    expect(h.state.calls).not.toContain('insert')
  })

  it('a missing session is still 401, distinct from a refused anonymous one', async () => {
    h.state.user = null
    expect((await POST(req('POST', VALID))).status).toBe(401)
    expect((await DELETE(req('DELETE', { id: 'w1' }))).status).toBe(401)
  })
})

// ── Ownership ──────────────────────────────────────────────────────────────────────────────────

describe('F03 — ownership survives the change', () => {
  it('cancellation is scoped to BOTH the id and the caller', async () => {
    await DELETE(req('DELETE', { id: 'w1' }))
    expect(h.state.filters).toContainEqual(['id', 'w1'])
    expect(h.state.filters).toContainEqual(['user_id', 'u1'])
  })

  it("another user's watch id matches no row → 404, never a false success", async () => {
    h.state.updateResult = { data: [], error: null }
    const res = await DELETE(req('DELETE', { id: 'someone-elses-watch' }))
    expect(res.status).toBe(404)
    expect((await res.json()).ok).toBeUndefined()
  })

  it('a created watch takes its owner from the session, never from the body', async () => {
    await POST(req('POST', { ...VALID, user_id: 'victim' }))
    expect(h.state.inserted?.user_id).toBe('u1')
  })
})
