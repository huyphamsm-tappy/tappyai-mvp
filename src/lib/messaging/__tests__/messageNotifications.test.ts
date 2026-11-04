import { describe, it, expect, vi, beforeEach } from 'vitest'

// The real module imports the service-role client and the push sender; this suite injects fakes, so nothing here touches a database or a network.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the real admin client must not be built in this suite') } }))

import {
  MESSAGE_NOTIFICATION_BODY,
  emitMessageNotification,
  messageNotificationsEnabled,
  messageThreadDeepLink,
  type MessageNotificationDeps,
} from '../messageNotifications'

// ── Phase 6 — MESSENGER → INBOX, COLLAPSED (DR-4, 05/11/2026) ───────────────
//
// The one connection between the two systems, and therefore the one place a private message could cross into a store with a different
// security model. Asserted: the flag really gates it, the notification carries a pointer rather than content, the write is the database
// function (one unread row per recipient and thread), a push goes out only when the database says so, a failure never throws, and the
// deep link is deterministic.

const env = (over: Record<string, string> = {}) => over as unknown as NodeJS.ProcessEnv
const ON = env({ MESSAGE_NOTIFICATIONS_ENABLED: 'true' })

const THREAD = '11111111-1111-1111-1111-111111111111'
const AT = '2026-11-05T01:02:03.456789+00:00'
const input = {
  recipientId: 'user-b',
  senderId: 'user-a',
  senderName: 'Huy',
  senderAvatarUrl: 'https://img.example/a.png',
  threadId: THREAD,
  messageCreatedAt: AT,
}

const PUSH_OK = { attempted: 1, sent: 1, failed: 0, gone: 0 }
function fakes(over: Partial<{ rows: unknown; rpcErrors: number; insertError: { code?: string; message: string } | null; pushThrows: boolean }> = {}) {
  let errorsLeft = over.rpcErrors ?? 0
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => {
    if (errorsLeft > 0) { errorsLeft--; return { data: null, error: { message: 'lock timeout' } } }
    return { data: over.rows ?? [{ notification_id: 'n1', unread_count: 3, should_push: true }], error: null }
  })
  const insertDegraded = vi.fn(async (_row: Record<string, unknown>) => ({ error: over.insertError ?? null }))
  const push = vi.fn(async (_u: string, _p: unknown, _o?: unknown) => { if (over.pushThrows) throw new Error('push provider down'); return PUSH_OK })
  const recordPush = vi.fn(async (_id: string, _p: unknown) => {})
  const deps: MessageNotificationDeps = { rpc, insertDegraded, push: push as never, recordPush }
  return { deps, rpc, insertDegraded, push, recordPush }
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

describe('the flag is fail-safe', () => {
  it('is OFF when unset', () => {
    expect(messageNotificationsEnabled(env())).toBe(false)
  })

  it.each(['false', '1', 'TRUE', 'yes', '', ' true'])(
    'is OFF for %o — only the exact string "true" enables it', (value) => {
      expect(messageNotificationsEnabled(env({ MESSAGE_NOTIFICATIONS_ENABLED: value }))).toBe(false)
    })

  it('is ON only for exactly "true"', () => {
    expect(messageNotificationsEnabled(ON)).toBe(true)
  })

  it('emits NOTHING while off — no database call, no push, no work', async () => {
    const f = fakes()
    const outcome = await emitMessageNotification(input, env(), f.deps)
    expect(outcome).toEqual({ emitted: false, reason: 'flag_off' })
    expect(f.rpc, 'the flag must be checked before any database call').not.toHaveBeenCalled()
    expect(f.push).not.toHaveBeenCalled()
  })

  it('never builds the real admin client while off (the mock above would throw)', async () => {
    expect(await emitMessageNotification(input, env())).toEqual({ emitted: false, reason: 'flag_off' })
  })
})

describe('when the flag is on: the write is the database function', () => {
  it('calls emit_message_notification once, naming the recipient, thread, sender, the stored message time and the fixed body', async () => {
    const f = fakes()
    const outcome = await emitMessageNotification(input, ON, f.deps)
    expect(outcome).toEqual({ emitted: true, notificationId: 'n1' })
    expect(f.rpc).toHaveBeenCalledTimes(1)
    expect(f.rpc).toHaveBeenCalledWith('emit_message_notification', {
      p_user: 'user-b', p_thread: THREAD, p_message_at: AT, p_actor: 'user-a', p_title: 'Huy',
      p_body: MESSAGE_NOTIFICATION_BODY, p_entity_url: messageThreadDeepLink(THREAD), p_image_url: 'https://img.example/a.png',
    })
  })

  it('never notifies the sender about their own message', async () => {
    const f = fakes()
    const outcome = await emitMessageNotification({ ...input, recipientId: input.senderId }, ON, f.deps)
    expect(outcome).toEqual({ emitted: false, reason: 'self_notification' })
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('a missing avatar is passed as null', async () => {
    const f = fakes()
    await emitMessageNotification({ ...input, senderAvatarUrl: undefined }, ON, f.deps)
    expect(f.rpc.mock.calls[0][1].p_image_url).toBeNull()
  })

  it('the function answering with no row (the cursor covers the message, or nothing is unread) emits no push and no row id', async () => {
    const f = fakes({ rows: [] })
    expect(await emitMessageNotification(input, ON, f.deps)).toEqual({ emitted: true, notificationId: null })
    expect(f.push).not.toHaveBeenCalled()
  })
})

describe('push: only when the database says one is due (D3)', () => {
  it('should_push true → ONE push with the service-worker tag, a Web Push Topic/TTL/urgency, ids and a count in data, and the outcome is recorded', async () => {
    const f = fakes()
    await emitMessageNotification(input, ON, f.deps)
    expect(f.push).toHaveBeenCalledTimes(1)
    const [userId, payload, options] = f.push.mock.calls[0] as [string, Record<string, unknown>, { webpush: Record<string, unknown> }]
    expect(userId).toBe('user-b')
    expect(payload).toMatchObject({
      title: 'Huy', body: MESSAGE_NOTIFICATION_BODY, image: 'https://img.example/a.png', tag: `message:${THREAD}`,
      data: { url: messageThreadDeepLink(THREAD), notificationId: 'n1', threadId: THREAD, kind: 'message', count: 3 },
    })
    expect(options.webpush).toMatchObject({ TTL: 86400, urgency: 'normal' })
    expect(typeof options.webpush.topic).toBe('string')
    expect((options.webpush.topic as string).length).toBeLessThanOrEqual(32)
    expect(f.recordPush).toHaveBeenCalledWith('n1', PUSH_OK)
  })

  it('should_push false (still inside the 10-minute window) → no push at all, but the row was updated', async () => {
    const f = fakes({ rows: [{ notification_id: 'n1', unread_count: 5, should_push: false }] })
    expect(await emitMessageNotification(input, ON, f.deps)).toEqual({ emitted: true, notificationId: 'n1' })
    expect(f.push).not.toHaveBeenCalled()
    expect(f.recordPush).not.toHaveBeenCalled()
  })

  it('a push that throws never throws out of the producer', async () => {
    const f = fakes({ pushThrows: true })
    expect(await emitMessageNotification(input, ON, f.deps)).toEqual({ emitted: true, notificationId: 'n1' })
  })
})

describe('failure policy (F3): bounded, never fails the send', () => {
  it('one failure then success → the function is called twice, and nothing degraded happens', async () => {
    const f = fakes({ rpcErrors: 1 })
    expect(await emitMessageNotification(input, ON, f.deps)).toEqual({ emitted: true, notificationId: 'n1' })
    expect(f.rpc).toHaveBeenCalledTimes(2)
    expect(f.insertDegraded).not.toHaveBeenCalled()
  })

  it('two failures → ONE plain insert that keeps the Inbox pointer, flagged skipped, with ids and times only — and NO push', async () => {
    const f = fakes({ rpcErrors: 2 })
    expect(await emitMessageNotification(input, ON, f.deps)).toEqual({ emitted: true, notificationId: null })
    expect(f.rpc).toHaveBeenCalledTimes(2)
    expect(f.insertDegraded).toHaveBeenCalledTimes(1)
    expect(f.insertDegraded.mock.calls[0][0]).toMatchObject({
      user_id: 'user-b', type: 'message', category: 'social', actor_id: 'user-a', push_status: 'skipped', created_at: AT,
      body: MESSAGE_NOTIFICATION_BODY, data: { threadId: THREAD, kind: 'message', count: 1, firstMessageAt: AT, lastMessageAt: AT },
    })
    expect(f.push).not.toHaveBeenCalled()
  })

  it('a duplicate on the unique index during the degraded insert (23505) is expected and silent', async () => {
    const f = fakes({ rpcErrors: 2, insertError: { code: '23505', message: 'duplicate key' } })
    await emitMessageNotification(input, ON, f.deps)
    expect(console.error).not.toHaveBeenCalledWith('[messaging] degraded notification insert failed:', expect.anything())
  })

  it('any other degraded-insert error is logged but does not throw', async () => {
    const f = fakes({ rpcErrors: 2, insertError: { code: '42501', message: 'denied' } })
    await expect(emitMessageNotification(input, ON, f.deps)).resolves.toEqual({ emitted: true, notificationId: null })
    expect(console.error).toHaveBeenCalledWith('[messaging] degraded notification insert failed:', 'denied')
  })
})

describe('the notification carries a pointer, never the message', () => {
  it('the body is the fixed sentence, not any content', async () => {
    const f = fakes()
    await emitMessageNotification(input, ON, f.deps)
    expect(f.rpc.mock.calls[0][1].p_body).toBe(MESSAGE_NOTIFICATION_BODY)
    // `body` is what reaches the device push payload verbatim.
    expect(String(f.rpc.mock.calls[0][1].p_body)).not.toMatch(/\{|\}|\$/)
  })

  it('neither the database call nor the push is free of nothing but ids, names, times, a count and the fixed sentence', async () => {
    const f = fakes()
    await emitMessageNotification(input, ON, f.deps)
    const serialised = JSON.stringify([f.rpc.mock.calls, f.push.mock.calls])
    for (const leak of ['messageBody', 'preview', 'snippet', 'lastMessage"', 'text']) {
      expect(serialised, `"${leak}" must not appear in a message notification`).not.toContain(leak)
    }
  })

  it('there is no input field a body could be passed through', () => {
    // A compile-time guarantee restated at runtime: even a caller trying to attach content has nowhere to put it.
    const keys = Object.keys(input)
    for (const forbidden of ['body', 'messageBody', 'preview', 'text']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

describe('the deep link', () => {
  it('is deterministic', () => {
    expect(messageThreadDeepLink('t1')).toBe(messageThreadDeepLink('t1'))
  })

  it('names the thread and points at the surface that exists today', async () => {
    const link = messageThreadDeepLink('abc-123')
    expect(link).toContain('thread=abc-123')
    // Phase 4 owns navigation; this must not invent a route.
    expect(link.startsWith('/profile/notifications')).toBe(true)
  })

  it('encodes the id rather than interpolating it raw', () => {
    expect(messageThreadDeepLink('a b&c=d')).toBe('/profile/notifications?tab=messages&thread=a%20b%26c%3Dd')
  })

  it('grants nothing — it is a name, not a capability', () => {
    // The link contains no token, signature or grant of any kind. Opening it
    // still goes through /api/messaging, where `chat_is_participant` decides.
    const link = messageThreadDeepLink(THREAD)
    expect(link).not.toMatch(/token|sig|key|auth|jwt/i)
    expect(link.split('?')[1]?.split('&').map(p => p.split('=')[0]).sort())
      .toEqual(['tab', 'thread'])
  })
})
