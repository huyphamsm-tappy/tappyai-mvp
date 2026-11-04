import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `/api/messaging/threads/[id]/messages` and `.../read`.
 *
 * 🚨 THE 404-NOT-403 RULE IS TESTED HERE BECAUSE IT IS EASY TO "FIX" INTO A BUG.
 * A non-participant asking about a thread is told "not found", never
 * "forbidden": 403 confirms the thread EXISTS, which turns the endpoint into an
 * oracle for whether two given people are talking. RLS refuses the row either
 * way — this is only about what the refusal reveals.
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    rows: [] as unknown[],
    i: 0,
    inserted: [] as unknown[],
    upserted: [] as unknown[],
    /** Every filter/order call on the history query, in order: `order:created_at:desc`, `lt:created_at:<v>`, `or:<expr>`. */
    calls: [] as string[],
    rpcs: [] as Array<{ name: string; args: unknown }>,
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'in', 'limit', 'maybeSingle', 'single']) {
    builder[m] = () => builder
  }
  builder.order = (col: string, o?: { ascending?: boolean }) => { state.calls.push(`order:${col}:${o?.ascending === false ? 'desc' : 'asc'}`); return builder }
  builder.lt = (col: string, v: unknown) => { state.calls.push(`lt:${col}:${String(v)}`); return builder }
  builder.or = (expr: string) => { state.calls.push(`or:${expr}`); return builder }
  builder.insert = (v: unknown) => { state.inserted.push(v); return builder }
  builder.upsert = (v: unknown) => { state.upserted.push(v); return Promise.resolve(state.rows[state.i++] ?? { error: null }) }
  builder.rpc = (name: string, args: unknown) => { state.rpcs.push({ name, args }); return Promise.resolve(state.rows[state.i++] ?? { data: null, error: null }) }
  ;(builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.rows[state.i++] ?? { data: null, error: null }).then(res, rej)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))

import { GET, POST } from './threads/[id]/messages/route'
import { POST as MARK_READ } from './threads/[id]/read/route'

const params = { params: { id: 'thread-1' } }
const url = 'http://localhost/api/messaging/threads/thread-1/messages'
const get = () => GET(new Request(url) as never, params as never)
const send = (body: unknown) =>
  POST(new Request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never, params as never)
const markRead = () =>
  MARK_READ(new Request('http://localhost/api/messaging/threads/thread-1/read', { method: 'POST' }) as never, params as never)

/** The thread lookup every handler does first. */
const THREAD_FOUND = { data: { id: 'thread-1', kind: 'direct' }, error: null }
const THREAD_HIDDEN = { data: null, error: null }

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.rows = []
  h.state.i = 0
  h.state.inserted = []
  h.state.upserted = []
  h.state.calls = []
  h.state.rpcs = []
})

describe('GET messages · paging cursor (ties on created_at)', () => {
  const getWith = (qs: string) => GET(new Request(`${url}?${qs}`) as never, params as never)
  const T = '2026-09-05T10:20:00.000Z'

  it('orders by created_at then id, both newest-first, so rows with the same timestamp have one stable order', async () => {
    h.state.rows = [THREAD_FOUND, { data: [], error: null }]
    await get()
    expect(h.state.calls).toEqual(['order:created_at:desc', 'order:id:desc'])
  })

  it('with before + beforeId the next page starts after that exact row: older timestamp OR same timestamp with a smaller id', async () => {
    h.state.rows = [THREAD_FOUND, { data: [], error: null }]
    await getWith(`before=${encodeURIComponent(T)}&beforeId=11111111-1111-4111-8111-111111111111`)
    expect(h.state.calls).toContain(`or:created_at.lt.${T},and(created_at.eq.${T},id.lt.11111111-1111-4111-8111-111111111111)`)
    expect(h.state.calls.some(c => c.startsWith('lt:'))).toBe(false)
  })

  it('keeps the old cursor (before only) working for clients that do not send beforeId yet', async () => {
    h.state.rows = [THREAD_FOUND, { data: [], error: null }]
    await getWith(`before=${encodeURIComponent(T)}`)
    expect(h.state.calls).toContain(`lt:created_at:${T}`)
    expect(h.state.calls.some(c => c.startsWith('or:'))).toBe(false)
  })

  it('ignores a beforeId that is not a uuid (it would be pasted into a filter expression) and falls back to the old cursor', async () => {
    h.state.rows = [THREAD_FOUND, { data: [], error: null }]
    await getWith(`before=${encodeURIComponent(T)}&beforeId=${encodeURIComponent('x),or(id.gt.0')}`)
    expect(h.state.calls.some(c => c.startsWith('or:'))).toBe(false)
    expect(h.state.calls).toContain(`lt:created_at:${T}`)
  })

  it('never builds the expression from a before that is not an ISO timestamp', async () => {
    h.state.rows = [THREAD_FOUND, { data: [], error: null }]
    await getWith(`before=${encodeURIComponent('2026-09-05),or(id.gt.0')}&beforeId=11111111-1111-4111-8111-111111111111`)
    expect(h.state.calls.some(c => c.startsWith('or:'))).toBe(false)
  })
})

describe('GET messages', () => {
  it('refuses a signed-out caller', async () => {
    h.state.user = null
    expect((await get()).status).toBe(401)
  })

  it('answers 404 — not 403 — for a thread the caller is not in', async () => {
    h.state.rows = [THREAD_HIDDEN]
    const res = await get()
    expect(res.status).toBe(404)
  })

  it('returns history oldest-first for display', async () => {
    // The query is newest-first with a cursor (an infinite history must page
    // from the bottom); the handler reverses it so the view can append.
    h.state.rows = [
      THREAD_FOUND,
      { data: [
        { id: 'm2', thread_id: 'thread-1', sender_id: 'u2', body: 'hai', created_at: '2026-09-05T10:21:00Z' },
        { id: 'm1', thread_id: 'thread-1', sender_id: 'u1', body: 'một', created_at: '2026-09-05T10:20:00Z' },
      ], error: null },
    ]
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages.map((m: { body: string }) => m.body)).toEqual(['một', 'hai'])
    expect(body.hasMore).toBe(false)
  })
})

describe('POST a message', () => {
  it('refuses an anonymous session before touching the database', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    const res = await send({ body: 'xin chào' })
    expect(res.status).toBe(403)
    expect(h.state.inserted).toHaveLength(0)
  })

  it('takes the sender from the session, never from the request body', async () => {
    // 🔑 A forged `senderId` in the payload is ignored here, and the INSERT
    // policy asserts `sender_id = auth.uid()` a second time in the database.
    h.state.rows = [
      THREAD_FOUND,
      { data: { id: 'm1', thread_id: 'thread-1', sender_id: 'u1', body: 'xin chào', created_at: 'now' }, error: null },
    ]
    const res = await send({ body: 'xin chào', senderId: 'someone-else' })
    expect(res.status).toBe(200)
    expect(h.state.inserted[0]).toEqual({ thread_id: 'thread-1', sender_id: 'u1', body: 'xin chào' })
  })

  it('rejects an empty body, a whitespace-only body and an oversized one', async () => {
    for (const body of [{}, { body: '' }, { body: '   ' }, { body: 'x'.repeat(4001) }]) {
      h.state.rows = [THREAD_FOUND]
      h.state.i = 0
      const res = await send(body)
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400)
    }
    expect(h.state.inserted).toHaveLength(0)
  })

  it('turns an RLS refusal into 404, keeping the thread’s existence private', async () => {
    h.state.rows = [THREAD_FOUND, { data: null, error: { code: '42501', message: 'row-level security' } }]
    expect((await send({ body: 'hi' })).status).toBe(404)
  })

  describe('clientId — a retry after a timeout must not store the message twice', () => {
    const CID = '22222222-2222-4222-8222-222222222222'
    const ROW = { id: 'm1', thread_id: 'thread-1', sender_id: 'u1', body: 'xin chào', created_at: '2026-11-05T01:00:00.000Z' }

    it('stores the client id with the message', async () => {
      h.state.rows = [THREAD_FOUND, { data: ROW, error: null }]
      expect((await send({ body: 'xin chào', clientId: CID })).status).toBe(200)
      expect(h.state.inserted[0]).toEqual({ thread_id: 'thread-1', sender_id: 'u1', body: 'xin chào', client_id: CID })
    })

    it('refuses a clientId that is not a uuid, before the database is touched', async () => {
      for (const clientId of ['x', 123, '22222222-2222-4222-8222-22222222222', '', {}]) {
        h.state.rows = [THREAD_FOUND]
        h.state.i = 0
        const res = await send({ body: 'hi', clientId })
        expect(res.status, JSON.stringify(clientId)).toBe(400)
      }
      expect(h.state.inserted).toHaveLength(0)
    })

    it('a repeat of a send the database already holds (unique violation) answers 200 with the EXISTING row and stores nothing new', async () => {
      h.state.rows = [THREAD_FOUND, { data: null, error: { code: '23505', message: 'duplicate key' } }, { data: ROW, error: null }]
      const res = await send({ body: 'xin chào', clientId: CID })
      expect(res.status).toBe(200)
      expect((await res.json()).message).toMatchObject({ id: 'm1', body: 'xin chào', senderId: 'u1' })
      expect(h.state.inserted).toHaveLength(1) // the one attempt; no second insert
    })

    it('a unique violation WITHOUT a clientId is a plain server error (nothing is hidden)', async () => {
      h.state.rows = [THREAD_FOUND, { data: null, error: { code: '23505', message: 'duplicate key' } }]
      expect((await send({ body: 'hi' })).status).toBe(500)
    })

    it('a unique violation whose original row cannot be found is a server error, not a made-up success', async () => {
      h.state.rows = [THREAD_FOUND, { data: null, error: { code: '23505', message: 'duplicate key' } }, { data: null, error: null }]
      expect((await send({ body: 'hi', clientId: CID })).status).toBe(500)
    })
  })
})

describe('POST read', () => {
  it('refuses a signed-out caller and an anonymous session', async () => {
    h.state.user = null
    expect((await markRead()).status).toBe(401)
    h.state.user = { id: 'anon-1', is_anonymous: true }
    expect((await markRead()).status).toBe(403)
    expect(h.state.rpcs).toHaveLength(0)
  })

  it('moves the cursor through the database function `mark_thread_read`, naming only the thread (the caller is auth.uid() in the function, the clock is the database’s)', async () => {
    // 🚨 A cursor, not a counter, and (D10) not a client-supplied time: the route sends no timestamp and no user id.
    h.state.rows = [{ error: null }]
    const res = await markRead()
    expect(res.status).toBe(200)
    expect(h.state.rpcs).toEqual([{ name: 'mark_thread_read', args: { p_thread: 'thread-1' } }])
    expect(h.state.upserted).toHaveLength(0) // no direct write to chat_reads any more
  })

  it('answers 404 when the caller is not a participant (the function raises 42501)', async () => {
    h.state.rows = [{ error: { code: '42501', message: 'not a participant' } }]
    expect((await markRead()).status).toBe(404)
  })

  it('answers 500 for any other database error', async () => {
    h.state.rows = [{ error: { code: '55P03', message: 'lock timeout' } }]
    expect((await markRead()).status).toBe(500)
  })
})
