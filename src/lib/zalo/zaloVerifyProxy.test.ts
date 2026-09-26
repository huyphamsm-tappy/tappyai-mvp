import { describe, it, expect, vi } from 'vitest'
import {
  createProxyZaloVerifier, createZaloVerifier, createZaloProfileVerifier,
  ZALO_VERIFY_SECRET_HEADER, ZALO_VERIFY_URL_ENV, ZALO_VERIFY_SECRET_ENV,
} from './identity'

// The server learns a Zalo user id ONLY through our Vietnam-hosted verifier (infra/zalo-verify/),
// because graph.zalo.me answers -501 to every non-Vietnamese address we measured. These tests pin
// the contract with that service and, above all, that every failure THROWS (→ 503) and only
// Zalo's own rejection of the token is a null (→ 401). Nothing here returns a client-supplied id.

const URL_ = 'https://zalo-verify.example.test/verify'
const SECRET = 's'.repeat(48)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function verifierAnswering(res: Response | (() => Promise<Response>)) {
  const fetchImpl = vi.fn(async () => (typeof res === 'function' ? res() : res)) as unknown as typeof fetch
  return { v: createProxyZaloVerifier({ url: URL_, secret: SECRET, fetchImpl }), fetchImpl }
}

describe('the request it sends', () => {
  it('POSTs {at} with the shared secret in the header, never in the URL', async () => {
    const { v, fetchImpl } = verifierAnswering(json(200, { id: '1234567890123' }))
    await v.verify('tok-123')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe(URL_)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ at: 'tok-123' })
    expect(init.headers[ZALO_VERIFY_SECRET_HEADER]).toBe(SECRET)
    expect(String(url)).not.toContain('tok-123')
    expect(String(url)).not.toContain(SECRET)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('verdicts', () => {
  it('200 {id} → that id', async () => {
    const { v } = verifierAnswering(json(200, { id: '1234567890123' }))
    await expect(v.verify('t')).resolves.toBe('1234567890123')
  })

  it('200 {error:"invalid_token"} → null (Zalo rejected the token: 401, not 503)', async () => {
    const { v } = verifierAnswering(json(200, { error: 'invalid_token' }))
    await expect(v.verify('t')).resolves.toBeNull()
  })
})

describe('every other outcome throws (fail-closed → 503)', () => {
  it.each([
    ['401: our secret refused', json(401, { error: 'unauthorized' }), /rejected our secret/],
    ['403: our secret refused', json(403, {}), /rejected our secret/],
    ['429: rate limited', json(429, { error: 'rate_limited' }), /HTTP 429/],
    ['502: region restricted', json(502, { error: 'region_restricted' }), /region_restricted/],
    ['502: upstream error', json(502, { error: 'upstream_error' }), /upstream_error/],
    ['500: no body', new Response('oops', { status: 500 }), /unparseable/],
    ['200 but not JSON', new Response('<html>', { status: 200 }), /unparseable/],
    ['200 with an id that is not a Zalo id', json(200, { id: 'admin' }), /no id/],
    ['200 with a numeric id (not a string)', json(200, { id: 1234567890 }), /no id/],
    ['200 with neither id nor error', json(200, {}), /no id/],
    ['non-2xx that claims an id', json(500, { id: '1234567890123' }), /HTTP 500/],
    ['non-2xx that claims invalid_token', json(502, { error: 'invalid_token' }), /HTTP 502/],
  ])('%s', async (_label, res, msg) => {
    const { v } = verifierAnswering(res as Response)
    await expect(v.verify('t')).rejects.toThrow(msg as RegExp)
  })

  it('network failure', async () => {
    const { v } = verifierAnswering(() => Promise.reject(new TypeError('fetch failed')))
    await expect(v.verify('t')).rejects.toThrow(/unreachable: TypeError/)
  })

  it('timeout', async () => {
    const fetchImpl = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))
    ) as unknown as typeof fetch
    const v = createProxyZaloVerifier({ url: URL_, secret: SECRET, fetchImpl, timeoutMs: 20 })
    await expect(v.verify('t')).rejects.toThrow(/unreachable: TimeoutError/)
  })

  it('the error message never carries the token or the secret', async () => {
    const { v } = verifierAnswering(json(502, { error: 'upstream_error' }))
    const err = await v.verify('tok-SENSITIVE').catch((e: Error) => e)
    expect(String(err)).not.toContain('tok-SENSITIVE')
    expect(String(err)).not.toContain(SECRET)
  })
})

describe('createZaloVerifier — configuration', () => {
  const ok = { [ZALO_VERIFY_URL_ENV]: URL_, [ZALO_VERIFY_SECRET_ENV]: SECRET } as unknown as NodeJS.ProcessEnv

  it('configured → goes through the proxy', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: '1234567890123' })) as unknown as typeof fetch
    await expect(createZaloVerifier(ok, fetchImpl).verify('t')).resolves.toBe('1234567890123')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no env at all', {}],
    ['url missing', { [ZALO_VERIFY_SECRET_ENV]: SECRET }],
    ['secret missing', { [ZALO_VERIFY_URL_ENV]: URL_ }],
    ['plain http url', { [ZALO_VERIFY_URL_ENV]: 'http://zalo-verify.example.test/verify', [ZALO_VERIFY_SECRET_ENV]: SECRET }],
    ['secret shorter than 32', { [ZALO_VERIFY_URL_ENV]: URL_, [ZALO_VERIFY_SECRET_ENV]: 'short' }],
  ])('%s → throws without calling anything', async (_label, env) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(createZaloVerifier(env as NodeJS.ProcessEnv, fetchImpl).verify('t'))
      .rejects.toThrow('zalo verify proxy not configured')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never falls back to calling graph.zalo.me directly', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await createZaloVerifier({} as NodeJS.ProcessEnv, fetchImpl).verify('t').catch(() => {})
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('both server boundaries use it', () => {
  it('the login callback and the Mini App verify route', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(__dirname, '..', '..', '..')
    const boundaries: [string, string][] = [
      // Login needs the display fields too, so it takes the profile flavour of the same proxy.
      ['src/app/api/auth/zalo/callback/route.ts', 'createZaloProfileVerifier('],
      ['src/app/api/zalo/mini/verify/route.ts', 'createZaloVerifier('],
    ]
    for (const [rel, expected] of boundaries) {
      const src = readFileSync(join(root, rel), 'utf8')
      expect(src).toContain(expected)
      expect(src).not.toContain('createGraphZaloVerifier(')
    }
  })
})

// ── The profile flavour: same proxy, same fail-closed rules, plus the display fields ──────────
//
// Login creates accounts, so it needs a name and an avatar. Those used to come from the browser
// calling graph.zalo.me itself — the reason the access token was ever handed to the browser.
describe('createZaloProfileVerifier', () => {
  const ok = { [ZALO_VERIFY_URL_ENV]: URL_, [ZALO_VERIFY_SECRET_ENV]: SECRET } as unknown as NodeJS.ProcessEnv

  const answering = (res: Response) => {
    const fetchImpl = vi.fn(async () => res) as unknown as typeof fetch
    return { v: createZaloProfileVerifier(ok, fetchImpl), fetchImpl }
  }

  it('asks for the profile explicitly and returns all three fields', async () => {
    const { v, fetchImpl } = answering(json(200, { id: '1234567890123', name: 'Huy Phạm', avatar: 'https://z/a.jpg' }))
    await expect(v.verify('t')).resolves.toEqual({ id: '1234567890123', name: 'Huy Phạm', avatar: 'https://z/a.jpg' })
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ at: 't', profile: true })
  })

  it('a verifier that answers with the id alone is still valid — the extras are optional', async () => {
    const { v } = answering(json(200, { id: '1234567890123' }))
    await expect(v.verify('t')).resolves.toEqual({ id: '1234567890123', name: null, avatar: null })
  })

  it('blank display fields become null rather than empty strings', async () => {
    const { v } = answering(json(200, { id: '1234567890123', name: '   ', avatar: '' }))
    await expect(v.verify('t')).resolves.toEqual({ id: '1234567890123', name: null, avatar: null })
  })

  it('id still decides everything: a bad id is refused even with a name attached', async () => {
    const { v } = answering(json(200, { id: 'admin', name: 'Huy' }))
    await expect(v.verify('t')).rejects.toThrow(/no id/)
  })

  it('invalid_token → null; a failure → throw; unconfigured → throw', async () => {
    await expect(answering(json(200, { error: 'invalid_token' })).v.verify('t')).resolves.toBeNull()
    await expect(answering(json(502, { error: 'region_restricted' })).v.verify('t')).rejects.toThrow(/region_restricted/)
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(createZaloProfileVerifier({} as NodeJS.ProcessEnv, fetchImpl).verify('t'))
      .rejects.toThrow('zalo verify proxy not configured')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
