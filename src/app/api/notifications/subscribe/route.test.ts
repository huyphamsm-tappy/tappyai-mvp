import { describe, it, expect, vi, beforeEach } from 'vitest'

// Captures what the route would write, so the assertions are about the row itself rather than
// about the route merely returning 200.
const h = vi.hoisted(() => {
  const state = { user: { id: 'u1' } as any, upsert: null as any, error: null as any }
  const builder: any = {
    from: () => builder,
    update: () => builder,
    eq: () => builder,
    upsert: (row: any) => {
      state.upsert = row
      return Promise.resolve({ error: state.error })
    },
  }
  builder.then = (res: any, rej: any) => Promise.resolve({ error: state.error }).then(res, rej)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
import { POST } from './route'

const post = (body: unknown) =>
  new Request('http://localhost/api/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1' }
  h.state.upsert = null
  h.state.error = null
})

const WEBPUSH = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }

describe('POST /api/notifications/subscribe — two transports, one contract', () => {
  it('still stores a web push subscription exactly as before', async () => {
    // Android's arrival must not change what the web writes.
    const res = await POST(post(WEBPUSH))
    expect(res.status).toBe(200)
    expect(h.state.upsert).toMatchObject({
      user_id: 'u1',
      provider: 'webpush',
      subscription_data: { endpoint: WEBPUSH.endpoint, keys: WEBPUSH.keys },
      enabled: true,
    })
  })

  it('stores an FCM token under its own provider', async () => {
    const res = await POST(post({ provider: 'fcm', token: 'fZx1_test-token:APA91bExampleValue' }))
    expect(res.status).toBe(200)
    expect(h.state.upsert).toMatchObject({
      user_id: 'u1',
      provider: 'fcm',
      subscription_data: { token: 'fZx1_test-token:APA91bExampleValue' },
      enabled: true,
    })
  })

  it('never lets the request body decide who the subscription belongs to', async () => {
    // The obvious attack: register your device against someone else's account. The user id comes
    // from the verified session and nowhere else.
    const res = await POST(post({ provider: 'fcm', token: 'fZx1_test-token:APA91bExampleValue', user_id: 'victim' }))
    expect(res.status).toBe(200)
    expect(h.state.upsert.user_id).toBe('u1')
  })

  it('rejects an FCM registration with no usable token', async () => {
    for (const body of [
      { provider: 'fcm' },
      { provider: 'fcm', token: '' },
      // Bounded: too short to be a real token, too long to be anything but abuse of the row as
      // storage, and characters an FCM token never contains.
      { provider: 'fcm', token: 'short' },
      { provider: 'fcm', token: 'a'.repeat(4097) },
      { provider: 'fcm', token: '{"not":"a token"} with spaces' },
      { provider: 'fcm', token: 123 },
    ]) {
      const res = await POST(post(body))
      expect(res.status).toBe(400)
      expect(h.state.upsert).toBeNull()
    }
  })

  it('an unknown provider is treated as web push, not silently accepted', async () => {
    // Falling through to webpush validation means a typo'd provider fails loudly instead of
    // writing a row nothing can ever send to.
    const res = await POST(post({ provider: 'carrier-pigeon', token: 'fZx1_test-token:APA91bExampleValue' }))
    expect(res.status).toBe(400)
    expect(h.state.upsert).toBeNull()
  })

  it('requires a session for either transport', async () => {
    h.state.user = null
    for (const body of [WEBPUSH, { provider: 'fcm', token: 'fZx1_test-token:APA91bExampleValue' }]) {
      const res = await POST(post(body))
      expect(res.status).toBe(401)
      expect(h.state.upsert).toBeNull()
    }
  })

  it('surfaces a storage failure rather than reporting success', async () => {
    h.state.error = { message: 'boom' }
    const res = await POST(post({ provider: 'fcm', token: 'fZx1_test-token:APA91bExampleValue' }))
    expect(res.status).toBe(500)
  })
})
