// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import webpush from 'web-push'
import { MESSAGE_PUSH_TTL_SECONDS, messageNotificationTag, messagePushTopic, messageWebPushOptions } from './messagePushOptions'

// The corrected push design for the Messenger collapse (proposal §7g D3), checked against the REAL web-push library (header generation, no network), plus two CHARACTERISATION
// tests that pin what the shared send path does TODAY (no options; no notification tag in the service worker) so changing it is a deliberate, reviewed act.

const h = vi.hoisted(() => ({ sendNotification: vi.fn(async (..._a: unknown[]) => ({ statusCode: 201 })) }))
const THREAD = 'aaaaaaaa-0000-4000-8000-000000000001'
const keys = webpush.generateVAPIDKeys()
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, 7).toString('base64url') } }
webpush.setVapidDetails('mailto:test@example.com', keys.publicKey, keys.privateKey)
const details = (options?: Record<string, unknown>) => webpush.generateRequestDetails(subscription, JSON.stringify({ title: 't' }), options) as { headers: Record<string, string> }

describe('messagePushTopic · a valid Web Push Topic', () => {
  it('is exactly 32 characters of the URL-safe base64 alphabet, deterministic, and different per thread', () => {
    const t = messagePushTopic(THREAD)
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(messagePushTopic(THREAD)).toBe(t)
    expect(messagePushTopic('aaaaaaaa-0000-4000-8000-000000000002')).not.toBe(t)
  })

  it('the real library accepts it and emits Topic / TTL / Urgency headers', () => {
    const h = details(messageWebPushOptions(THREAD)).headers
    expect(h.Topic).toBe(messagePushTopic(THREAD))
    expect(Number(h.TTL)).toBe(MESSAGE_PUSH_TTL_SECONDS)
    expect(h.Urgency).toBe('normal')
  })

  it('REGRESSION · the first design (`message:<threadId>`, 44 chars with a colon) is REJECTED by the library — the push would have failed, not merely not collapsed', () => {
    expect(() => details({ topic: `message:${THREAD}` })).toThrow(/Safe Base64|32|topic/i)
    expect(() => details({ topic: 'a'.repeat(33) })).toThrow(/Safe Base64|32|topic/i)
  })

  it('the notification tag (service worker, replaces a notification already on screen) is a separate, unrestricted string', () => {
    expect(messageNotificationTag(THREAD)).toBe(`message:${THREAD}`)
  })
})

describe('CHARACTERISATION · today\'s shared send path (changing these is part of the approved design, not an accident)', () => {
  const sendNotification = h.sendNotification
  beforeEach(() => { sendNotification.mockClear(); process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey })
  vi.mock('web-push', async (orig) => {
    const real = (await orig<typeof import('web-push')>()) as unknown as { default: typeof webpush }
    return { default: { ...real.default, sendNotification: (...a: unknown[]) => h.sendNotification(...a) } }
  })
  vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: 's1', provider: 'webpush', subscription_data: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } } }], error: null }) }) }) }),
    }),
  }))

  it('web push is dispatched with NO options (no Topic, TTL or Urgency): the library defaults apply, i.e. a four-week TTL and no replacement of queued pushes', async () => {
    const { sendNotificationToUser } = await import('./send')
    const r = await sendNotificationToUser('u1', { title: 'T', body: 'B', data: { url: '/x' } })
    expect(r).toMatchObject({ attempted: 1, sent: 1, failed: 0 })
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect((sendNotification.mock.calls[0] as unknown[]).length).toBe(2)   // (subscription, payload) — a third `options` argument does not exist today
  })

  it('the service worker takes a `tag` from the push (so a conversation replaces its own notification) and never sets `renotify` (no second buzz)', () => {
    const sw = readFileSync('public/push-sw.js', 'utf8')
    expect(sw).toMatch(/data\.tag\s*\?\s*\{\s*tag:\s*data\.tag\s*\}/)   // only when the push carries one: every other notification is untouched
    expect(sw).not.toMatch(/renotify/)
  })

  it('a push WITH options hands them to the library as the third argument; the tag travels in the payload', async () => {
    const { sendNotificationToUser } = await import('./send')
    await sendNotificationToUser('u1', { title: 'T', body: 'B', tag: `message:${THREAD}`, data: { url: '/x' } }, { webpush: messageWebPushOptions(THREAD) })
    const call = sendNotification.mock.calls[0] as unknown[]
    expect(call.length).toBe(3)
    expect(call[2]).toEqual(messageWebPushOptions(THREAD))
    expect(JSON.parse(String(call[1])).tag).toBe(`message:${THREAD}`)
  })
})
