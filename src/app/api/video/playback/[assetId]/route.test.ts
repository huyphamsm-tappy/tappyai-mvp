import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  s: {
    user: null as { id: string } | null,
    rlOk: true,
    order: [] as string[],
    rlKeys: [] as string[],
    outcome: { status: 200, body: { assetId: 'a', manifestUrl: 'https://m/x' }, setCookie: 'Cloud-CDN-Cookie=v; Path=/x/' } as { status: number; body: Record<string, unknown>; setCookie?: string },
    seen: [] as unknown[],
  },
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => { h.s.order.push('auth'); return { user: h.s.user, supabase: {} } } }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async (k: string) => { h.s.order.push('rate'); h.s.rlKeys.push(k); return { ok: h.s.rlOk, retryAfter: 1 } } }))
vi.mock('@/lib/security/rateLimitResponse', () => ({ rateLimitedResponse: () => NextResponse.json({ error: 'rate_limit' }, { status: 429 }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { h.s.order.push('db'); return {} } }))
vi.mock('@/lib/media/video/deliveryStore', () => ({ supabaseVideoDeliveryStore: () => ({ tag: 'store' }) }))
vi.mock('@/lib/media/video/playback', () => ({ issueVideoPlayback: async (input: unknown) => { h.s.order.push('issue'); h.s.seen.push(input); return h.s.outcome } }))

import { POST } from './route'

const ID = '22222222-2222-4222-8222-222222222222'
const req = (body?: unknown) => new NextRequest(`https://www.tappyai.com/api/video/playback/${ID}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: body === undefined ? undefined : JSON.stringify(body) })
const call = (r: NextRequest) => POST(r, { params: { assetId: ID } })
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

beforeEach(() => {
  vi.unstubAllEnvs()
  Object.assign(h.s, { user: null, rlOk: true, order: [], rlKeys: [], seen: [], outcome: { status: 200, body: { assetId: 'a', manifestUrl: 'https://m/x' }, setCookie: 'Cloud-CDN-Cookie=v; Path=/x/' } })
})

describe('POST /api/video/playback/[assetId]', () => {
  it('🚨 is OFF by default: 404 and NOTHING else runs (no auth, no limit, no database)', async () => {
    const res = await call(req())
    expect(res.status).toBe(404)
    expect(h.s.order).toEqual([])
  })

  it('anyone may ask: a visitor is rate-limited by IP, a user by id; the answer is never cached and carries the Set-Cookie', async () => {
    on()
    const visitor = await call(req())
    expect(visitor.status).toBe(200)
    expect(visitor.headers.get('cache-control')).toBe('no-store')
    expect(visitor.headers.get('set-cookie')).toBe('Cloud-CDN-Cookie=v; Path=/x/')
    expect(h.s.rlKeys[0]).toMatch(/^video-playback:ip:/)
    expect(h.s.seen[0]).toMatchObject({ assetId: ID, viewerId: null, native: false })

    h.s.user = { id: 'user-1' }
    await call(req())
    expect(h.s.rlKeys[1]).toBe('video-playback:u:user-1')
    expect(h.s.seen[1]).toMatchObject({ viewerId: 'user-1' })
  })

  it('a native player asks for the cookie in the body with { client: "native" }', async () => {
    on()
    await call(req({ client: 'native' }))
    expect(h.s.seen[0]).toMatchObject({ native: true })
    await call(req({ client: 'something else' }))
    expect(h.s.seen[1]).toMatchObject({ native: false })
  })

  it('a refusal sets no cookie; a rate-limit refusal stops before the database', async () => {
    on()
    h.s.outcome = { status: 404, body: { error: 'not_found' } }
    const refused = await call(req())
    expect(refused.status).toBe(404)
    expect(refused.headers.get('set-cookie')).toBeNull()
    expect((await refused.json()).error).toBe('not_found')

    h.s.order = []; h.s.rlOk = false
    expect((await call(req())).status).toBe(429)
    expect(h.s.order).not.toContain('db')
    expect(h.s.order).not.toContain('issue')
  })
})
