import { describe, it, expect, vi, afterEach } from 'vitest'
import { turnstileConfigured, verifyTurnstile } from './turnstile'

// Turnstile — and specifically the one decision that is easy to get wrong.
//
// This control FAILS OPEN when it cannot reach a verdict, and REFUSES when it
// gets a negative one. Those are different outcomes for different reasons:
// most Tappy Business traffic is inside the Zalo and Messenger webviews, where
// a challenge widget is unreliable, so treating "no verdict" as "bot" would
// refuse real customers. Treating "Cloudflare says no" as "no verdict" would
// make the control decorative.

const ENV = { TURNSTILE_SECRET_KEY: 'secret' } as unknown as NodeJS.ProcessEnv

afterEach(() => vi.unstubAllGlobals())

function stubFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

describe('configuration', () => {
  it('reports whether the platform can challenge at all', () => {
    expect(turnstileConfigured(ENV)).toBe(true)
    expect(turnstileConfigured({} as NodeJS.ProcessEnv)).toBe(false)
  })

  it('🔑 unconfigured is DEGRADED, never PASSED', async () => {
    // If it were `passed`, removing an environment variable would silently
    // switch the control off and every downstream tightening with it.
    expect((await verifyTurnstile('tok', null, {} as NodeJS.ProcessEnv)).outcome).toBe('degraded')
  })
})

describe('verdicts', () => {
  it('passes a token Cloudflare accepts', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ success: true }) }))
    expect((await verifyTurnstile('good', '1.2.3.4', ENV)).outcome).toBe('passed')
  })

  it('🔑 REFUSES a token Cloudflare rejects', async () => {
    // A rejected token is a positive signal of automation — unlike a missing
    // one — and is the case this control exists for.
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }))
    const result = await verifyTurnstile('bad', null, ENV)
    expect(result.outcome).toBe('failed')
    expect(result.errorCodes).toEqual(['invalid-input-response'])
  })

  it('degrades when the caller sent no token', async () => {
    // An in-app browser that could not render the widget. The order proceeds
    // under a tighter rate limit rather than being refused.
    expect((await verifyTurnstile(null, null, ENV)).outcome).toBe('degraded')
    expect((await verifyTurnstile('', null, ENV)).outcome).toBe('degraded')
  })

  it('🔑 degrades when Cloudflare is unreachable', async () => {
    // Cloudflare's availability must not become Tappy's. A shop cannot sell
    // because a third party timed out is a worse outcome than a spam order.
    stubFetch(async () => {
      throw new Error('ETIMEDOUT')
    })
    expect((await verifyTurnstile('tok', null, ENV)).outcome).toBe('degraded')
  })

  it('degrades on a non-200 from siteverify', async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({}) }))
    expect((await verifyTurnstile('tok', null, ENV)).outcome).toBe('degraded')
  })

  it('degrades on a malformed body rather than assuming success', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ unexpected: true }) }))
    // `success` absent is not `success: true`.
    expect((await verifyTurnstile('tok', null, ENV)).outcome).toBe('failed')
  })

  it('sends the secret and the remote IP, never the secret in a URL', async () => {
    const calls: unknown[] = []
    stubFetch(async (...args: unknown[]) => {
      calls.push(args)
      return { ok: true, json: async () => ({ success: true }) }
    })
    await verifyTurnstile('tok', '1.2.3.4', ENV)

    const [url, init] = calls[0] as [string, { method: string; body: URLSearchParams }]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(url).not.toContain('secret')
    expect(init.method).toBe('POST')
    expect(init.body.get('secret')).toBe('secret')
    expect(init.body.get('remoteip')).toBe('1.2.3.4')
  })
})
