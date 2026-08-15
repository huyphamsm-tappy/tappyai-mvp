import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Provider SELECTION — the wiring between a stored subscription and the transport that can reach it.
 *
 * The unit tests in fcm.test.ts prove the FCM message is built correctly; these prove the FCM path
 * is the one chosen for an FCM row, that web push is untouched by its arrival, and that a
 * deployment with no FCM identity degrades to skipping Android rather than failing the send.
 */
const h = vi.hoisted(() => {
  const state = {
    subs: [] as Array<{ id: string; provider: string; subscription_data: Record<string, unknown> }>,
    disabled: [] as string[],
    fcmSend: null as null | ((token: string, payload: unknown) => Promise<void>),
    fcmCalls: [] as Array<{ token: string }>,
  }
  const builder: any = {
    from: () => builder,
    select: () => builder,
    update: () => builder,
    eq: () => builder,
    in: (_col: string, ids: string[]) => {
      state.disabled.push(...ids)
      return Promise.resolve({ error: null })
    },
  }
  builder.then = (res: any, rej: any) =>
    Promise.resolve({ data: state.subs, error: null }).then(res, rej)
  return { state, builder }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.builder }))
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => undefined) },
}))
vi.mock('./fcm', () => ({
  createFcmSender: () =>
    h.state.fcmSend &&
    ((token: string, payload: unknown) => {
      h.state.fcmCalls.push({ token })
      return h.state.fcmSend!(token, payload)
    }),
}))

import { sendNotificationToUser } from './send'

const payload = { title: 'T', body: 'B', data: { kind: 'tappy_identity' as const } }

beforeEach(() => {
  vi.clearAllMocks()
  h.state.subs = []
  h.state.disabled = []
  h.state.fcmCalls = []
  h.state.fcmSend = async () => undefined
})

describe('provider dispatch', () => {
  it('sends an FCM subscription through the FCM sender', async () => {
    h.state.subs = [{ id: 's1', provider: 'fcm', subscription_data: { token: 'tok-abc' } }]
    const result = await sendNotificationToUser('u1', payload)
    expect(h.state.fcmCalls).toEqual([{ token: 'tok-abc' }])
    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0 })
  })

  it('reaches every transport a user has registered', async () => {
    h.state.subs = [
      { id: 's1', provider: 'webpush', subscription_data: { endpoint: 'https://p/1', keys: {} } },
      { id: 's2', provider: 'fcm', subscription_data: { token: 'tok-abc' } },
    ]
    const result = await sendNotificationToUser('u1', payload)
    expect(result.attempted).toBe(2)
    expect(result.sent).toBe(2)
    expect(h.state.fcmCalls).toHaveLength(1)
  })

  it('a dead Android token is disabled, not retried forever', async () => {
    // Reuses the pruning the web push path already had: statusCode 404/410 → disable the row.
    h.state.subs = [{ id: 's1', provider: 'fcm', subscription_data: { token: 'tok-dead' } }]
    h.state.fcmSend = async () => {
      throw Object.assign(new Error('gone'), { statusCode: 404 })
    }
    const result = await sendNotificationToUser('u1', payload)
    expect(h.state.disabled).toEqual(['s1'])
    expect(result).toMatchObject({ gone: 1, failed: 0 })
  })

  it('a transient provider failure is counted as retry-worthy, not pruned', async () => {
    h.state.subs = [{ id: 's1', provider: 'fcm', subscription_data: { token: 'tok' } }]
    h.state.fcmSend = async () => {
      throw Object.assign(new Error('upstream unavailable'), { statusCode: 503 })
    }
    const result = await sendNotificationToUser('u1', payload)
    expect(result).toMatchObject({ failed: 1, gone: 0 })
    expect(h.state.disabled).toEqual([])
  })

  it('an FCM row with no token is skipped rather than crashing the whole send', async () => {
    h.state.subs = [
      { id: 's1', provider: 'fcm', subscription_data: {} },
      { id: 's2', provider: 'webpush', subscription_data: { endpoint: 'https://p/1', keys: {} } },
    ]
    const result = await sendNotificationToUser('u1', payload)
    expect(result.sent).toBe(2) // both "succeed": one is a no-op, the web push really sends
    expect(h.state.fcmCalls).toEqual([])
  })

  it('a deployment with no FCM identity skips Android instead of failing', async () => {
    // Not an error state: it is a deployment that simply cannot reach Android yet.
    h.state.fcmSend = null
    h.state.subs = [{ id: 's1', provider: 'fcm', subscription_data: { token: 'tok' } }]
    const result = await sendNotificationToUser('u1', payload)
    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0 })
    expect(h.state.disabled).toEqual([])
  })
})
