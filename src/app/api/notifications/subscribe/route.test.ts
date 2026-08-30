import { describe, it, expect, vi, beforeEach } from 'vitest'

// Captures what the route would write, so the assertions are about the row itself rather than
// about the route merely returning 200.
const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1' } as any,
    upsert: null as any,
    error: null as any,
    // What the DELETE path narrowed the update to. Asserting the FILTER is the
    // only way to tell "disabled the web row" from "disabled everything".
    update: null as any,
    eqs: [] as [string, unknown][],
  }
  const builder: any = {
    from: () => builder,
    update: (patch: any) => {
      state.update = patch
      return builder
    },
    eq: (column: string, value: unknown) => {
      state.eqs.push([column, value])
      return builder
    },
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
import { POST, DELETE } from './route'

const post = (body: unknown) =>
  new Request('http://localhost/api/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
  })

/** `body === undefined` reproduces the existing web client, which sends none. */
const del = (body?: unknown) =>
  new Request('http://localhost/api/notifications/subscribe', {
    method: 'DELETE',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1' }
  h.state.upsert = null
  h.state.error = null
  h.state.update = null
  h.state.eqs = []
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

describe('DELETE /api/notifications/subscribe — one transport at a time', () => {
  it('with no body, disables exactly the caller\'s web push row', async () => {
    // The shipped web client sends no body. Its behaviour must not change.
    const res = await DELETE(del())
    expect(res.status).toBe(200)
    expect(h.state.update).toEqual({ enabled: false })
    expect(h.state.eqs).toEqual([['user_id', 'u1'], ['provider', 'webpush']])
  })

  it('an explicit webpush request behaves identically to no body', async () => {
    await DELETE(del({ provider: 'webpush' }))
    expect(h.state.eqs).toEqual([['user_id', 'u1'], ['provider', 'webpush']])
  })

  it('🚨 turning push off on the web does NOT disable the same account\'s FCM row', async () => {
    // The tempting fix for the FCM gap was to drop the provider filter. That
    // would switch off Android for anyone who toggled the web off, which nothing
    // in the UI says it does.
    await DELETE(del())
    expect(h.state.eqs).toContainEqual(['provider', 'webpush'])
    expect(h.state.eqs).not.toContainEqual(['provider', 'fcm'])
    expect(h.state.eqs.filter(([c]) => c === 'provider')).toHaveLength(1)
  })

  it('an FCM client can finally disable its own row', async () => {
    // Before this, DELETE was hard-wired to webpush and an FCM row could never
    // be switched off through the app at all.
    const res = await DELETE(del({ provider: 'fcm' }))
    expect(res.status).toBe(200)
    expect(h.state.eqs).toEqual([['user_id', 'u1'], ['provider', 'fcm']])
  })

  it('rejects a provider it cannot honour instead of silently deleting the wrong row', async () => {
    for (const provider of ['carrier-pigeon', '', 123, null]) {
      h.state.eqs = []
      h.state.update = null
      const res = await DELETE(del({ provider }))
      expect(res.status, `provider=${String(provider)}`).toBe(400)
      expect(h.state.update).toBeNull()
    }
  })

  it('never lets the request body decide whose subscription is disabled', async () => {
    await DELETE(del({ provider: 'webpush', user_id: 'victim' }))
    expect(h.state.eqs).toEqual([['user_id', 'u1'], ['provider', 'webpush']])
  })

  it('🚨 a named credential scopes the delete to THAT device', async () => {
    // Sign-out sends this. Without it, one account's single webpush row could be
    // the OTHER browser they subscribed from later, and signing out here would
    // switch off the device they are still using.
    const res = await DELETE(del({ provider: 'webpush', credential: 'https://push.example/device-1' }))
    expect(res.status).toBe(200)
    expect(h.state.eqs).toEqual([
      ['user_id', 'u1'],
      ['provider', 'webpush'],
      ['subscription_data->>endpoint', 'https://push.example/device-1'],
    ])
  })

  it('an FCM credential is matched against the token, not the endpoint', async () => {
    await DELETE(del({ provider: 'fcm', credential: 'fZx1_test-token:APA91bExampleValue' }))
    expect(h.state.eqs).toEqual([
      ['user_id', 'u1'],
      ['provider', 'fcm'],
      ['subscription_data->>token', 'fZx1_test-token:APA91bExampleValue'],
    ])
  })

  it('🚨 the credential NARROWS and can never widen past the session\'s own rows', async () => {
    // user_id is applied first and unconditionally. A body naming somebody
    // else's credential simply matches nothing.
    await DELETE(del({ credential: 'https://push.example/someone-else', user_id: 'victim' }))
    expect(h.state.eqs[0]).toEqual(['user_id', 'u1'])
    expect(h.state.eqs).toContainEqual(['subscription_data->>endpoint', 'https://push.example/someone-else'])
    expect(h.state.eqs.filter(([c]) => c === 'user_id')).toEqual([['user_id', 'u1']])
  })

  it('without a credential the delete stays provider-scoped, as before', async () => {
    // Somebody who cleared site data has no credential left to name; making it
    // mandatory would leave them unable to switch their own stale row off.
    await DELETE(del({ provider: 'webpush' }))
    expect(h.state.eqs).toEqual([['user_id', 'u1'], ['provider', 'webpush']])
  })

  it('rejects a malformed credential instead of ignoring it and deleting wider', async () => {
    // Silently dropping an unusable credential would turn a narrow request into
    // the blind provider-only one — the failure mode this parameter exists to
    // prevent.
    for (const credential of ['', '   ', 123, null, 'x'.repeat(4097)]) {
      h.state.eqs = []
      h.state.update = null
      const res = await DELETE(del({ provider: 'webpush', credential }))
      expect(res.status, `credential=${String(credential)}`).toBe(400)
      expect(h.state.update).toBeNull()
    }
  })

  it('requires a session', async () => {
    h.state.user = null
    const res = await DELETE(del({ provider: 'fcm' }))
    expect(res.status).toBe(401)
    expect(h.state.update).toBeNull()
  })

  it('surfaces a storage failure rather than reporting success', async () => {
    h.state.error = { message: 'boom' }
    const res = await DELETE(del())
    expect(res.status).toBe(500)
  })
})
