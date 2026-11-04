import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * POST /api/messaging/threads/[id]/messages → the Inbox notification, at the ROUTE (the unit tests cover the producer in isolation).
 *
 * DR-4 (05/11/2026): the write is the database function `emit_message_notification` (service role), once per OTHER participant, never for the sender;
 * nothing at all while `MESSAGE_NOTIFICATIONS_ENABLED` is not exactly 'true'; nothing when the INSERT was refused (RLS / block); nothing when the
 * send was a repeat of one already stored (clientId); a failing notification never fails the send; neither the database call nor the push carries the
 * message text. A burst of messages in one thread is ONE row with a count — that rule lives in the SQL (supabase/tests/notification_collapse_draft.test.ts).
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    rows: [] as unknown[],
    i: 0,
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'lt', 'or', 'maybeSingle', 'single', 'insert']) builder[m] = () => builder
  ;(builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.rows[state.i++] ?? { data: null, error: null }).then(res, rej)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  // the service-role client the producer builds, and the push sender it calls
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: [{ notification_id: 'n1', unread_count: 1, should_push: true }], error: null as { message: string } | null }))
  const adminFrom = vi.fn(() => ({ update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) }))
  const sendNotificationToUser = vi.fn(async (_u: string, _p: unknown, _o?: unknown) => ({ attempted: 1, sent: 1, failed: 0, gone: 0 }))
  return { state, getRequestUser, rpc, adminFrom, sendNotificationToUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: h.rpc, from: h.adminFrom }) }))
vi.mock('@/lib/notifications/send', () => ({ sendNotificationToUser: h.sendNotificationToUser }))

import { POST } from './threads/[id]/messages/route'

const params = { params: { id: 'thread-1' } }
const send = (body: unknown = { body: 'nội dung riêng tư' }) =>
  POST(new Request('http://localhost/api/messaging/threads/thread-1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never, params as never)

const CREATED = '2026-11-05T01:00:00.123456+00:00'
const THREAD_FOUND = { data: { id: 'thread-1', kind: 'direct' }, error: null }
const STORED = { data: { id: 'm1', thread_id: 'thread-1', sender_id: 'u1', body: 'nội dung riêng tư', created_at: CREATED }, error: null }
const roster = (...ids: string[]) => ({ data: ids.map(user_id => ({ user_id })), error: null })
const ME = { data: { full_name: 'Huy Phạm', avatar_url: 'https://x/a.png' }, error: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.rows = []
  h.state.i = 0
  h.rpc.mockImplementation(async () => ({ data: [{ notification_id: 'n1', unread_count: 1, should_push: true }], error: null }))
})
afterEach(() => { vi.unstubAllEnvs() })

describe('the flag: only the exact string "true" turns message notifications on', () => {
  it('unset → no notification and the roster is never read (the send itself still works)', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    const res = await send()
    expect(res.status).toBe(200)
    expect(h.rpc).not.toHaveBeenCalled()
    expect(h.state.i).toBe(2) // thread lookup + insert only: no roster, no profile read
  })

  it.each(['', '1', 'TRUE', 'True', 'yes', 'on', ' true'])('MESSAGE_NOTIFICATIONS_ENABLED=%j → still OFF', async (v) => {
    vi.stubEnv('MESSAGE_NOTIFICATIONS_ENABLED', v)
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    expect((await send()).status).toBe(200)
    expect(h.rpc).not.toHaveBeenCalled()
  })
})

describe('flag ON (test environment only)', () => {
  beforeEach(() => { vi.stubEnv('MESSAGE_NOTIFICATIONS_ENABLED', 'true') })

  it('direct thread: exactly ONE emit, to the other participant, never to the sender, stamped with the STORED message time', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    expect((await send()).status).toBe(200)
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('emit_message_notification', expect.objectContaining({
      p_user: 'u2', p_thread: 'thread-1', p_actor: 'u1', p_title: 'Huy Phạm', p_message_at: CREATED,
      p_entity_url: '/profile/notifications?tab=messages&thread=thread-1',
    }))
  })

  it('group thread: each OTHER participant is emitted for exactly once (distinct recipients)', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2', 'u3', 'u4'), ME]
    expect((await send()).status).toBe(200)
    const to = h.rpc.mock.calls.map(c => c[1].p_user as string).sort()
    expect(to).toEqual(['u2', 'u3', 'u4'])
    expect(new Set(to).size).toBe(to.length)
  })

  it('when the database says a push is due, one push goes to that recipient; when it says not, none does', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    await send()
    expect(h.sendNotificationToUser).toHaveBeenCalledTimes(1)
    expect(h.sendNotificationToUser.mock.calls[0][0]).toBe('u2')

    h.sendNotificationToUser.mockClear()
    h.rpc.mockImplementation(async () => ({ data: [{ notification_id: 'n1', unread_count: 7, should_push: false }], error: null }))
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    h.state.i = 0
    await send()
    expect(h.sendNotificationToUser).not.toHaveBeenCalled()
  })

  it('the message text never reaches the database call or the push (title, body, data, url)', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    await send({ body: 'nội dung riêng tư' })
    expect(JSON.stringify([h.rpc.mock.calls, h.sendNotificationToUser.mock.calls])).not.toContain('nội dung riêng tư')
  })

  it('a missing profile name falls back to a fixed brand name, not to anything from the message', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), { data: null, error: null }]
    await send()
    expect(h.rpc.mock.calls[0][1].p_title).toBe('TappyAI')
  })

  it('INSERT refused (RLS, or a block between participants → 42501): 404, and NO emit and no roster read', async () => {
    h.state.rows = [THREAD_FOUND, { data: null, error: { code: '42501', message: 'row-level security' } }, roster('u1', 'u2'), ME]
    expect((await send()).status).toBe(404)
    expect(h.rpc).not.toHaveBeenCalled()
    expect(h.state.i).toBe(2)
  })

  it('a REPEAT of a send that is already stored (clientId, unique violation) answers 200 with that row and emits nothing again', async () => {
    const CID = '22222222-2222-4222-8222-222222222222'
    h.state.rows = [THREAD_FOUND, { data: null, error: { code: '23505', message: 'duplicate key' } }, STORED, roster('u1', 'u2'), ME]
    const res = await send({ body: 'nội dung riêng tư', clientId: CID })
    expect(res.status).toBe(200)
    expect((await res.json()).message).toMatchObject({ id: 'm1' })
    expect(h.rpc).not.toHaveBeenCalled()
    expect(h.sendNotificationToUser).not.toHaveBeenCalled()
  })

  it('an empty roster (a forged thread id yields nothing under RLS) notifies nobody', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster(), ME]
    expect((await send()).status).toBe(200)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('a failing notification never fails the send: the stored message is still returned', async () => {
    h.rpc.mockRejectedValue(new Error('database unreachable'))
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    const res = await send()
    expect(res.status).toBe(200)
    expect((await res.json()).message).toMatchObject({ id: 'm1', body: 'nội dung riêng tư' })
  })

  it('a failing roster read never fails the send either', async () => {
    h.state.rows = [THREAD_FOUND, STORED, { data: null, error: { message: 'boom' } }, ME]
    expect((await send()).status).toBe(200)
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
