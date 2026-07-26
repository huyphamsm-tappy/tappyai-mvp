import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the admin client's subscription query + prune, and web-push dispatch.
const h = vi.hoisted(() => {
  const state = { subs: [] as any[], subsError: null as any, pruned: null as any }
  const secondEq = vi.fn(async () => ({ data: state.subs, error: state.subsError }))
  const firstEq = vi.fn(() => ({ eq: secondEq }))
  const select = vi.fn(() => ({ eq: firstEq }))
  const inFn = vi.fn(async (_col: string, ids: string[]) => { state.pruned = ids; return { error: null } })
  const update = vi.fn(() => ({ in: inFn }))
  const from = vi.fn(() => ({ select, update }))
  const sendNotification = vi.fn()
  const setVapidDetails = vi.fn()
  return { state, from, select, firstEq, secondEq, update, inFn, sendNotification, setVapidDetails }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: h.from }) }))
vi.mock('web-push', () => ({ default: { setVapidDetails: h.setVapidDetails, sendNotification: h.sendNotification } }))

import { sendNotificationToUser } from './send'

const sub = (id: string) => ({ id, provider: 'webpush', subscription_data: { endpoint: 'e' + id, keys: { p256dh: 'p', auth: 'a' } } })

beforeEach(() => {
  vi.clearAllMocks()
  h.state.subs = []
  h.state.subsError = null
  h.state.pruned = null
})

describe('sendNotificationToUser → PushResult', () => {
  it('no subscriptions → attempted 0 (caller marks skipped)', async () => {
    const r = await sendNotificationToUser('u1', { title: 'T', body: 'B' })
    expect(r).toMatchObject({ attempted: 0, sent: 0, failed: 0, gone: 0 })
    expect(h.sendNotification).not.toHaveBeenCalled()
  })

  it('all delivered → sent count, no failures', async () => {
    h.state.subs = [sub('1'), sub('2')]
    h.sendNotification.mockResolvedValue(undefined)
    const r = await sendNotificationToUser('u1', { title: 'T', body: 'B' })
    expect(r).toMatchObject({ attempted: 2, sent: 2, failed: 0, gone: 0 })
  })

  it('a transient (500) error → failed with firstError, subscription NOT pruned', async () => {
    h.state.subs = [sub('1')]
    h.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))
    const r = await sendNotificationToUser('u1', { title: 'T', body: 'B' })
    expect(r).toMatchObject({ attempted: 1, sent: 0, failed: 1, gone: 0 })
    expect(r.firstError).toBeTruthy()
    expect(h.state.pruned).toBeNull()
  })

  it('a 410 Gone subscription is pruned and counted as gone (not a retry-worthy failure)', async () => {
    h.state.subs = [sub('1'), sub('2')]
    h.sendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
    const r = await sendNotificationToUser('u1', { title: 'T', body: 'B' })
    expect(r).toMatchObject({ attempted: 2, sent: 1, failed: 0, gone: 1 })
    expect(h.state.pruned).toEqual(['2'])
  })

  it('a subscription-fetch error → attempted 0 with the db error surfaced', async () => {
    h.state.subsError = { message: 'db down' }
    const r = await sendNotificationToUser('u1', { title: 'T', body: 'B' })
    expect(r).toMatchObject({ attempted: 0, firstError: 'db down' })
  })
})
