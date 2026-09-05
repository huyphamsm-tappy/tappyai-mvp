import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `/api/messaging/threads` — the create-and-list contract.
 *
 * 🚨 THE ANONYMOUS REFUSAL IS THE POINT OF HALF THIS FILE. B17: an anonymous
 * session is a real `auth.users` row, so `if (!user) return 401` passes it
 * through, and a UAT probe on one liked, saved, followed, commented and created
 * a group. Private conversations are a strictly worse thing to hand a throwaway
 * identity, so the refusal is asserted at this layer and again in SQL
 * (`supabase/tests/chat_messaging_boundary.test.ts`).
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    rpc: [] as { data: unknown; error: { message: string } | null }[],
    rpcCalls: [] as { fn: string; args: unknown }[],
    rows: [] as unknown[],
    i: 0,
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'lt', 'maybeSingle', 'single', 'insert', 'upsert']) {
    builder[m] = () => builder
  }
  ;(builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.rows[state.i++] ?? { data: [], error: null }).then(res, rej)
  ;(builder as { rpc: unknown }).rpc = (fn: string, args: unknown) => {
    state.rpcCalls.push({ fn, args })
    return Promise.resolve(state.rpc.shift() ?? { data: null, error: null })
  }
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser, builder }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))

import { GET, POST } from './threads/route'

const get = () => GET(new Request('http://localhost/api/messaging/threads') as never)
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/messaging/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never)

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.rpc = []
  h.state.rpcCalls = []
  h.state.rows = []
  h.state.i = 0
})

describe('GET /api/messaging/threads', () => {
  it('refuses a signed-out caller', async () => {
    h.state.user = null
    const res = await get()
    expect(res.status).toBe(401)
  })

  it('reads the list through the RPC and returns assembled threads', async () => {
    h.state.rpc = [{
      data: [{
        thread_id: 't1', kind: 'direct', title: null,
        last_message_at: '2026-09-05T10:20:00Z',
        last_body: 'chào', last_sender_id: 'u2', last_created_at: '2026-09-05T10:20:00Z',
        unread_count: 2,
      }],
      error: null,
    }]
    h.state.rows = [
      { data: [{ thread_id: 't1', user_id: 'u1' }, { thread_id: 't1', user_id: 'u2' }], error: null },
      { data: [{ id: 'u2', full_name: 'Mai Anh', avatar_url: null }], error: null },
    ]
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(h.state.rpcCalls[0].fn).toBe('chat_thread_summaries')
    expect(body.threads[0]).toMatchObject({ id: 't1', unreadCount: 2 })
  })

  it('returns an empty list rather than an error for a user with no conversations', async () => {
    h.state.rpc = [{ data: [], error: null }]
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).threads).toEqual([])
  })
})

describe('POST /api/messaging/threads — starting a conversation', () => {
  it('refuses an anonymous session (B17)', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    const res = await post({ kind: 'direct', userId: 'u2' })
    expect(res.status).toBe(403)
    expect(h.state.rpcCalls, 'nothing may reach the database').toHaveLength(0)
  })

  it('refuses a signed-out caller', async () => {
    h.state.user = null
    const res = await post({ kind: 'direct', userId: 'u2' })
    expect(res.status).toBe(401)
  })

  it('delegates 1-1 creation to chat_start_direct rather than checking then inserting', async () => {
    // 🔑 The route never queries for an existing thread first. Dedupe is the
    // unique partial index on `direct_key`; a check-then-insert here would lose
    // exactly the race it looks like it is preventing.
    h.state.rpc = [{ data: 'thread-1', error: null }]
    const res = await post({ kind: 'direct', userId: 'u2' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ threadId: 'thread-1' })
    expect(h.state.rpcCalls[0]).toEqual({ fn: 'chat_start_direct', args: { p_target: 'u2' } })
  })

  it('creates a group through chat_create_group', async () => {
    h.state.rpc = [{ data: 'thread-2', error: null }]
    const res = await post({ kind: 'group', userIds: ['u2', 'u3'], title: 'Nhóm Đà Lạt' })
    expect(res.status).toBe(200)
    expect(h.state.rpcCalls[0]).toEqual({
      fn: 'chat_create_group',
      args: { p_title: 'Nhóm Đà Lạt', p_members: ['u2', 'u3'] },
    })
  })

  it('rejects a kind it does not know, a missing target and an empty group', async () => {
    for (const body of [{}, { kind: 'broadcast' }, { kind: 'direct' }, { kind: 'group', userIds: [] }]) {
      const res = await post(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(h.state.rpcCalls).toHaveLength(0)
  })

  it('maps the SQL guard rails onto honest status codes', async () => {
    // The functions raise named conditions precisely so this does not have to
    // guess: a caller's mistake is a 4xx, and only our own failure is a 500.
    h.state.rpc = [{ data: null, error: { message: 'invalid_target' } }]
    expect((await post({ kind: 'direct', userId: 'u2' })).status).toBe(400)

    h.state.rpc = [{ data: null, error: { message: 'anonymous_not_allowed' } }]
    expect((await post({ kind: 'direct', userId: 'u2' })).status).toBe(403)

    h.state.rpc = [{ data: null, error: { message: 'connection reset by peer' } }]
    expect((await post({ kind: 'direct', userId: 'u2' })).status).toBe(500)
  })
})
