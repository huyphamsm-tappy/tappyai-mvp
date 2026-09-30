import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Security audit 2026-09-30 · /go/at is not an open redirect, and its limiter keys on the platform IP ──
//
// 020ff56 moved the limiter off the caller-written x-forwarded-for. These tests drive the real
// route: a link is honoured only when signed by CCP_ATTRIBUTION_SECRET and pointing at an
// ACCESSTRADE host; and rotating x-forwarded-for does not buy a fresh allowance.

const h = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[] }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async (row: Record<string, unknown>) => { h.inserts.push(row); return { error: null } } }) }),
}))

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const DEEP = 'https://go.isclix.com/deep_link/123/456?url=https%3A%2F%2Fshopee.vn%2Fp%2F1'

let GET: (req: NextRequest) => Promise<Response>
let buildClickUrl: typeof import('@/lib/ccp/tracking/clickLink').buildClickUrl
let sealIdentity: typeof import('@/lib/ccp/tracking/clickLink').sealIdentity

beforeEach(async () => {
  vi.stubEnv('CCP_ATTRIBUTION_SECRET', SECRET)
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
  vi.resetModules()
  ;({ GET } = await import('./route'))
  ;({ buildClickUrl, sealIdentity } = await import('@/lib/ccp/tracking/clickLink'))
  h.inserts = []
})
afterEach(() => { vi.unstubAllEnvs() })

const signed = () => buildClickUrl({ wrapperUrl: DEEP, providerId: 'shopee', seal: sealIdentity('user-12345678') })!
const hit = (url: string, headers: Record<string, string> = {}) => GET(new NextRequest(url, { headers }))

describe('GET /go/at', () => {
  it('a signed ACCESSTRADE link goes to the merchant with a fresh sub1, recorded server-side', async () => {
    const res = await hit(signed(), { 'x-vercel-forwarded-for': '203.0.113.10' })
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.host).toBe('go.isclix.com')
    expect(loc.searchParams.get('sub1')).toMatch(/^[0-9a-f]{24}$/)
    expect(h.inserts).toHaveLength(1)
  })

  it.each([
    ['unsigned, attacker destination', (u: URL) => { u.searchParams.set('u', 'https://evil.example/'); u.searchParams.delete('s') }],
    ['signed, destination swapped', (u: URL) => { u.searchParams.set('u', 'https://evil.example/') }],
    ['signed, destination swapped to a look-alike host', (u: URL) => { u.searchParams.set('u', 'https://go.isclix.com.evil.example/x') }],
    ['signed, provider swapped', (u: URL) => { u.searchParams.set('p', 'lazada') }],
    ['signature truncated', (u: URL) => { u.searchParams.set('s', (u.searchParams.get('s') ?? '').slice(0, 10)) }],
  ])('🚨 %s → home page, never the attacker', async (_label, tamper) => {
    const u = new URL(signed())
    tamper(u)
    const res = await hit(u.toString(), { 'x-vercel-forwarded-for': '203.0.113.11' })
    expect(res.status).toBe(302)
    expect(new URL(res.headers.get('location')!).host).toBe('www.tappyai.com')
    expect(h.inserts).toHaveLength(0)
  })

  it('🚨 rotating x-forwarded-for does not reset the limiter — the platform IP is the key', async () => {
    const link = signed()
    for (let i = 0; i < 60; i++) {
      await hit(link, { 'x-vercel-forwarded-for': '198.51.100.20', 'x-forwarded-for': `10.0.${i}.1, 198.51.100.20` })
    }
    expect(h.inserts).toHaveLength(60)
    const res = await hit(link, { 'x-vercel-forwarded-for': '198.51.100.20', 'x-forwarded-for': '10.99.99.99' })
    // Over the limit the click still reaches the merchant — but unrecorded, without a sub1.
    expect(new URL(res.headers.get('location')!).searchParams.get('sub1')).toBeNull()
    expect(h.inserts).toHaveLength(60)
  })
})
