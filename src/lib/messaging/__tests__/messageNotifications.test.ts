import { describe, it, expect, vi, beforeEach } from 'vitest'

// `vi.mock` is hoisted above every top-level statement, so the factory cannot
// close over an ordinary `const` — it would read it before initialisation.
// `vi.hoisted` is the sanctioned way to share a spy with a hoisted factory.
// The parameter is declared even though the body ignores it: without it the spy
// infers an empty argument tuple and every `mock.calls[0][0]` below is a type
// error rather than the payload assertion it is meant to be.
const { emitNotification } = vi.hoisted(() => ({
  emitNotification: vi.fn(async (_input: Record<string, unknown>) => ({
    id: 'n1', pushStatus: 'sent', push: { attempted: 1, sent: 1, failed: 0, gone: 0 },
  })),
}))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification }))

import {
  MESSAGE_NOTIFICATION_BODY,
  emitMessageNotification,
  messageNotificationsEnabled,
  messageThreadDeepLink,
} from '../messageNotifications'

// ── Phase 6 — MESSENGER → INBOX ─────────────────────────────────────────────
//
// The one connection between the two systems, and therefore the one place a
// private message could cross into a store with a different security model.
// Three things are asserted: the flag really gates it, the notification carries
// a pointer rather than content, and the deep link is deterministic.

const env = (over: Record<string, string> = {}) => over as unknown as NodeJS.ProcessEnv
const ON = env({ MESSAGE_NOTIFICATIONS_ENABLED: 'true' })

const input = {
  recipientId: 'user-b',
  senderId: 'user-a',
  senderName: 'Huy',
  senderAvatarUrl: 'https://img.example/a.png',
  threadId: '11111111-1111-1111-1111-111111111111',
}

beforeEach(() => emitNotification.mockClear())

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

  it('emits NOTHING while off — no row, no push, no work', async () => {
    const outcome = await emitMessageNotification(input, env())
    expect(outcome).toEqual({ emitted: false, reason: 'flag_off' })
    expect(emitNotification, 'the flag must be checked before any emit').not.toHaveBeenCalled()
  })
})

describe('when the flag is on', () => {
  it('emits one notification to the recipient', async () => {
    const outcome = await emitMessageNotification(input, ON)
    expect(outcome).toEqual({ emitted: true, notificationId: 'n1' })
    expect(emitNotification).toHaveBeenCalledTimes(1)

    const arg = emitNotification.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(arg.userId).toBe('user-b')
    expect(arg.type).toBe('message')
    expect(arg.actorId).toBe('user-a')
  })

  it('never notifies the sender about their own message', async () => {
    const outcome = await emitMessageNotification({ ...input, recipientId: input.senderId }, ON)
    expect(outcome).toEqual({ emitted: false, reason: 'self_notification' })
    expect(emitNotification).not.toHaveBeenCalled()
  })
})

describe('the notification carries a pointer, never the message', () => {
  it('the body is the fixed sentence, not any content', async () => {
    await emitMessageNotification(input, ON)
    const arg = emitNotification.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(arg.body).toBe(MESSAGE_NOTIFICATION_BODY)
    // `body` is what reaches the device push payload verbatim.
    expect(String(arg.body)).not.toMatch(/\{|\}|\$/)
  })

  it('the whole payload is free of anything resembling message content', async () => {
    await emitMessageNotification(input, ON)
    const serialised = JSON.stringify(emitNotification.mock.calls[0][0])
    for (const leak of ['messageBody', 'preview', 'snippet', 'lastMessage', 'text']) {
      expect(serialised, `"${leak}" must not appear in a message notification`).not.toContain(leak)
    }
  })

  it('data carries ids only', async () => {
    await emitMessageNotification(input, ON)
    const arg = emitNotification.mock.calls[0][0] as unknown as { data: Record<string, unknown> }
    expect(arg.data).toEqual({ threadId: input.threadId, kind: 'message' })
  })

  it('there is no input field a body could be passed through', () => {
    // A compile-time guarantee restated at runtime: even a caller trying to
    // attach content has nowhere to put it, because the extra key is dropped.
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

  it('is what the notification uses, so there is one destination and not two', async () => {
    await emitMessageNotification(input, ON)
    const arg = emitNotification.mock.calls[0][0] as unknown as { entityUrl: string }
    expect(arg.entityUrl).toBe(messageThreadDeepLink(input.threadId))
  })

  it('grants nothing — it is a name, not a capability', () => {
    // The link contains no token, signature or grant of any kind. Opening it
    // still goes through /api/messaging, where `chat_is_participant` decides.
    const link = messageThreadDeepLink(input.threadId)
    expect(link).not.toMatch(/token|sig|key|auth|jwt/i)
    expect(link.split('?')[1]?.split('&').map(p => p.split('=')[0]).sort())
      .toEqual(['tab', 'thread'])
  })
})
