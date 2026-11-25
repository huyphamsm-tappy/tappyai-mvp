import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_REDIRECT_RULES, hostForRedirects, parseRedirectRules, createClientResolver } from './clientApproval'
import { createSupabaseTokenVerifier, type ClientRegistry } from './identity'

const CID = 'c20558f1-e1bf-4315-997a-4cb2f54e627e'
const CID2 = 'd30669f2-f2c0-4426-a08b-5dc3f65f738f'

describe('which Host a client is, by where it redirects', () => {
  it('a client whose redirect URIs are all one known Host\'s own is that Host', () => {
    expect(hostForRedirects(['https://claude.ai/api/mcp/auth_callback'])).toBe('claude')
    expect(hostForRedirects(['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'])).toBe('claude')
    expect(hostForRedirects(['https://chatgpt.com/connector_platform_oauth_redirect'])).toBe('chatgpt')
    expect(hostForRedirects(['https://chatgpt.com/connector/oauth/OhSOCbKrr4gZ'])).toBe('chatgpt') // the address ChatGPT really registered on 23/11/2026
    expect(hostForRedirects(['cursor://anysphere.cursor-mcp/oauth/callback'])).toBe('cursor')
  })
  it('anything else is NOT approved: another site, a look-alike host, a mix of Hosts, localhost, wrong scheme, none, too many, junk', () => {
    const no: unknown[] = [
      ['https://evil.example/cb'], ['https://claude.ai.evil.example/api/mcp/auth_callback'], ['https://evil.example/https://claude.ai/api/mcp/auth_callback'],
      ['https://claude.ai/api/mcp/auth_callback', 'https://evil.example/cb'], ['https://claude.ai/api/mcp/auth_callback', 'https://chatgpt.com/connector_platform_oauth_redirect'],
      ['https://chatgpt.com/connector/oauth/'], ['https://chatgpt.com.evil.example/connector/oauth/abc'], ['http://chatgpt.com/connector/oauth/abc'], ['https://chatgpt.com/connector/oauthx/abc'], ['https://evil.example/connector/oauth/abc'],
      ['http://localhost:8788/cb'], ['http://claude.ai/api/mcp/auth_callback'], ['https://claude.ai/api/mcp/auth_callback/extra'], ['cursor://anysphere.cursor-mcp/'], ['cursor://evil/oauth/callback'],
      [], 'https://claude.ai/api/mcp/auth_callback', null, undefined, [5], [''], ['https://claude.ai/api/mcp/auth_callback ' + 'x'], Array.from({ length: 6 }, () => 'https://claude.ai/api/mcp/auth_callback'),
    ]
    for (const v of no) expect(hostForRedirects(v), JSON.stringify(v)).toBeNull()
  })
  it('only the three Hosts with a known callback have default rules; the rest are NOT approvable until their real callback is seen', () => {
    expect(Object.keys(DEFAULT_REDIRECT_RULES).sort()).toEqual(['chatgpt', 'claude', 'cursor'])
    for (const h of ['gemini', 'grok', 'deepseek', 'meta']) expect(hostForRedirects(['https://anything.example/cb'], { [h]: {} })).toBeNull()
  })
  it('MCP_REDIRECT_RULES replaces a Host\'s rules and is ignored when malformed', () => {
    const r = parseRedirectRules(JSON.stringify({ grok: { exact: ['https://grok.x.ai/cb'] }, claude: { exact: ['https://claude.ai/custom'] }, nonsense: { exact: ['https://a.example/'] } }))
    expect(hostForRedirects(['https://grok.x.ai/cb'], r)).toBe('grok')
    expect(hostForRedirects(['https://claude.ai/api/mcp/auth_callback'], r)).toBeNull() // replaced
    expect(hostForRedirects(['https://claude.ai/custom'], r)).toBe('claude')
    for (const bad of ['{', '[]', '"x"', 'null', '']) expect(parseRedirectRules(bad)).toBe(DEFAULT_REDIRECT_RULES)
  })
})

describe('loopback redirects (a client installed on the person\'s own machine) are OFF by default and ON only for the Host the owner names', () => {
  const LOOP = ['http://localhost:54321/callback']
  it('off by default for every Host', () => { expect(hostForRedirects(LOOP)).toBeNull(); expect(hostForRedirects(['http://127.0.0.1:5555/cb'])).toBeNull() })
  it('MCP_REDIRECT_RULES can switch it on for one Host; only a real loopback URL with a port counts', () => {
    const rules = parseRedirectRules(JSON.stringify({ claude: { exact: ['https://claude.ai/api/mcp/auth_callback'], loopback: true } }))
    for (const ok of [LOOP, ['http://127.0.0.1:5555/cb'], ['http://[::1]:7000/x'], [...LOOP, 'https://claude.ai/api/mcp/auth_callback']]) expect(hostForRedirects(ok, rules), JSON.stringify(ok)).toBe('claude')
    for (const no of [['http://localhost/cb'], ['https://localhost:5555/cb'], ['http://localhost.evil.example:5555/cb'], ['http://user:pw@localhost:5555/cb'], ['http://evil.example:5555/cb'], ['http://localhost:5555/cb', 'https://evil.example/cb']]) expect(hostForRedirects(no, rules), JSON.stringify(no)).toBeNull()
    expect(hostForRedirects(LOOP, parseRedirectRules(JSON.stringify({ claude: { exact: [], loopback: 'yes' } })))).toBeNull() // only the boolean true
  })
})

describe('the resolver', () => {
  it('approves a registered Host client, caches it, and refuses non-UUID ids before any lookup', async () => {
    const lookup = vi.fn(async () => ({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }))
    const r = createClientResolver({ lookup })
    expect(await r(CID)).toEqual({ host: 'claude' }); expect(await r(CID)).toEqual({ host: 'claude' })
    expect(lookup).toHaveBeenCalledTimes(1)
    for (const bad of ['', 'not-a-uuid', '../../admin', CID + 'x']) expect(await r(bad), bad).toBeNull()
    expect(lookup).toHaveBeenCalledTimes(1)
  })
  it('a lookup that fails, answers nothing or an unknown app is NOT approved, and a "no" is only remembered briefly', async () => {
    let t = 0; const now = () => t
    const lookup = vi.fn(async () => { throw new Error('down') })
    const r = createClientResolver({ lookup, now })
    expect(await r(CID)).toBeNull(); expect(await r(CID)).toBeNull(); expect(lookup).toHaveBeenCalledTimes(1)
    t = 61_000; expect(await r(CID)).toBeNull(); expect(lookup).toHaveBeenCalledTimes(2)
    const other = createClientResolver({ lookup: async () => ({ redirect_uris: ['https://evil.example/cb'] }) })
    expect(await other(CID2)).toBeNull()
    expect(await createClientResolver({ lookup: async () => null })(CID2)).toBeNull()
  })
})

describe('the gateway verifier uses it, and a hand-written registry entry still wins', () => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const NOW = new Date('2026-11-23T03:00:00Z'), AUD = 'https://mcp.test/api/mcp'
  const SUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const tok = (cid: string) => `Bearer ${b64({ alg: 'ES256' })}.${b64({ sub: SUB, aud: 'authenticated', exp: NOW.getTime() / 1000 + 3600, client_id: cid, scope: 'openid profile' })}.sig`
  const mk = (registry: ClientRegistry, resolveClient?: (id: string) => Promise<{ host: 'claude' } | null>) =>
    createSupabaseTokenVerifier({ expectedAudience: AUD, registry, now: () => NOW, getUser: async () => ({ id: SUB }), ...(resolveClient ? { resolveClient } : {}) })
  it('an unlisted client is admitted only when the resolver approves it; the Host comes from the resolver', async () => {
    expect((await mk({}, async () => ({ host: 'claude' }))(tok(CID)))?.host).toBe('claude')
    expect(await mk({}, async () => null)(tok(CID))).toBeNull()
    expect(await mk({}, async () => { throw new Error('x') })(tok(CID))).toBeNull()
    expect(await mk({})(tok(CID))).toBeNull() // no resolver at all: the registry alone decides
  })
  it('a hand-written entry is used as written and the resolver is not even asked', async () => {
    const resolve = vi.fn(async () => ({ host: 'claude' as const }))
    expect((await mk({ [CID]: { host: 'claude', scopes: ['places:read'] } }, resolve)(tok(CID)))?.scopes).toEqual(['places:read'])
    expect(resolve).not.toHaveBeenCalled()
  })
})
