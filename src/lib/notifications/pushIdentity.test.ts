import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { browserPushCredential, reconcilePushIdentity, releaseOwnPushClaim } from './pushIdentity'

const CREDENTIAL = 'https://fcm.googleapis.com/fcm/send/TEST-DEVICE:APA91bExample'

type Call = { url: string; init: RequestInit }

/** Stand in for a browser that holds (or does not hold) a push subscription. */
function stubBrowser(opts: { endpoint?: string | null; registration?: boolean; throws?: boolean } = {}) {
  const { endpoint = CREDENTIAL, registration = true, throws = false } = opts
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: async () => {
        if (throws) throw new Error('no sw')
        if (!registration) return undefined
        return { pushManager: { getSubscription: async () => (endpoint ? { endpoint } : null) } }
      },
    },
  })
}

function stubFetch(handler: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browserPushCredential', () => {
  it('returns the endpoint this browser holds', async () => {
    stubBrowser()
    expect(await browserPushCredential()).toBe(CREDENTIAL)
  })

  it('answers null for every way a browser can have nothing', async () => {
    for (const opts of [{ registration: false }, { endpoint: null }, { throws: true }]) {
      stubBrowser(opts)
      expect(await browserPushCredential(), JSON.stringify(opts)).toBeNull()
    }
  })

  it('answers null where there is no service worker at all', async () => {
    vi.stubGlobal('navigator', {})
    expect(await browserPushCredential()).toBeNull()
  })
})

describe('reconcilePushIdentity', () => {
  it('sends the credential in the BODY, never in the URL', async () => {
    // The endpoint names one person's browser and is the single input that can
    // silence it, and URLs are logged, cached and referred onward.
    stubBrowser()
    const calls = stubFetch(() => json({ mine: true }))

    await reconcilePushIdentity()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/notifications/subscribe/reconcile')
    expect(calls[0].url).not.toContain(CREDENTIAL)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ credential: CREDENTIAL })
  })

  it('reports what the server answered', async () => {
    stubBrowser()
    stubFetch(() => json({ mine: true }))
    expect(await reconcilePushIdentity()).toBe(true)

    stubFetch(() => json({ mine: false }))
    expect(await reconcilePushIdentity()).toBe(false)
  })

  it('answers false without a request when this browser holds no credential', async () => {
    stubBrowser({ endpoint: null })
    const calls = stubFetch(() => json({ mine: true }))
    expect(await reconcilePushIdentity()).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('answers null — UNKNOWN, not false — when it cannot find out', async () => {
    // The distinction matters: a caller must be able to tell "not mine" from "I
    // could not ask". Both current callers then fail closed on their own.
    stubBrowser()
    stubFetch(() => json({ error: 'nope' }, 500))
    expect(await reconcilePushIdentity()).toBeNull()

    stubBrowser()
    stubFetch(() => { throw new Error('offline') })
    expect(await reconcilePushIdentity()).toBeNull()
  })

  it('treats a malformed answer as not-mine rather than trusting it', async () => {
    stubBrowser()
    stubFetch(() => json({}))
    expect(await reconcilePushIdentity()).toBe(false)
  })

  it('deduplicates concurrent callers into one request', async () => {
    // The page hook and the app-wide login listener both legitimately ask at the
    // same moment on a fresh sign-in.
    stubBrowser()
    const calls = stubFetch(() => json({ mine: true }))

    const [a, b, c] = await Promise.all([
      reconcilePushIdentity(),
      reconcilePushIdentity(),
      reconcilePushIdentity(),
    ])

    expect([a, b, c]).toEqual([true, true, true])
    expect(calls).toHaveLength(1)
  })

  it('does not cache across time — a later call asks again', async () => {
    stubBrowser()
    const calls = stubFetch(() => json({ mine: true }))
    await reconcilePushIdentity()
    await reconcilePushIdentity()
    expect(calls).toHaveLength(2)
  })
})

describe('releaseOwnPushClaim (sign-out)', () => {
  it('🚨 releases in ONE request that names this device', async () => {
    // Not disown_push_credential: that RPC excludes the caller by construction,
    // so it can never touch the row being given up at sign-out.
    // Not a two-step ask-then-delete either: inside a 1.5s budget the extra round
    // trip is expensive, and the gap between the answer and the act is a window
    // in which another tab could transfer the row away.
    stubBrowser()
    const calls = stubFetch(() => json({ ok: true }))

    await releaseOwnPushClaim()

    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url).toBe('/api/notifications/subscribe')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      provider: 'webpush',
      credential: CREDENTIAL,
    })
  })

  it('🚨 names the credential so another device of the same account is untouched', async () => {
    // One account holds at most one webpush row. If they subscribed on another
    // browser afterwards, a provider-only delete would switch off the device they
    // are still using.
    stubBrowser()
    const calls = stubFetch(() => json({ ok: true }))

    await releaseOwnPushClaim()

    const body = JSON.parse(String(calls[0].init.body))
    expect(body.credential).toBe(CREDENTIAL)
    expect(calls[0].url).not.toContain(CREDENTIAL) // body, never the URL
  })

  it('does nothing at all when this browser holds no credential', async () => {
    // Without a credential the only available request would be the blind,
    // provider-only one. Sending nothing is the safe answer.
    stubBrowser({ endpoint: null })
    const calls = stubFetch(() => json({ ok: true }))
    await releaseOwnPushClaim()
    expect(calls).toHaveLength(0)
  })

  it('passes the requested provider through', async () => {
    stubBrowser()
    const calls = stubFetch(() => json({ ok: true }))
    await releaseOwnPushClaim({ provider: 'fcm' })
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      provider: 'fcm',
      credential: CREDENTIAL,
    })
  })

  it('NEVER throws, whatever fails', async () => {
    // Sign-out runs next and must not be skipped.
    stubBrowser()
    stubFetch(() => { throw new Error('offline') })
    await expect(releaseOwnPushClaim()).resolves.toBeUndefined()

    stubBrowser()
    stubFetch(() => json({ error: 'boom' }, 500))
    await expect(releaseOwnPushClaim()).resolves.toBeUndefined()

    stubBrowser()
    stubFetch(() => json({ error: 'refused' }, 403))
    await expect(releaseOwnPushClaim()).resolves.toBeUndefined()

    vi.stubGlobal('navigator', {})
    await expect(releaseOwnPushClaim()).resolves.toBeUndefined()
  })

  it('gives up at its deadline instead of holding sign-out open', async () => {
    stubBrowser()
    const calls = stubFetch((_url, init) =>
      // A request that never settles on its own — only the abort ends it.
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    )

    const started = Date.now()
    await releaseOwnPushClaim({ timeoutMs: 30 })
    const elapsed = Date.now() - started

    expect(calls).toHaveLength(1)
    expect(elapsed).toBeLessThan(2000)
  })

  it('hands the abort signal to the request rather than only racing it', async () => {
    stubBrowser()
    const calls = stubFetch(() => json({ ok: true }))
    await releaseOwnPushClaim()
    for (const c of calls) expect(c.init.signal).toBeDefined()
  })
})
