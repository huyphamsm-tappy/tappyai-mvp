import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * POST /api/messaging/threads/[id]/messages → the Inbox notification, at the ROUTE (the unit tests cover the producer in isolation).
 *
 * Traced 2026-10-10: one message → one `emitNotification` per OTHER participant, never for the sender; nothing at all while
 * `MESSAGE_NOTIFICATIONS_ENABLED` is not exactly 'true'; nothing when the INSERT was refused (RLS / block); a failing notification never fails the
 * send; the payload never carries the message text. There is NO collapse of a burst of messages in one thread (each is a distinct event) and NO
 * idempotency key on the send — both are product decisions recorded in docs/phase8/WEB-ONLY-CHECKPOINT0.md, not behaviour pinned here.
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    rows: [] as unknown[],
    i: 0,
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'lt', 'maybeSingle', 'single', 'insert']) builder[m] = () => builder
  ;(builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.rows[state.i++] ?? { data: null, error: null }).then(res, rej)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  const emitNotification = vi.fn(async (_input: unknown) => ({ id: 'n1' }))
  return { state, getRequestUser, emitNotification }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emitNotification }))

import { POST } from './threads/[id]/messages/route'

const params = { params: { id: 'thread-1' } }
const send = (body: unknown = { body: 'nội dung riêng tư' }) =>
  POST(new Request('http://localhost/api/messaging/threads/thread-1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never, params as never)

const THREAD_FOUND = { data: { id: 'thread-1', kind: 'direct' }, error: null }
const STORED = { data: { id: 'm1', thread_id: 'thread-1', sender_id: 'u1', body: 'nội dung riêng tư', created_at: 'now' }, error: null }
const roster = (...ids: string[]) => ({ data: ids.map(user_id => ({ user_id })), error: null })
const ME = { data: { full_name: 'Huy Phạm', avatar_url: 'https://x/a.png' }, error: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.rows = []
  h.state.i = 0
})
afterEach(() => { vi.unstubAllEnvs() })

describe('the flag: only the exact string "true" turns message notifications on', () => {
  it('unset → no notification and the roster is never read (the send itself still works)', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    const res = await send()
    expect(res.status).toBe(200)
    expect(h.emitNotification).not.toHaveBeenCalled()
    expect(h.state.i).toBe(2) // thread lookup + insert only: no roster, no profile read
  })

  it.each(['', '1', 'TRUE', 'True', 'yes', 'on', ' true'])('MESSAGE_NOTIFICATIONS_ENABLED=%j → still OFF', async (v) => {
    vi.stubEnv('MESSAGE_NOTIFICATIONS_ENABLED', v)
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    expect((await send()).status).toBe(200)
    expect(h.emitNotification).not.toHaveBeenCalled()
  })
})

describe('flag ON (test environment only)', () => {
  beforeEach(() => { vi.stubEnv('MESSAGE_NOTIFICATIONS_ENABLED', 'true') })

  it('direct thread: exactly ONE notification, to the other participant, never to the sender', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    expect((await send()).status).toBe(200)
    expect(h.emitNotification).toHaveBeenCalledTimes(1)
    expect(h.emitNotification.mock.calls[0][0]).toMatchObject({
      userId: 'u2', type: 'message', category: 'social', title: 'Huy Phạm', actorId: 'u1',
      entityUrl: '/profile/notifications?tab=messages&thread=thread-1', data: { threadId: 'thread-1', kind: 'message' },
    })
  })

  it('group thread: each OTHER participant is notified exactly once (distinct recipients)', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2', 'u3', 'u4'), ME]
    expect((await send()).status).toBe(200)
    const to = h.emitNotification.mock.calls.map(c => (c[0] as { userId: string }).userId).sort()
    expect(to).toEqual(['u2', 'u3', 'u4'])
    expect(new Set(to).size).toBe(to.length)
  })

  it('the message text never reaches the notification (title, body, data, url)', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    await send({ body: 'nội dung riêng tư' })
    expect(JSON.stringify(h.emitNotification.mock.calls)).not.toContain('nội dung riêng tư')
  })

  it('a missing profile name falls back to a fixed brand name, not to anything from the message', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), { data: null, error: null }]
    await send()
    expect((h.emitNotification.mock.calls[0][0] as { title: string }).title).toBe('TappyAI')
  })

  it('INSERT refused (RLS, or a block between participants → 42501): 404, and NO notification and no roster read', async () => {
    h.state.rows = [THREAD_FOUND, { data: null, error: { code: '42501', message: 'row-level security' } }, roster('u1', 'u2'), ME]
    expect((await send()).status).toBe(404)
    expect(h.emitNotification).not.toHaveBeenCalled()
    expect(h.state.i).toBe(2)
  })

  it('an empty roster (a forged thread id yields nothing under RLS) notifies nobody', async () => {
    h.state.rows = [THREAD_FOUND, STORED, roster(), ME]
    expect((await send()).status).toBe(200)
    expect(h.emitNotification).not.toHaveBeenCalled()
  })

  it('a failing notification never fails the send: the stored message is still returned', async () => {
    h.emitNotification.mockRejectedValueOnce(new Error('push provider down'))
    h.state.rows = [THREAD_FOUND, STORED, roster('u1', 'u2'), ME]
    const res = await send()
    expect(res.status).toBe(200)
    expect((await res.json()).message).toMatchObject({ id: 'm1', body: 'nội dung riêng tư' })
  })

  it('a failing roster read never fails the send either', async () => {
    h.state.rows = [THREAD_FOUND, STORED, { data: null, error: { message: 'boom' } }, ME]
    expect((await send()).status).toBe(200)
    expect(h.emitNotification).not.toHaveBeenCalled()
  })
})
