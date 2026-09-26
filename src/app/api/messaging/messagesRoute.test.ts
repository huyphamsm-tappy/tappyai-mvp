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
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'lt', 'maybeSingle', 'single']) {
    builder[m] = () => builder
  }
  builder.insert = (v: unknown) => { state.inserted.push(v); return builder }
  builder.upsert = (v: unknown) => { state.upserted.push(v); return Promise.resolve(state.rows[state.i++] ?? { error: null }) }
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
})

describe('POST read', () => {
  it('refuses a signed-out caller and an anonymous session', async () => {
    h.state.user = null
    expect((await markRead()).status).toBe(401)
    h.state.user = { id: 'anon-1', is_anonymous: true }
    expect((await markRead()).status).toBe(403)
    expect(h.state.upserted).toHaveLength(0)
  })

  it('writes the caller’s own cursor and nobody else’s', async () => {
    h.state.rows = [{ error: null }]
    const res = await markRead()
    expect(res.status).toBe(200)
    const written = h.state.upserted[0] as { thread_id: string; user_id: string; last_read_at: string }
    expect(written.thread_id).toBe('thread-1')
    expect(written.user_id).toBe('u1')
    // 🚨 A cursor, not a counter. Nothing decrements a stored number, so the
    // badge cannot drift out of step with the messages.
    expect(Date.parse(written.last_read_at)).not.toBeNaN()
  })

  it('answers 404 when the caller is not a participant', async () => {
    h.state.rows = [{ error: { code: '42501', message: 'row-level security' } }]
    expect((await markRead()).status).toBe(404)
  })
})
