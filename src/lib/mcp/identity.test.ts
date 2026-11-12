import { describe, it, expect, vi } from 'vitest'
import { claimsFromJwtPayload, createSupabaseTokenVerifier, bearerOf, decodeJwtPayload, protectedResourceMetadata, MCP_SCOPES, type ClientRegistry } from './identity'
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
    expect(claimsFromJwtPayload(payload({ aud: 'authenticated' }), opts)!.audience).not.toBe(AUD) // a plain Supabase session token is not an MCP token
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
  it('a token for another audience (a plain Supabase session token) gets 401', async () => {
    const t = jwt(payload({ aud: 'authenticated' }))
    const r = await call(deps(async () => ({ id: SUB_A })), t, 'search_places', { query: 'pho' })
    expect(r.status).toBe(401)
  })
  it('a token without the tool scope is ACCESS_DENIED', async () => {
    const t = jwt(payload({ scope: 'shopping:read' }))
    expect(sc(await call(deps(async () => ({ id: SUB_A })), t, 'search_places', { query: 'pho', latitude: 10.77, longitude: 106.7 })).error.code).toBe('ACCESS_DENIED')
  })
})

describe('protected resource metadata (RFC 9728)', () => {
  it('is built from configuration and advertises only what exists', () => {
    const m = protectedResourceMetadata({ MCP_RESOURCE_URL: AUD, MCP_AUTH_SERVER_URL: 'https://auth.example/auth/v1' })!
    expect(m).toEqual({ resource: AUD, authorization_servers: ['https://auth.example/auth/v1'], scopes_supported: [...MCP_SCOPES], bearer_methods_supported: ['header'], resource_name: 'TappyAI MCP' })
  })
  it('is null (the route 404s) when the resource or the authorization server is not configured or not https', () => {
    expect(protectedResourceMetadata({})).toBeNull()
    expect(protectedResourceMetadata({ MCP_RESOURCE_URL: AUD })).toBeNull()
    expect(protectedResourceMetadata({ MCP_RESOURCE_URL: 'http://x.example', MCP_AUTH_SERVER_URL: 'https://a.example' })).toBeNull()
  })
})
