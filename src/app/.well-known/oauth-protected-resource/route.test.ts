import { describe, it, expect, afterEach, vi } from 'vitest'
import { GET } from './route'

afterEach(() => vi.unstubAllEnvs())

describe('/.well-known/oauth-protected-resource', () => {
  it('404 with the flag off, even when configured', async () => {
    vi.stubEnv('MCP_RESOURCE_URL', 'https://mcp.test/api/mcp'); vi.stubEnv('MCP_AUTH_SERVER_URL', 'https://auth.test')
    expect((await GET()).status).toBe(404)
  })
  it('404 with the flag on but not configured; 404 in production', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    expect((await GET()).status).toBe(404)
    vi.stubEnv('MCP_RESOURCE_URL', 'https://mcp.test/api/mcp'); vi.stubEnv('MCP_AUTH_SERVER_URL', 'https://auth.test'); vi.stubEnv('VERCEL_ENV', 'production')
    expect((await GET()).status).toBe(404)
  })
  it('200 with the metadata when flag on and configured', async () => {
    vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('MCP_RESOURCE_URL', 'https://mcp.test/api/mcp'); vi.stubEnv('MCP_AUTH_SERVER_URL', 'https://auth.test')
    const r = await GET()
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ resource: 'https://mcp.test/api/mcp', authorization_servers: ['https://auth.test'] })
  })
})
