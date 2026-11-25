import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ ok: true, keys: [] as string[] }))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: async (key: string) => { h.keys.push(key); return { ok: h.ok, retryAfter: 3, scope: 'process' } },
}))

import { GET } from './route'

const req = () => new NextRequest('https://uat.tappyai.com/api/auth/zalo?returnTo=%2Fdeals', {
  headers: { 'x-vercel-forwarded-for': '203.0.113.5', host: 'uat.tappyai.com' },
})

beforeEach(() => { h.ok = true; h.keys = []; vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('GET /api/auth/zalo', () => {
  it('starts the flow with the app id read at request time', async () => {
    vi.stubEnv('ZALO_APP_ID', 'app-123')
    const res = await GET(req())
    expect(res.headers.get('location')).toContain('app_id=app-123')
    expect(h.keys).toEqual(['auth-zalo:203.0.113.5'])
  })

  it('a missing ZALO_APP_ID answers zalo_unavailable (never app_id=undefined) and logs the name only', async () => {
    vi.stubEnv('ZALO_APP_ID', '')
    const res = await GET(req())
    expect(res.headers.get('location')).toBe('https://uat.tappyai.com/login?error=zalo_unavailable')
    expect(JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls)).toContain('ZALO_APP_ID')
  })

  it('is rate-limited per IP: a refusal never reaches Zalo', async () => {
    vi.stubEnv('ZALO_APP_ID', 'app-123')
    h.ok = false
    const res = await GET(req())
    expect(res.headers.get('location')).toBe('https://uat.tappyai.com/login?error=rate_limited')
  })
})
