import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET, DELETE } from './route'

const url = 'http://localhost/api/mcp'
const post = (body: string, headers: Record<string, string> = {}) => new NextRequest(url, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } })
const ping = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })

afterEach(() => vi.unstubAllEnvs())

describe('/api/mcp behind MCP_GATEWAY', () => {
  it('flag OFF (the default): the route does not exist (404) for every method, and does no work', async () => {
    for (const r of [await POST(post(ping)), await GET(new NextRequest(url)), await DELETE(new NextRequest(url, { method: 'DELETE' }))]) expect(r.status).toBe(404)
  })
  it('the flag is locked in a production runtime', async () => {
    vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('VERCEL_ENV', 'production')
    expect((await POST(post(ping))).status).toBe(404)
  })
  it('flag ON but no token verifier installed: every request is 401 with a challenge (fail closed)', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    const r = await POST(post(ping, { authorization: 'Bearer anything' }))
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toMatch(/^Bearer/)
    expect(((await r.json()) as { code: string }).code).toBe('AUTH_REQUIRED')
  })
  it('GET and DELETE are 405 (stateless: no SSE stream, no session to terminate)', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    for (const r of [await GET(new NextRequest(url)), await DELETE(new NextRequest(url, { method: 'DELETE' }))]) { expect(r.status).toBe(405); expect(r.headers.get('allow')).toBe('POST') }
  })
  it('an oversized body is 413 before it is parsed', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    expect((await POST(post('x'.repeat(200_000)))).status).toBe(413)
  })
  it('an Origin header that is not allowlisted is 403 (no allowlist configured = every browser origin refused)', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    expect((await POST(post(ping, { origin: 'https://evil.example' }))).status).toBe(403)
  })
  it('a flood from one client is cut off with 429 before any token check (IP burst cap)', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    const statuses: number[] = []
    for (let i = 0; i < 130; i++) statuses.push((await POST(post(ping, { 'x-forwarded-for': '203.0.113.77', 'x-real-ip': '203.0.113.77' }))).status)
    expect(statuses.slice(0, 100).every(s => s === 401)).toBe(true)
    expect(statuses).toContain(429)
  })
  it('never sets a session id or an event stream', async () => {
    vi.stubEnv('MCP_GATEWAY', '1')
    const r = await POST(post(ping))
    expect(r.headers.get('mcp-session-id')).toBeNull()
    expect(r.headers.get('content-type')).toMatch(/application\/json/)
  })
})
