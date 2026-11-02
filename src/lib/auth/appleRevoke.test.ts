import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  APPLE_AUDIENCE, APPLE_CLIENT_SECRET_TTL_SEC, APPLE_DEFAULT_CLIENT_ID, APPLE_REVOKE_URL, APPLE_TOKEN_URL,
  appleRevokeConfig, createAppleClientSecret, idTokenSubject, revokeAppleForDeletion,
} from './appleRevoke'

// A REAL P-256 key (the type Apple issues) generated per run: signing and signature verification are exercised for real. Only the
// network edge to appleid.apple.com is stubbed.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const ENV = { APPLE_SIWA_TEAM_ID: 'TEAM123456', APPLE_SIWA_KEY_ID: 'KEYID12345', APPLE_SIWA_PRIVATE_KEY: PEM }
const NOW_MS = Date.UTC(2026, 9, 5, 12, 0, 0)

const decode = (jwt: string) => {
  const [h, p, s] = jwt.split('.')
  return { header: JSON.parse(Buffer.from(h, 'base64url').toString()), payload: JSON.parse(Buffer.from(p, 'base64url').toString()), sig: Buffer.from(s, 'base64url'), input: `${h}.${p}` }
}
const idToken = (sub: unknown) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

/** A scripted appleid.apple.com. Records every call; answers by URL. */
function apple(opts: { token?: Response | Error; revoke?: Response | Error } = {}) {
  const calls: Array<{ url: string; form: URLSearchParams; init: RequestInit }> = []
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(String(init.body)), init })
    const r = url === APPLE_TOKEN_URL ? (opts.token ?? json(200, { refresh_token: 'RT-secret-0001', id_token: idToken('apple-sub-1'), access_token: 'AT-secret-0001' })) : (opts.revoke ?? new Response('', { status: 200 }))
    if (r instanceof Error) throw r
    return r
  })
  return { f: f as unknown as typeof fetch, calls }
}
const run = (a: ReturnType<typeof apple>, over: Partial<Parameters<typeof revokeAppleForDeletion>[0]> = {}) =>
  revokeAppleForDeletion({ authorizationCode: 'code-abc', appleSubjects: ['apple-sub-1'], env: ENV, fetchImpl: a.f, nowMs: NOW_MS, ...over })

describe('appleRevokeConfig', () => {
  it('valid config; client id defaults to the iOS bundle id and can be overridden', () => {
    expect(appleRevokeConfig(ENV)).toMatchObject({ teamId: 'TEAM123456', keyId: 'KEYID12345', clientId: APPLE_DEFAULT_CLIENT_ID })
    expect(appleRevokeConfig({ ...ENV, APPLE_SIWA_CLIENT_ID: 'com.example.other' })?.clientId).toBe('com.example.other')
  })
  it('accepts the key stored on one line with literal \\n', () => {
    expect(appleRevokeConfig({ ...ENV, APPLE_SIWA_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') })).not.toBeNull()
  })
  it('missing / malformed pieces -> null (never half-configured)', () => {
    for (const bad of [{}, { ...ENV, APPLE_SIWA_TEAM_ID: '' }, { ...ENV, APPLE_SIWA_TEAM_ID: 'short' }, { ...ENV, APPLE_SIWA_KEY_ID: 'lower12345' }, { ...ENV, APPLE_SIWA_PRIVATE_KEY: '' }, { ...ENV, APPLE_SIWA_PRIVATE_KEY: 'not a key' }]) {
      expect(appleRevokeConfig(bad)).toBeNull()
    }
  })
  it('a key that is not P-256 (RSA) is refused: it could not produce ES256', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    expect(appleRevokeConfig({ ...ENV, APPLE_SIWA_PRIVATE_KEY: rsa })).toBeNull()
  })
})

describe('createAppleClientSecret', () => {
  it('is an ES256 JWT with Apple\'s claims, short-lived, and its signature verifies against the public key', () => {
    const cfg = appleRevokeConfig(ENV)!
    const now = Math.floor(NOW_MS / 1000)
    const d = decode(createAppleClientSecret(cfg, now))
    expect(d.header).toEqual({ alg: 'ES256', kid: 'KEYID12345', typ: 'JWT' })
    expect(d.payload).toEqual({ iss: 'TEAM123456', iat: now, exp: now + APPLE_CLIENT_SECRET_TTL_SEC, aud: APPLE_AUDIENCE, sub: APPLE_DEFAULT_CLIENT_ID })
    expect(APPLE_CLIENT_SECRET_TTL_SEC).toBeLessThanOrEqual(600)
    expect(d.sig.length).toBe(64) // raw R||S (JWS), not DER
    expect(verify('sha256', Buffer.from(d.input), { key: publicKey, dsaEncoding: 'ieee-p1363' }, d.sig)).toBe(true)
    expect(verify('sha256', Buffer.from(d.input + 'x'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, d.sig)).toBe(false)
  })
})

describe('idTokenSubject', () => {
  it('reads sub; anything else is null', () => {
    expect(idTokenSubject(idToken('abc.def'))).toBe('abc.def')
    for (const bad of [undefined, null, 5, '', 'a.b', 'a.b.c.d', 'h.@@@.s', idToken(''), idToken(7), idToken('x'.repeat(300))]) expect(idTokenSubject(bad)).toBeNull()
  })
})

describe('revokeAppleForDeletion', () => {
  it('exchanges the code, checks the subject, THEN revokes the refresh token -> ok', async () => {
    const a = apple()
    expect(await run(a)).toEqual({ ok: true })
    expect(a.calls.map(c => c.url)).toEqual([APPLE_TOKEN_URL, APPLE_REVOKE_URL])
    const [tok, rev] = a.calls
    expect(Object.fromEntries(tok.form)).toMatchObject({ client_id: APPLE_DEFAULT_CLIENT_ID, code: 'code-abc', grant_type: 'authorization_code' })
    expect(Object.fromEntries(rev.form)).toMatchObject({ client_id: APPLE_DEFAULT_CLIENT_ID, token: 'RT-secret-0001', token_type_hint: 'refresh_token' })
    // both calls carry a verifiable client secret signed with our key
    for (const c of a.calls) {
      const d = decode(c.form.get('client_secret')!)
      expect(verify('sha256', Buffer.from(d.input), { key: publicKey, dsaEncoding: 'ieee-p1363' }, d.sig)).toBe(true)
    }
    for (const c of a.calls) {
      expect((c.init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')
      expect(c.init.method).toBe('POST')
      expect(c.init.redirect).toBe('error')
    }
  })
  it('the endpoints are the ones Apple advertises (appleid.apple.com/auth/token, /auth/revoke)', () => {
    expect(APPLE_TOKEN_URL).toBe('https://appleid.apple.com/auth/token')
    expect(APPLE_REVOKE_URL).toBe('https://appleid.apple.com/auth/revoke')
  })
  it('not configured -> not_configured, and Apple is never contacted', async () => {
    const a = apple()
    expect(await run(a, { env: {} })).toEqual({ ok: false, reason: 'not_configured' })
    expect(a.calls).toHaveLength(0)
  })
  it('empty or oversized code -> invalid_code without contacting Apple', async () => {
    const a = apple()
    for (const authorizationCode of ['', '   ', 'x'.repeat(5000)]) expect(await run(a, { authorizationCode })).toEqual({ ok: false, reason: 'invalid_code' })
    expect(a.calls).toHaveLength(0)
  })
  it('Apple rejects the code (400 invalid_grant / invalid_request) -> invalid_code; nothing revoked', async () => {
    for (const error of ['invalid_grant', 'invalid_request']) {
      const a = apple({ token: json(400, { error }) })
      expect(await run(a)).toEqual({ ok: false, reason: 'invalid_code' })
      expect(a.calls).toHaveLength(1)
    }
  })
  it('other Apple failures (invalid_client, 401, 500, bad body, network, timeout) -> apple_error; nothing revoked', async () => {
    const cases: Array<Response | Error> = [json(400, { error: 'invalid_client' }), json(401, {}), json(500, {}), new Response('<html>', { status: 200 }), json(200, { id_token: idToken('apple-sub-1') }), json(200, { refresh_token: 'r' }), json(200, { refresh_token: 'r', id_token: idToken(undefined) }), new TypeError('fetch failed')]
    for (const token of cases) {
      const a = apple({ token })
      expect(await run(a)).toEqual({ ok: false, reason: 'apple_error' })
      expect(a.calls.map(c => c.url)).toEqual([APPLE_TOKEN_URL])
    }
  })
  it('a hung Apple is cut by the timeout -> apple_error', async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))))
    expect(await run({ f: f as unknown as typeof fetch, calls: [] }, { timeoutMs: 20 })).toEqual({ ok: false, reason: 'apple_error' })
  })
  it('the code belongs to a DIFFERENT Apple user -> identity_mismatch and the revoke endpoint is NEVER called', async () => {
    const a = apple()
    expect(await run(a, { appleSubjects: ['someone-else'] })).toEqual({ ok: false, reason: 'identity_mismatch' })
    expect(a.calls.map(c => c.url)).toEqual([APPLE_TOKEN_URL])
  })
  it('no known subject for the account -> identity_mismatch (refused, never skipped)', async () => {
    const a = apple()
    expect(await run(a, { appleSubjects: [] })).toEqual({ ok: false, reason: 'identity_mismatch' })
    expect(a.calls.map(c => c.url)).toEqual([APPLE_TOKEN_URL])
  })
  it('revoke not confirmed (400 / 500 / network / timeout) -> apple_error, never ok', async () => {
    for (const revoke of [json(400, { error: 'invalid_request' }), json(500, {}), new TypeError('fetch failed')]) {
      expect(await run(apple({ revoke }))).toEqual({ ok: false, reason: 'apple_error' })
    }
  })
  it('only a 200 from the revoke endpoint counts (204 or 3xx do not)', async () => {
    expect(await run(apple({ revoke: new Response(null, { status: 204 }) }))).toEqual({ ok: false, reason: 'apple_error' })
  })
  it('the outcome never carries a token, code, secret or key', async () => {
    for (const a of [apple(), apple({ token: json(400, { error: 'invalid_grant', error_description: 'RT-secret-0001' }) }), apple({ revoke: json(500, { detail: 'AT-secret-0001' }) })]) {
      const out = JSON.stringify(await run(a))
      for (const secret of ['RT-secret-0001', 'AT-secret-0001', 'code-abc', 'BEGIN PRIVATE KEY', 'TEAM123456', 'KEYID12345']) expect(out).not.toContain(secret)
    }
  })
})

// Optional LIVE, non-secret check that our endpoints still match what Apple advertises (network; off by default, run with APPLE_LIVE_CONFIG_CHECK=1).
describe.runIf(process.env.APPLE_LIVE_CONFIG_CHECK === '1')('live Apple OpenID configuration', () => {
  it('advertises the token and revocation endpoints we call, with client_secret_post', async () => {
    const j = await (await fetch('https://appleid.apple.com/.well-known/openid-configuration')).json() as Record<string, unknown>
    expect(j.token_endpoint).toBe(APPLE_TOKEN_URL)
    expect(j.revocation_endpoint).toBe(APPLE_REVOKE_URL)
    expect(j.token_endpoint_auth_methods_supported).toContain('client_secret_post')
  })
})
