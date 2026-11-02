import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APPLE_SETTINGS_FAIL_TTL_MS, APPLE_SETTINGS_TTL_MS, __resetAppleCapabilityCache, appleProviderEnabled, appleSignInAvailable } from './appleCapability'

// The capability source is Supabase's own public provider state (GET <project>/auth/v1/settings). A repo test cannot prove the live
// dashboard; these prove that the signal is true ONLY for that state and false for everything else.
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key-sentinel' }
const settings = (apple: unknown, extra: Record<string, unknown> = {}) => ({ external: { google: true, email: true, apple, ...extra }, disable_signup: false })
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => __resetAppleCapabilityCache())

describe('appleProviderEnabled (the body)', () => {
  it('only the literal true counts', () => {
    expect(appleProviderEnabled(settings(true))).toBe(true)
    for (const v of [false, null, undefined, 'true', 1, 'enabled', {}, []]) expect(appleProviderEnabled(settings(v))).toBe(false)
  })
  it('missing / malformed bodies are false', () => {
    for (const b of [null, undefined, 'x', 42, [], {}, { external: null }, { external: 'apple' }, { external: {} }, { apple: true }]) expect(appleProviderEnabled(b)).toBe(false)
  })
  it('a different provider being on does not enable Apple', () => {
    expect(appleProviderEnabled({ external: { google: true, zalo: true, email: true } })).toBe(false)
  })
})

describe('appleSignInAvailable (the capability)', () => {
  it('enabled in Supabase -> true; sends the public key only to /auth/v1/settings, never follows a redirect', async () => {
    const f = vi.fn().mockResolvedValue(ok(settings(true)))
    expect(await appleSignInAvailable({ env: ENV, fetchImpl: f })).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://proj.supabase.co/auth/v1/settings')
    expect(String(url)).not.toContain('public-anon-key-sentinel')
    expect(init.headers).toEqual({ apikey: 'public-anon-key-sentinel' })
    expect(init.redirect).toBe('error')
    expect(init.method).toBe('GET')
  })
  it('provider disabled in Supabase -> false (the state of audit and production on 05/10)', async () => {
    expect(await appleSignInAvailable({ env: ENV, fetchImpl: vi.fn().mockResolvedValue(ok(settings(false))) })).toBe(false)
  })
  it('no Supabase env -> false and NO network call', async () => {
    const f = vi.fn()
    for (const env of [{}, { NEXT_PUBLIC_SUPABASE_URL: ENV.NEXT_PUBLIC_SUPABASE_URL }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }]) {
      expect(await appleSignInAvailable({ env, fetchImpl: f })).toBe(false)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('a URL that is not https (or carries credentials) is never called', async () => {
    const f = vi.fn()
    for (const u of ['http://proj.supabase.co', 'ftp://x', 'not a url', 'https://user:pw@proj.supabase.co']) {
      expect(await appleSignInAvailable({ env: { ...ENV, NEXT_PUBLIC_SUPABASE_URL: u }, fetchImpl: f })).toBe(false)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('local Supabase over http://127.0.0.1 is allowed for development', async () => {
    const f = vi.fn().mockResolvedValue(ok(settings(true)))
    expect(await appleSignInAvailable({ env: { ...ENV, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }, fetchImpl: f })).toBe(true)
    expect(f.mock.calls[0][0]).toBe('http://127.0.0.1:54321/auth/v1/settings')
  })
  it('provider error (500/502/401/403/404) -> false', async () => {
    for (const status of [500, 502, 401, 403, 404]) {
      __resetAppleCapabilityCache()
      expect(await appleSignInAvailable({ env: ENV, fetchImpl: vi.fn().mockResolvedValue(new Response('{}', { status })) })).toBe(false)
    }
  })
  it('malformed JSON / HTML / empty / oversized body -> false', async () => {
    for (const body of ['<html>', '', 'null', '{"external":', 'x'.repeat(30_000)]) {
      __resetAppleCapabilityCache()
      expect(await appleSignInAvailable({ env: ENV, fetchImpl: vi.fn().mockResolvedValue(new Response(body, { status: 200 })) })).toBe(false)
    }
  })
  it('network error and a refused redirect -> false, never throws', async () => {
    expect(await appleSignInAvailable({ env: ENV, fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')) })).toBe(false)
    __resetAppleCapabilityCache()
    expect(await appleSignInAvailable({ env: ENV, fetchImpl: vi.fn().mockRejectedValue(new TypeError('redirect mode is set to error')) })).toBe(false)
  })
  it('timeout -> false', async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))))
    expect(await appleSignInAvailable({ env: ENV, fetchImpl: f as unknown as typeof fetch, timeoutMs: 20 })).toBe(false)
  })
  it('cached: a second call inside the TTL makes no request; after the TTL it asks again and follows the change', async () => {
    let t = 1_000_000
    const f = vi.fn().mockResolvedValueOnce(ok(settings(false))).mockResolvedValueOnce(ok(settings(true)))
    const d = { env: ENV, fetchImpl: f, now: () => t }
    expect(await appleSignInAvailable(d)).toBe(false)
    t += APPLE_SETTINGS_TTL_MS - 1
    expect(await appleSignInAvailable(d)).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
    t += 2
    expect(await appleSignInAvailable(d)).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('a failure is remembered only briefly, so a recovery shows up within seconds', async () => {
    let t = 5_000_000
    const f = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(ok(settings(true)))
    const d = { env: ENV, fetchImpl: f, now: () => t }
    expect(await appleSignInAvailable(d)).toBe(false)
    t += APPLE_SETTINGS_FAIL_TTL_MS + 1
    expect(await appleSignInAvailable(d)).toBe(true)
  })
})
