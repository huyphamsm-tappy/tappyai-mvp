/**
 * /auth/callback and /auth/confirm: the destination is the strict one, the order is
 * authentication -> 18+ -> onboarding -> product on BOTH routes, and both are rate-limited per IP.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  limitOk: true,
  limitKeys: [] as string[],
  status: { has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: null } as Record<string, unknown>,
  onboarded: true,
}))

vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: async (key: string) => { h.limitKeys.push(key); return { ok: h.limitOk, retryAfter: 5, scope: 'process' } },
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      verifyOtp: async () => ({ data: { user: { id: 'u1' }, session: { access_token: 'a', refresh_token: 'r' } }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { onboarded: h.onboarded }, error: null }) }) }) }),
    rpc: async () => ({ data: [h.status], error: null }),
  }),
}))

import { GET as callback } from './callback/route'
import { GET as confirm } from './confirm/route'

const get = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { 'x-vercel-forwarded-for': '203.0.113.7' } })
const where = (res: Response) => res.headers.get('location') ?? ''
const ELIGIBLE = { has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: 'adult' }

beforeEach(() => {
  h.limitOk = true
  h.limitKeys = []
  h.status = { has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: null }
  h.onboarded = true
})

const HOSTILE = ['/\\evil.com', '//evil.com', '/%5Cevil.com', 'https://evil.com', 'javascript:alert(1)']

describe('open redirect', () => {
  for (const next of HOSTILE) {
    it(`/auth/callback never leaves the origin for next=${next}`, async () => {
      h.status = ELIGIBLE
      const res = await callback(get(`/auth/callback?code=c&next=${encodeURIComponent(next)}`))
      expect(where(res)).toBe('http://localhost/')
    })
    it(`/auth/confirm never leaves the origin for next=${next}`, async () => {
      h.status = ELIGIBLE
      const res = await confirm(get(`/auth/confirm?token_hash=t&type=magiclink&next=${encodeURIComponent(next)}`))
      expect(where(res)).toBe('http://localhost/')
    })
  }

  it('a normal path with a query survives on both', async () => {
    h.status = ELIGIBLE
    expect(where(await callback(get('/auth/callback?code=c&next=%2Fchat%3Fx%3D1')))).toBe('http://localhost/chat?x=1')
    expect(where(await confirm(get('/auth/confirm?token_hash=t&type=magiclink&next=%2Fchat%3Fx%3D1')))).toBe('http://localhost/chat?x=1')
  })
})

describe('order: age screen before onboarding, on both routes', () => {
  it('an account that is not yet eligible goes to /age-check first (next preserved)', async () => {
    h.onboarded = false
    expect(where(await callback(get('/auth/callback?code=c&next=%2Fchat')))).toBe('http://localhost/age-check?next=%2Fchat')
    expect(where(await confirm(get('/auth/confirm?token_hash=t&type=magiclink&next=%2Fchat')))).toBe('http://localhost/age-check?next=%2Fchat')
    expect(where(await confirm(get('/auth/confirm?token_hash=t&type=magiclink')))).toBe('http://localhost/age-check')
  })

  it('eligible + not onboarded goes to onboarding; eligible + onboarded goes to the destination', async () => {
    h.status = ELIGIBLE
    h.onboarded = false
    expect(where(await confirm(get('/auth/confirm?token_hash=t&type=magiclink')))).toBe('http://localhost/onboarding')
    h.onboarded = true
    expect(where(await confirm(get('/auth/confirm?token_hash=t&type=magiclink&next=%2Ffood')))).toBe('http://localhost/food')
  })
})

describe('rate limit', () => {
  it('both are keyed by IP and answer a friendly login error when refused', async () => {
    h.limitOk = false
    expect(where(await callback(get('/auth/callback?code=c')))).toBe('http://localhost/login?error=rate_limited')
    expect(where(await confirm(get('/auth/confirm?token_hash=t&type=magiclink')))).toBe('http://localhost/login?error=rate_limited')
    expect(h.limitKeys).toEqual(['auth-callback:203.0.113.7', 'auth-confirm:203.0.113.7'])
  })
})
