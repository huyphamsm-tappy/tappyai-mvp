import { describe, it, expect, afterEach, vi } from 'vitest'
import { GET } from './route'

const req = (auth?: string) => new Request('http://localhost/api/cron/mcp-jobs', { headers: auth ? { authorization: auth } : {} })
afterEach(() => vi.unstubAllEnvs())

describe('/api/cron/mcp-jobs', () => {
  it('404 with the flag off, whatever the credentials', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    expect((await GET(req('Bearer test-secret'))).status).toBe(404)
  })
  it('404 in a production runtime even with the flag on', async () => {
    vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('CRON_SECRET', 'test-secret')
    expect((await GET(req('Bearer test-secret'))).status).toBe(404)
  })
  it('401 without the cron secret (and when no secret is configured)', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    expect((await GET(req('Bearer anything'))).status).toBe(401)
    vi.stubEnv('CRON_SECRET', 'test-secret')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
  })
  it('503 when the persisted store is not enabled: the worker does nothing without the owner having applied the migration', async () => {
    vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('CRON_SECRET', 'test-secret')
    const r = await GET(req('Bearer test-secret'))
    expect(r.status).toBe(503)
    expect(((await r.json()) as { error: string }).error).toBe('jobs_disabled')
  })
})
