import { describe, it, expect, vi } from 'vitest'
import { claimsFromJwtPayload, createSupabaseTokenVerifier, bearerOf, decodeJwtPayload, protectedResourceMetadata, resourcePath, MCP_SCOPES, type ClientRegistry } from './identity'
import { handleMcpRequest, type GatewayDeps } from './gateway'
import { createSpendPool } from './spendPool'
import { createInMemoryJobStore } from './jobs'
import { createAbuseMonitor } from './abuseGuard'
import { NO_ADAPTERS } from './serviceMap'

const NOW = new Date('2026-11-11T03:00:00Z')
const AUD = 'https://mcp.test/api/mcp'
const REG: ClientRegistry = { 'cid-one': { host: 'claude' }, 'cid-two': { host: 'chatgpt' } }
const SUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const payload = (o: Record<string, unknown> = {}) => ({ sub: SUB_A, aud: AUD, exp: NOW.getTime() / 1000 + 3600, client_id: 'cid-one', scope: 'places:read hotels:read', is_anonymous: false, ...o })
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (p: Record<string, unknown>) => `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(p)}.sig`
const opts = { expectedAudience: AUD, registry: REG, now: () => NOW }

describe('claimsFromJwtPayload: deterministic principal mapping (R13 10.7)', () => {
  it('maps a linked-user token: userId only from sub, host from the REGISTERED client, install = host + client, principal scoped to the user', () => {
    const c = claimsFromJwtPayload(payload(), opts)!
    expect(c).toMatchObject({ audience: AUD, host: 'claude', installId: 'claude:cid-one', userId: SUB_A, principalId: `u:${SUB_A}`, revoked: false })
    expect(c.scopes).toEqual(['places:read', 'hotels:read'])
  })
  it('the four identities stay distinct: platform, installation, linked user, anonymous principal', () => {
    const linked = claimsFromJwtPayload(payload(), opts)!
    const anon = claimsFromJwtPayload(payload({ sub: SUB_B, is_anonymous: true }), opts)!
    const other = claimsFromJwtPayload(payload({ client_id: 'cid-two' }), opts)!
    expect(anon.userId).toBeNull(); expect(anon.principalId).toBe(`a:${SUB_B}`)
    expect(linked.principalId).not.toBe(anon.principalId)
    expect(other.host).toBe('chatgpt'); expect(other.installId).not.toBe(linked.installId); expect(other.principalId).toBe(linked.principalId) // same person, different Host install
    expect(new Set([linked.host, linked.installId, linked.userId, anon.principalId]).size).toBe(4)
  })
  it('an unregistered client is refused (a connector nobody registered has no identity)', () => {
    expect(claimsFromJwtPayload(payload({ client_id: 'client-unknown' }), opts)).toBeNull()
    expect(claimsFromJwtPayload(payload({ client_id: undefined }), opts)).toBeNull()
  })
  it('a Host cannot choose its own identity: host/user/principal/install claims inside the token are ignored', () => {
    const c = claimsFromJwtPayload(payload({ host: 'gemini', userId: 'victim', principalId: 'u:victim', installId: 'x', user_metadata: { host: 'gemini', user_id: 'victim' } }), opts)!
    expect(c.host).toBe('claude'); expect(c.userId).toBe(SUB_A); expect(c.principalId).toBe(`u:${SUB_A}`)
  })
  it('only the known scopes survive; unknown ones are dropped and never widen anything', () => {
    const c = claimsFromJwtPayload(payload({ scope: 'places:read admin:all service_role itinerary:create openid' }), opts)!
    expect([...c.scopes].sort()).toEqual(['itinerary:create', 'places:read'])
    for (const s of c.scopes) expect(MCP_SCOPES).toContain(s)
    expect(claimsFromJwtPayload(payload({ scope: undefined }), opts)!.scopes).toEqual([])
  })
  it('audience: a string or array containing the resource passes; anything else is reported as another audience so admission refuses it', () => {
    expect(claimsFromJwtPayload(payload({ aud: [AUD, 'other'] }), opts)!.audience).toBe(AUD)
    expect(claimsFromJwtPayload(payload({ aud: 'https://other.example' }), opts)!.audience).not.toBe(AUD)
    expect(claimsFromJwtPayload(payload({ aud: undefined }), opts)!.audience).not.toBe(AUD)
    // 22/11/2026, seen on a real token: Supabase's OAuth server always issues aud "authenticated". What ties such a token to the connector is the REGISTERED client_id, so with one it is accepted ...
    expect(claimsFromJwtPayload(payload({ aud: 'authenticated' }), opts)!.audience).toBe(AUD)
    // ... and WITHOUT one (a plain web / native session token) it is no MCP token at all
    expect(claimsFromJwtPayload(payload({ aud: 'authenticated', client_id: undefined }), opts)).toBeNull()
    expect(claimsFromJwtPayload(payload({ aud: 'authenticated', client_id: 'cid-unregistered' }), opts)).toBeNull()
  })
  it('a real Supabase OAuth token ("openid profile") gets the scopes of its REGISTERED client: all MCP scopes by default, or the narrower list the registry names; never more, never from the token', () => {
    const real = { aud: 'authenticated', scope: 'openid profile' }
    expect([...claimsFromJwtPayload(payload(real), opts)!.scopes].sort()).toEqual([...MCP_SCOPES].sort())
    const narrow: ClientRegistry = { 'cid-one': { host: 'claude', scopes: ['places:read'] } }
    expect(claimsFromJwtPayload(payload(real), { ...opts, registry: narrow })!.scopes).toEqual(['places:read'])
    // a token that asks for something that is not an identity scope gets nothing from the default
    expect(claimsFromJwtPayload(payload({ ...real, scope: 'admin:all' }), opts)!.scopes).toEqual([])
    expect(claimsFromJwtPayload(payload({ ...real, scope: 'openid admin:all' }), opts)!.scopes).toEqual([])
    expect(claimsFromJwtPayload(payload({ ...real, scope: undefined }), opts)!.scopes).toEqual([])
    // if a token ever DOES carry our scopes, those (and only those) are used
    expect(claimsFromJwtPayload(payload({ ...real, scope: 'openid shopping:read' }), opts)!.scopes).toEqual(['shopping:read'])
  })
  it('the registry reads an optional scopes list and ignores anything that is not a list of known scopes', async () => {
    const { parseClientRegistry } = await import('./identity')
    const reg = parseClientRegistry(JSON.stringify({ a: { host: 'cursor', scopes: ['places:read', 'root', 5] }, b: { host: 'grok' }, c: { host: 'meta', scopes: 'places:read' } }))
    expect(reg.a).toEqual({ host: 'cursor', scopes: ['places:read'] }); expect(reg.b).toEqual({ host: 'grok' }); expect(reg.c).toEqual({ host: 'meta' })
  })
  it('missing or malformed sub / exp are refused', () => {
    for (const bad of [{ sub: undefined }, { sub: '' }, { sub: 'not-a-uuid' }, { exp: undefined }, { exp: 'soon' }]) expect(claimsFromJwtPayload(payload(bad), opts)).toBeNull()
  })
})

describe('bearer and JWT parsing', () => {
  it('accepts only a well-formed Bearer header of bounded size', () => {
    expect(bearerOf('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    for (const bad of [null, '', 'Basic abc', 'Bearer', 'Bearer ', 'bearer abc', 'Bearer a b', 'Bearer ' + 'a'.repeat(5000), 'Bearer a\nb']) expect(bearerOf(bad as never)).toBeNull()
  })
  it('decodes a payload without trusting it, and refuses garbage', () => {
    expect(decodeJwtPayload(jwt({ a: 1 }))).toEqual({ a: 1 })
    for (const bad of ['', 'a.b', 'a.!!!.c', `x.${Buffer.from('[1]').toString('base64url')}.z`, `x.${Buffer.from('nope').toString('base64url')}.z`]) expect(decodeJwtPayload(bad)).toBeNull()
  })
})

describe('Supabase token verifier: the identity provider is asked on EVERY request', () => {
  it('a token the identity provider accepts becomes claims', async () => {
    const getUser = vi.fn(async () => ({ id: SUB_A, is_anonymous: false }))
    const v = createSupabaseTokenVerifier({ ...opts, getUser })
    const c = await v(`Bearer ${jwt(payload())}`)
    expect(c?.principalId).toBe(`u:${SUB_A}`)
    await v(`Bearer ${jwt(payload())}`)
    expect(getUser).toHaveBeenCalledTimes(2)
  })
  it('revoked, expired, forged: the provider says no, so the answer is null (the payload alone is never believed)', async () => {
    const v = createSupabaseTokenVerifier({ ...opts, getUser: async () => null })
    expect(await v(`Bearer ${jwt(payload())}`)).toBeNull()
  })
  it('a provider error or outage is a refusal, never a pass', async () => {
    const v = createSupabaseTokenVerifier({ ...opts, getUser: async () => { throw new Error('auth down') } })
    expect(await v(`Bearer ${jwt(payload())}`)).toBeNull()
  })
  it('the provider\'s user must be the token\'s sub (a payload swapped onto another valid token is refused)', async () => {
    const v = createSupabaseTokenVerifier({ ...opts, getUser: async () => ({ id: SUB_B }) })
    expect(await v(`Bearer ${jwt(payload())}`)).toBeNull()
  })
  it('does not call the provider for a header that is not a bearer token', async () => {
    const getUser = vi.fn(async () => ({ id: SUB_A }))
    const v = createSupabaseTokenVerifier({ ...opts, getUser })
    expect(await v(null)).toBeNull(); expect(await v('Basic abc')).toBeNull(); expect(await v('Bearer not-a-jwt')).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })
})

describe('end to end through the Gateway: cross-principal and wrong-audience tokens', () => {
  const deps = (getUser: (t: string) => Promise<{ id: string; is_anonymous?: boolean } | null>): GatewayDeps => ({
    verify: createSupabaseTokenVerifier({ ...opts, getUser }), expectedAudience: AUD, adapters: { ...NO_ADAPTERS },
    spend: createSpendPool({ env: {} }), jobs: createInMemoryJobStore(() => NOW), abuse: createAbuseMonitor({ now: () => NOW }),
    rateLimit: async () => ({ ok: true, retryAfter: 0 }), now: () => NOW, log: () => {}, allowedOrigins: [],
  })
  const call = (d: GatewayDeps, token: string, name: string, args: unknown) => handleMcpRequest({ authorization: `Bearer ${token}`, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } }, d)
  const sc = (r: { body: unknown }) => ((r.body as { result: { structuredContent: Record<string, any> } }).result.structuredContent)

  it('user B cannot read or cancel user A\'s job; each token resolves only to its own principal', async () => {
    const tokenA = jwt(payload({ scope: 'itinerary:create' })); const tokenB = jwt(payload({ sub: SUB_B, scope: 'itinerary:create' }))
    const d = deps(async t => ({ id: t === tokenA ? SUB_A : SUB_B }))
    const created = await call(d, tokenA, 'create_itinerary_job', { destination: 'Huế', days: 2 })
    const id = sc(created).job_id
    expect(id).toMatch(/^job_/)
    for (const n of ['get_itinerary_job_status', 'get_itinerary_job_result', 'cancel_itinerary_job']) expect(sc(await call(d, tokenB, n, { job_id: id })).error.code).toBe('JOB_NOT_FOUND')
    expect(sc(await call(d, tokenA, 'get_itinerary_job_status', { job_id: id })).status).toBe('queued')
  })
  it('a token for another audience gets 401, and so does a plain Supabase session token (no client_id)', async () => {
    for (const t of [jwt(payload({ aud: 'https://other.example' })), jwt(payload({ aud: 'authenticated', client_id: undefined }))]) {
      const r = await call(deps(async () => ({ id: SUB_A })), t, 'search_places', { query: 'pho' })
      expect(r.status).toBe(401)
    }
  })
  it('a real Supabase OAuth token (aud authenticated, scope "openid profile", registered client_id) is admitted: the connector grant comes from the registry', async () => {
    const t = jwt(payload({ aud: 'authenticated', scope: 'openid profile' }))
    const r = await call(deps(async () => ({ id: SUB_A })), t, 'search_places', { query: 'pho', latitude: 10.77, longitude: 106.7 })
    expect(r.status).toBe(200)
  })
  it('a token without the tool scope is ACCESS_DENIED', async () => {
    const t = jwt(payload({ scope: 'shopping:read' }))
    expect(sc(await call(deps(async () => ({ id: SUB_A })), t, 'search_places', { query: 'pho', latitude: 10.77, longitude: 106.7 })).error.code).toBe('ACCESS_DENIED')
  })
})

describe('protected resource metadata (RFC 9728)', () => {
  it('is built from configuration and advertises only what exists', () => {
    const m = protectedResourceMetadata({ MCP_RESOURCE_URL: AUD, MCP_AUTH_SERVER_URL: 'https://auth.example/auth/v1' })!
    // the scopes advertised are the ones the authorization server ACCEPTS (found live with ChatGPT: Supabase answers "unsupported scope: places:read" to anything but OpenID names)
    expect(m).toEqual({ resource: AUD, authorization_servers: ['https://auth.example/auth/v1'], scopes_supported: ['openid', 'profile'], bearer_methods_supported: ['header'], resource_name: 'TappyAI MCP' })
    for (const s of m.scopes_supported as string[]) expect(MCP_SCOPES as readonly string[]).not.toContain(s)
  })
  it('the path of the resource, for the RFC 9728 path-specific address; null when it is not https', () => {
    expect(resourcePath({ MCP_RESOURCE_URL: AUD })).toBe('/api/mcp')
    for (const v of [undefined, '', 'http://x.example/api/mcp', 'not a url']) expect(resourcePath({ MCP_RESOURCE_URL: v })).toBeNull()
  })
  it('is null (the route 404s) when the resource or the authorization server is not configured or not https', () => {
    expect(protectedResourceMetadata({})).toBeNull()
    expect(protectedResourceMetadata({ MCP_RESOURCE_URL: AUD })).toBeNull()
    expect(protectedResourceMetadata({ MCP_RESOURCE_URL: 'http://x.example', MCP_AUTH_SERVER_URL: 'https://a.example' })).toBeNull()
  })
})
