// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ resolve: vi.fn(), approvalResolver: vi.fn() }))
vi.mock('@/lib/mcp/approvalWiring', () => ({ approvalResolver: (...a: unknown[]) => h.approvalResolver(...a) }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: true, retryAfter: 0 }) }))

import { NextRequest } from 'next/server'
import { GET } from './route'

const CID = 'c20558f1-e1bf-4315-997a-4cb2f54e627e'
const call = (id?: string) => GET(new NextRequest(`http://localhost/api/oauth/client-approval${id === undefined ? '' : `?client_id=${id}`}`))

beforeEach(() => { vi.clearAllMocks(); h.approvalResolver.mockReturnValue(h.resolve); h.resolve.mockResolvedValue({ host: 'claude' }); vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('MCP_OAUTH_CLIENTS', '') })
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/oauth/client-approval', () => {
  it('404 with the gateway flag off: the route does not exist and does no work', async () => {
    vi.stubEnv('MCP_GATEWAY', '')
    expect((await call(CID)).status).toBe(404)
    expect(h.resolve).not.toHaveBeenCalled()
  })
  it('one boolean and nothing else, true only when the resolver approves', async () => {
    expect(await (await call(CID)).json()).toEqual({ approved: true })
    h.resolve.mockResolvedValue(null)
    expect(await (await call(CID)).json()).toEqual({ approved: false })
    h.resolve.mockRejectedValue(new Error('down'))
    expect(await (await call(CID)).json()).toEqual({ approved: false })
    h.approvalResolver.mockReturnValue(null) // no admin lookup configured
    expect(await (await call(CID)).json()).toEqual({ approved: false })
  })
  it('a missing or malformed client id is false and never reaches the resolver', async () => {
    for (const id of [undefined, '', 'x', '../../etc', CID + 'x']) expect(await (await call(id)).json(), String(id)).toEqual({ approved: false })
    expect(h.resolve).not.toHaveBeenCalled()
  })
  it('a client written by hand in MCP_OAUTH_CLIENTS is approved without asking the resolver', async () => {
    vi.stubEnv('MCP_OAUTH_CLIENTS', JSON.stringify({ [CID]: { host: 'cursor' } }))
    expect(await (await call(CID)).json()).toEqual({ approved: true })
    expect(h.resolve).not.toHaveBeenCalled()
  })
})
