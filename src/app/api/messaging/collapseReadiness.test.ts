// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * CHARACTERISATION of the real Web routes that the Messenger notification collapse would change (docs/phase8/MESSENGER-COLLAPSE-MIGRATION-REVIEW-PACKAGE.md §3, proposal §7g).
 * These tests pass TODAY and pin current behaviour. They are NOT tests of the collapse (nothing is implemented): when an approved design changes a route, the matching test below is
 * rewritten in the same commit, so the change is deliberate and reviewed.
 *   • D10 — the read route writes `chat_reads.last_read_at` from the LAMBDA clock, with a plain upsert (no GREATEST, no RPC).
 *   • D7  — "mark all read" updates `notifications` only; the chat cursor is never touched.
 *   • The send route forwards NO message timestamp to the notification producer (the collapse needs `created_at` of the stored message).
 */

const h = vi.hoisted(() => {
  const state = { user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null, rows: [] as unknown[], i: 0, calls: [] as Array<{ table?: string; op: string; payload?: unknown; opts?: unknown }>, last: '' }
  const make = () => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'lt', 'maybeSingle', 'single']) b[m] = () => b
    b.from = (table: string) => { state.last = table; state.calls.push({ table, op: 'from' }); return b }
    b.upsert = (payload: unknown, opts: unknown) => { state.calls.push({ table: state.last, op: 'upsert', payload, opts }); return Promise.resolve({ error: null }) }
    b.update = (payload: unknown) => { state.calls.push({ table: state.last, op: 'update', payload }); return b }
    b.insert = (payload: unknown) => { state.calls.push({ table: state.last, op: 'insert', payload }); return b }
    b.rpc = (name: string, args: unknown) => { state.calls.push({ op: 'rpc', payload: { name, args } }); return Promise.resolve({ data: null, error: null }) }
    ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(state.rows[state.i++] ?? { data: null, error: null }).then(res, rej)
    return b
  }
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: make() }))
  const emitNotification = vi.fn(async (_input: unknown) => ({ id: 'n1' }))
  return { state, getRequestUser, emitNotification }
})
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emitNotification }))

import { POST as READ_THREAD } from './threads/[id]/read/route'
import { POST as SEND } from './threads/[id]/messages/route'
import { POST as MARK_ALL } from '../notifications/read/route'

const NOW = new Date('2026-10-10T08:00:00.000Z')
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); h.state.user = { id: 'u1', is_anonymous: false }; h.state.rows = []; h.state.i = 0; h.state.calls = [] })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('D10 · POST /api/messaging/threads/[id]/read (today)', () => {
  it('upserts chat_reads with the LAMBDA clock (new Date()), a plain upsert on (thread_id,user_id) — no GREATEST, no database function', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW)
    const res = await READ_THREAD(new Request('http://localhost/api/messaging/threads/t1/read', { method: 'POST' }) as never, { params: { id: 't1' } } as never)
    expect(res.status).toBe(200)
    const up = h.state.calls.find((c) => c.op === 'upsert')!
    expect(up.table).toBe('chat_reads')
    expect(up.payload).toEqual({ thread_id: 't1', user_id: 'u1', last_read_at: NOW.toISOString() })
    expect(up.opts).toEqual({ onConflict: 'thread_id,user_id' })
    expect(h.state.calls.some((c) => c.op === 'rpc')).toBe(false)
    expect(h.state.calls.some((c) => c.table === 'notifications')).toBe(false)             // marking a thread read does not touch its notification today
  })

  it('an out-of-order second request with an EARLIER lambda time would overwrite a later cursor (no monotonic guard in the route)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T08:00:05.000Z')); await READ_THREAD(new Request('http://x/y', { method: 'POST' }) as never, { params: { id: 't1' } } as never)
    vi.setSystemTime(new Date('2026-10-10T08:00:01.000Z')); await READ_THREAD(new Request('http://x/y', { method: 'POST' }) as never, { params: { id: 't1' } } as never)
    const ups = h.state.calls.filter((c) => c.op === 'upsert').map((c) => (c.payload as { last_read_at: string }).last_read_at)
    expect(ups).toEqual(['2026-10-10T08:00:05.000Z', '2026-10-10T08:00:01.000Z'])           // the second (earlier) value is sent as-is; the database would store it
  })
})

describe('D7 · POST /api/notifications/read (today)', () => {
  it('marks notifications read from the lambda clock and never touches chat_reads or the chat cursor', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW)
    const res = await MARK_ALL(new Request('http://localhost/api/notifications/read', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(200)
    const tables = h.state.calls.filter((c) => c.op === 'from').map((c) => c.table)
    expect(tables).toEqual(['notifications'])
    expect(h.state.calls.find((c) => c.op === 'update')!.payload).toEqual({ read_at: NOW.toISOString() })
    expect(h.state.calls.some((c) => c.op === 'rpc')).toBe(false)
  })
})

describe('the send route forwards no message timestamp to the producer (today)', () => {
  it('flag on: one emit per other participant whose `data` is exactly {threadId, kind} — the stored message\'s created_at is NOT passed', async () => {
    vi.stubEnv('MESSAGE_NOTIFICATIONS_ENABLED', 'true')
    const roster = { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }
    h.state.rows = [
      { data: { id: 'thread-1', kind: 'direct' }, error: null },
      { data: { id: 'm1', thread_id: 'thread-1', sender_id: 'u1', body: 'riêng tư', created_at: '2026-10-10T08:00:00.123456+00:00' }, error: null },
      roster,
      { data: { full_name: 'Huy', avatar_url: null }, error: null },
    ]
    const res = await SEND(new Request('http://localhost/api/messaging/threads/thread-1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'riêng tư' }) }) as never, { params: { id: 'thread-1' } } as never)
    expect(res.status).toBe(200)
    expect(h.emitNotification).toHaveBeenCalledTimes(1)
    const input = h.emitNotification.mock.calls[0][0] as { data: unknown; userId: string; body: string }
    expect(input.userId).toBe('u2')
    expect(input.data).toEqual({ threadId: 'thread-1', kind: 'message' })
    expect(JSON.stringify(input)).not.toContain('riêng tư')
    expect(JSON.stringify(input)).not.toContain('2026-10-10T08:00:00.123456')               // so the collapse needs a route change to pass `created_at`
  })
})
