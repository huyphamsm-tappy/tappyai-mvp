import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { signToken, buildTrackedLink } from '@/lib/mcp/attribution'

const SECRET = 'test-secret-test-secret-test-secret-0123456789'
const BASE = 'https://tappy.example'
const link = (dest = 'https://www.agoda.com/hotel/x') => buildTrackedLink({ baseUrl: BASE, secret: SECRET, host: 'claude', tool: 'search_hotels', ref: 'r1', dest, now: new Date() })!
const tokenOf = (l: string) => l.split('/go/m/')[1]
const get = (token: string, headers: Record<string, string> = {}) => GET(new NextRequest(`${BASE}/go/m/${token}`, { headers }), { params: { token } })
const on = () => { vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('MCP_ATTRIBUTION_SECRET', SECRET); vi.stubEnv('MCP_RESOURCE_URL', `${BASE}/api/mcp`) }
afterEach(() => vi.unstubAllEnvs())

describe('/go/m/<token>', () => {
  it('404 with the flag off, in production, or without a configured secret', async () => {
    vi.stubEnv('MCP_ATTRIBUTION_SECRET', SECRET); vi.stubEnv('MCP_RESOURCE_URL', `${BASE}/api/mcp`)
    expect((await get(tokenOf(link()))).status).toBe(404)
    vi.stubEnv('MCP_GATEWAY', '1'); vi.stubEnv('VERCEL_ENV', 'production')
    expect((await get(tokenOf(link()))).status).toBe(404)
    vi.unstubAllEnvs(); vi.stubEnv('MCP_GATEWAY', '1')
    expect((await get(tokenOf(link()))).status).toBe(404)
  })
  it('a valid link redirects (302) to exactly the signed destination, no cookies, no referrer, no cache', async () => {
    on()
    const r = await get(tokenOf(link()), { cookie: 'sb-session=SECRETCOOKIE', authorization: 'Bearer abc' })
    expect(r.status).toBe(302); expect(r.headers.get('location')).toBe('https://www.agoda.com/hotel/x')
    expect(r.headers.get('set-cookie')).toBeNull(); expect(r.headers.get('cache-control')).toBe('no-store'); expect(r.headers.get('referrer-policy')).toBe('no-referrer')
  })
  it('User A\'s link opened by User B (or by nobody logged in) behaves identically: the response does not depend on who opens it', async () => {
    on(); const t = tokenOf(link())
    const asB = await get(t, { cookie: 'sb-session=B', authorization: 'Bearer B' }); const anon = await get(t)
    expect(asB.status).toBe(anon.status); expect(asB.headers.get('location')).toBe(anon.headers.get('location'))
  })
  it('a forged, tampered or off-allowlist token never redirects off-site: it goes to the home page', async () => {
    on()
    const evil = signToken({ v: 1, ch: 'claude_mcp', tool: 't', ref: 'r', dest: 'https://evil.example/x', iat: Math.floor(Date.now() / 1000) }, SECRET)
    const wrongSecret = signToken({ v: 1, ch: 'claude_mcp', tool: 't', ref: 'r', dest: 'https://www.agoda.com/x', iat: Math.floor(Date.now() / 1000) }, 'another-secret-another-secret-another-0123456')
    for (const bad of [evil, wrongSecret, 'garbage', tokenOf(link()).slice(0, -3) + 'AAA']) {
      const r = await get(bad); expect(r.status).toBe(302); expect(new URL(r.headers.get('location')!).origin).toBe(BASE); expect(new URL(r.headers.get('location')!).pathname).toBe('/')
    }
  })
})
