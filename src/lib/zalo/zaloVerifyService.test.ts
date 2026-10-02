// The Vietnam-hosted verifier (infra/zalo-verify/server.mjs) — the service half of the contract
// whose app half is pinned in zaloVerifyProxy.test.ts. It runs on a VPS, not on Vercel, but it
// lives in this repo and is tested here so the two halves cannot drift apart.

import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import {
  createHandler, secretMatches, startServer, lookupZaloId,
  SECRET_HEADER, ZALO_ME_URL, ZALO_ME_PROFILE_URL, MAX_BODY_BYTES,
} from '../../../infra/zalo-verify/server.mjs'
import { createProxyZaloVerifier, ZALO_VERIFY_SECRET_HEADER } from './identity'

const SECRET = 'k'.repeat(48)
const TOKEN = 'zalo-test-token-ABCDEFGHIJKLMNOP'
const zalo = (body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }))
const post = (body: unknown, headers: Record<string, string> = { [SECRET_HEADER]: SECRET }, ip = '1.2.3.4') => ({
  method: 'POST', path: '/verify', headers, ip, body: typeof body === 'string' ? body : JSON.stringify(body),
})

describe('routing', () => {
  const h = createHandler({ secret: SECRET, fetchImpl: zalo({}) as unknown as typeof fetch })
  it('GET /healthz needs no secret and says nothing', async () => {
    expect(await h({ method: 'GET', path: '/healthz', headers: {}, ip: 'x', body: '' })).toEqual({ status: 200, body: { ok: true } })
  })
  it('unknown path → 404, GET /verify → 405', async () => {
    expect((await h({ method: 'POST', path: '/', headers: {}, ip: 'x', body: '' })).status).toBe(404)
    expect((await h({ method: 'GET', path: '/verify', headers: {}, ip: 'x', body: '' })).status).toBe(405)
  })
  it('refuses to start with a short secret', () => {
    expect(() => createHandler({ secret: 'short' })).toThrow(/32/)
  })
})

describe('the secret is checked first', () => {
  it.each([
    ['missing', {}],
    ['wrong, same length', { [SECRET_HEADER]: 'x'.repeat(48) }],
    ['wrong, different length', { [SECRET_HEADER]: 'nope' }],
    ['a prefix of the real one', { [SECRET_HEADER]: SECRET.slice(0, 47) }],
  ])('%s → 401 and Zalo is never called', async (_l, headers) => {
    const f = zalo({ id: '1234567890' })
    const h = createHandler({ secret: SECRET, fetchImpl: f as unknown as typeof fetch })
    expect(await h(post({ at: TOKEN }, headers as Record<string, string>))).toEqual({ status: 401, body: { error: 'unauthorized' } })
    expect(f).not.toHaveBeenCalled()
  })

  it('secretMatches compares without throwing on length mismatch', () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true)
    expect(secretMatches('a', SECRET)).toBe(false)
    expect(secretMatches(undefined, SECRET)).toBe(false)
    expect(secretMatches(SECRET, '')).toBe(false)
  })

  it('the header name is the one the app sends', () => {
    expect(SECRET_HEADER).toBe(ZALO_VERIFY_SECRET_HEADER)
  })
})

describe('the body', () => {
  it.each([
    ['not JSON', 'at=abc'],
    ['no at', {}],
    ['at not a string', { at: 123 }],
    ['at too short', { at: 'short' }],
    ['at with a space', { at: 'abc def ghi jkl mno pqr' }],
    ['at with non-ASCII', { at: 'tokentokentokentokené' }],
  ])('%s → 400 without calling Zalo', async (_l, body) => {
    const f = zalo({ id: '1234567890' })
    const h = createHandler({ secret: SECRET, fetchImpl: f as unknown as typeof fetch })
    expect((await h(post(body))).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('the one call it makes', () => {
  it('GET graph.zalo.me/v2.0/me?fields=id, token in a header — never in the URL', async () => {
    const f = zalo({ id: '1234567890123', name: 'ignored' })
    const h = createHandler({ secret: SECRET, fetchImpl: f as unknown as typeof fetch })
    expect(await h(post({ at: TOKEN }))).toEqual({ status: 200, body: { id: '1234567890123' } })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://graph.zalo.me/v2.0/me?fields=id')
    expect(url).toBe(ZALO_ME_URL)
    expect(url).not.toContain(TOKEN)
    expect(init.method).toBe('GET')
    expect(init.headers.access_token).toBe(TOKEN)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['-501 region restricted', { error: -501, message: 'region' }, 502, { error: 'region_restricted' }],
    ['452 invalid session key', { error: 452 }, 200, { error: 'invalid_token' }],
    ['-124 token invalid', { error: -124 }, 200, { error: 'invalid_token' }],
    ['-216 token invalid', { error: -216 }, 200, { error: 'invalid_token' }],
    ['-14002 app not active: config, not the user', { error: -14002 }, 502, { error: 'upstream_error', code: -14002 }],
    ['id that is not digits', { id: 'admin' }, 502, { error: 'upstream_error', code: 'no_id' }],
    ['id plus an error code', { id: '1234567890', error: -501 }, 502, { error: 'region_restricted' }],
    ['empty object', {}, 502, { error: 'upstream_error', code: 'no_id' }],
  ])('%s', async (_l, zaloBody, status, body) => {
    const h = createHandler({ secret: SECRET, fetchImpl: zalo(zaloBody) as unknown as typeof fetch })
    expect(await h(post({ at: TOKEN }))).toEqual({ status, body })
  })

  it('network failure / non-JSON → 502 upstream_error', async () => {
    const boom = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    expect(await lookupZaloId(TOKEN, boom)).toEqual({ status: 502, body: { error: 'upstream_error', code: 'unreachable' } })
    const html = (async () => new Response('<html>')) as unknown as typeof fetch
    expect((await lookupZaloId(TOKEN, html)).status).toBe(502)
  })

  it('times out after the configured budget', async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch
    expect(await lookupZaloId(TOKEN, hang, 20)).toEqual({ status: 502, body: { error: 'upstream_error', code: 'unreachable' } })
  })
})

describe('rate limits', () => {
  it('per IP per minute, then the window resets', async () => {
    let t = 0
    const h = createHandler({ secret: SECRET, fetchImpl: zalo({ id: '1234567890' }) as unknown as typeof fetch, now: () => t, perIpPerMinute: 3 })
    for (let i = 0; i < 3; i++) expect((await h(post({ at: TOKEN }))).status).toBe(200)
    expect(await h(post({ at: TOKEN }))).toEqual({ status: 429, body: { error: 'rate_limited' } })
    expect((await h(post({ at: TOKEN }, undefined, '5.6.7.8'))).status).toBe(200)
    t = 60_000
    expect((await h(post({ at: TOKEN }))).status).toBe(200)
  })

  it('too many wrong secrets blocks that IP, even with the right one, for the block period', async () => {
    let t = 0
    const h = createHandler({
      secret: SECRET, fetchImpl: zalo({ id: '1234567890' }) as unknown as typeof fetch,
      now: () => t, badSecretPerIpPerMinute: 2, blockMs: 900_000,
    })
    for (let i = 0; i < 3; i++) expect((await h(post({ at: TOKEN }, { [SECRET_HEADER]: 'wrong' }))).status).toBe(401)
    expect((await h(post({ at: TOKEN }))).status).toBe(429)
    expect((await h(post({ at: TOKEN }, undefined, '9.9.9.9'))).status).toBe(200)
    t = 900_001
    expect((await h(post({ at: TOKEN }))).status).toBe(200)
  })
})

describe('over a real socket', () => {
  let server: Server | undefined
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())))

  const boot = (fetchImpl: typeof fetch) =>
    new Promise<{ url: string; logs: string[] }>((resolve) => {
      const logs: string[] = []
      server = startServer({ secret: SECRET, port: 0, log: (l: string) => logs.push(l), handlerOpts: { fetchImpl } })
      server.on('listening', () => resolve({ url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/verify`, logs }))
    })

  it('the app-side proxy verifier and this service agree end to end', async () => {
    const { url, logs } = await boot(zalo({ id: '1234567890123' }) as unknown as typeof fetch)
    const v = createProxyZaloVerifier({ url, secret: SECRET })
    await expect(v.verify(TOKEN)).resolves.toBe('1234567890123')
    const wrong = createProxyZaloVerifier({ url, secret: 'w'.repeat(48) })
    await expect(wrong.verify(TOKEN)).rejects.toThrow(/rejected our secret/)
    // Logs carry outcomes only: never the token, never the secret, never the id.
    const all = logs.join('\n')
    expect(all).not.toContain(TOKEN)
    expect(all).not.toContain(SECRET)
    expect(all).not.toContain('1234567890123')
    expect(all).toMatch(/POST \/verify 200 id/)
  })

  it('invalid_token reaches the app as null, region_restricted as a throw', async () => {
    const { url } = await boot(zalo({ error: 452 }) as unknown as typeof fetch)
    await expect(createProxyZaloVerifier({ url, secret: SECRET }).verify(TOKEN)).resolves.toBeNull()
    server!.close()
    const b = await boot(zalo({ error: -501 }) as unknown as typeof fetch)
    await expect(createProxyZaloVerifier({ url: b.url, secret: SECRET }).verify(TOKEN)).rejects.toThrow(/region_restricted/)
  })

  it('a body over the limit is refused with 413', async () => {
    const { url } = await boot(zalo({ id: '1234567890' }) as unknown as typeof fetch)
    const res = await fetch(url, {
      method: 'POST',
      headers: { [SECRET_HEADER]: SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ at: 'a'.repeat(MAX_BODY_BYTES + 10) }),
    }).catch(() => null)
    // Either the 413 arrives or the socket is torn down mid-upload; both refuse the request.
    if (res) expect(res.status).toBe(413)
  })

  it('binds to loopback by default', async () => {
    await boot(zalo({}) as unknown as typeof fetch)
    expect((server!.address() as AddressInfo).address).toBe('127.0.0.1')
  })
})

// ── profile mode: one extra field in the request, one extra call's worth of data back ─────────
describe('the profile flavour', () => {
  const profilePost = (body: unknown) => post({ at: TOKEN, profile: true, ...(body as object) })

  it('asks Zalo for name and picture, and maps them', async () => {
    const f = zalo({ id: '1234567890123', name: 'Huy Phạm', picture: { data: { url: 'https://s120.avatar/x.jpg' } } })
    const h = createHandler({ secret: SECRET, fetchImpl: f as unknown as typeof fetch })

    expect(await h(profilePost({}))).toEqual({
      status: 200, body: { id: '1234567890123', name: 'Huy Phạm', avatar: 'https://s120.avatar/x.jpg' },
    })
    expect(f.mock.calls[0][0]).toBe('https://graph.zalo.me/v2.0/me?fields=id,name,picture')
    expect(f.mock.calls[0][0]).toBe(ZALO_ME_PROFILE_URL)
  })

  it('without the flag it asks for the id alone and answers with the id alone', async () => {
    const f = zalo({ id: '1234567890123', name: 'Huy Phạm' })
    const h = createHandler({ secret: SECRET, fetchImpl: f as unknown as typeof fetch })

    expect(await h(post({ at: TOKEN }))).toEqual({ status: 200, body: { id: '1234567890123' } })
    expect(f.mock.calls[0][0]).toBe(ZALO_ME_URL)
  })

  it.each([
    ['no picture at all', { id: '1234567890123', name: 'Huy' }, { name: 'Huy', avatar: null }],
    ['a non-https avatar', { id: '1234567890123', picture: { data: { url: 'http://x/a.jpg' } } }, { name: null, avatar: null }],
    ['an empty name', { id: '1234567890123', name: '  ' }, { name: null, avatar: null }],
  ])('%s → null, never a broken value', async (_l, zaloBody, expected) => {
    const h = createHandler({ secret: SECRET, fetchImpl: zalo(zaloBody) as unknown as typeof fetch })
    expect(await h(profilePost({}))).toEqual({ status: 200, body: { id: '1234567890123', ...expected } })
  })

  it('the display fields never rescue a rejected token', async () => {
    const h = createHandler({ secret: SECRET, fetchImpl: zalo({ error: 452, name: 'Huy' }) as unknown as typeof fetch })
    expect(await h(profilePost({}))).toEqual({ status: 200, body: { error: 'invalid_token' } })
  })

  it('a name is never logged', async () => {
    const logs: string[] = []
    const server = startServer({
      secret: SECRET, port: 0, log: (l: string) => logs.push(l),
      handlerOpts: { fetchImpl: zalo({ id: '1234567890123', name: 'Huy Phạm' }) as unknown as typeof fetch },
    })
    await new Promise<void>((r) => server.on('listening', () => r()))
    const port = (server.address() as AddressInfo).port
    await fetch(`http://127.0.0.1:${port}/verify`, {
      method: 'POST',
      headers: { [SECRET_HEADER]: SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ at: TOKEN, profile: true }),
    })
    await new Promise<void>((r) => server.close(() => r()))
    expect(logs.join('\n')).not.toContain('Huy')
    expect(logs.join('\n')).toMatch(/POST \/verify 200 id/)
  })
})

// ── one VPS, two callers: UAT and production each hold their own secret (RULE 3) ──────────────
describe('several accepted secrets', () => {
  const PROD = 'p'.repeat(40)
  const both = `${SECRET},${PROD}`

  it('accepts either secret and refuses everything else', async () => {
    const h = createHandler({ secret: both, fetchImpl: zalo({ id: '1234567890123' }) as unknown as typeof fetch })
    for (const s of [SECRET, PROD]) {
      expect((await h(post({ at: TOKEN }, { [SECRET_HEADER]: s }))).status).toBe(200)
    }
    expect((await h(post({ at: TOKEN }, { [SECRET_HEADER]: 'q'.repeat(40) }))).status).toBe(401)
    // The list itself is not a secret anyone can present.
    expect((await h(post({ at: TOKEN }, { [SECRET_HEADER]: both }))).status).toBe(401)
  })

  it('secretMatches handles the list form directly', () => {
    expect(secretMatches(SECRET, both)).toBe(true)
    expect(secretMatches(PROD, both)).toBe(true)
    expect(secretMatches(PROD, `${SECRET} ${PROD}`)).toBe(true)
    expect(secretMatches('short', both)).toBe(false)
    // A too-short entry is discarded rather than accepted.
    expect(secretMatches('abc', `abc,${SECRET}`)).toBe(false)
  })

  it('a list with nothing long enough refuses to start', () => {
    expect(() => createHandler({ secret: 'a,b,c' })).toThrow(/32/)
  })
})
