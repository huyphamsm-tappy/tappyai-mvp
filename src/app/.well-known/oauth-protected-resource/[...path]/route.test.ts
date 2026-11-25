// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

const call = (path: string[]) => GET(new Request('http://localhost/x'), { params: { path } })

beforeEach(() => { vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('MCP_RESOURCE_URL', 'https://mcp.test/api/mcp'); vi.stubEnv('MCP_AUTH_SERVER_URL', 'https://auth.test/auth/v1') })
afterEach(() => vi.unstubAllEnvs())

describe('/.well-known/oauth-protected-resource/<resource path> (RFC 9728)', () => {
  it('answers the same document for the real resource path, advertising only scopes the authorization server accepts', async () => {
    const r = await call(['api', 'mcp'])
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ resource: 'https://mcp.test/api/mcp', authorization_servers: ['https://auth.test/auth/v1'], scopes_supported: ['openid', 'profile'] })
  })
  it('404 for any other path, for the root, with the flag off, or with no https resource configured', async () => {
    for (const p of [['api'], ['api', 'mcp', 'x'], ['other'], [], ['..', 'api', 'mcp']]) expect((await call(p)).status, JSON.stringify(p)).toBe(404)
    vi.stubEnv('MCP_GATEWAY', ''); expect((await call(['api', 'mcp'])).status).toBe(404)
    vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('MCP_RESOURCE_URL', 'http://mcp.test/api/mcp'); expect((await call(['api', 'mcp'])).status).toBe(404)
  })
})
