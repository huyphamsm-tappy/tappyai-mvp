import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── R-1: the Zalo account is decided by the access token, never by the request body ──────────
//
// 🚨 THE DEFECT THIS PINS. `/api/auth/zalo/complete` read `zaloId` from the body and minted a
// Supabase magic link for `zalo_<zaloId>@zalo.tappyai.com`. The httpOnly `zalo_at` cookie proved
// the caller had completed *a* Zalo login; it said nothing about *whose* account they asked for.
// So any user with a valid Zalo session could post someone else's id and be handed a working
// login link for that person's TappyAI account.
//
// The test the owner asked for is the third one below: send a `zaloId` that disagrees with the
// token's id and confirm the token wins. The other cases pin the fail-closed edges, because a
// verifier that silently degrades to "trust the client" would pass that test and still be broken.

const ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const verify = vi.fn<(token: string) => Promise<string | null>>()
const createUser = vi.fn()
const generateLink = vi.fn()

vi.mock('@/lib/zalo/identity', () => ({
  createGraphZaloVerifier: () => ({ verify }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, generateLink } } }),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

/** A request carrying the httpOnly cookie the OAuth callback sets, plus whatever body is passed. */
function request(body: unknown, cookie = 'zalo_at=real-token') {
  return new NextRequest(new Request('https://www.tappyai.com/api/auth/zalo/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      host: 'www.tappyai.com',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify(body),
  }), {})
}

beforeEach(() => {
  verify.mockReset()
  createUser.mockReset().mockResolvedValue({ error: null })
  generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: 'HASH' } }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('the identity comes from the token', () => {
  it('resolves the id from the cookie and never reads one from the body', async () => {
    verify.mockResolvedValue('1111111111')
    const res = await POST(request({ name: 'Huy' }))

    expect(res.status).toBe(200)
    expect(verify).toHaveBeenCalledWith('real-token')
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'zalo_1111111111@zalo.tappyai.com' }))
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ email: 'zalo_1111111111@zalo.tappyai.com' }))
  })

  // The owner's test: a body id that disagrees with the token.
  it('a zaloId in the body is ignored — the token decides the account', async () => {
    verify.mockResolvedValue('1111111111')
    const res = await POST(request({ zaloId: '9999999999', name: 'Attacker' }))

    expect(res.status).toBe(200)
    // The victim's account was never addressed.
    for (const call of [...createUser.mock.calls, ...generateLink.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain('9999999999')
      expect(JSON.stringify(call)).toContain('1111111111')
    }
  })

  it('still works when the body carries no id at all — that is now the normal client', async () => {
    verify.mockResolvedValue('2222222222')
    const res = await POST(request({ name: 'Huy', next: '/profile', platform: 'android' }))
    expect(res.status).toBe(200)
    const { confirmUrl } = await res.json()
    expect(confirmUrl).toContain('token_hash=HASH')
    expect(confirmUrl).toContain('platform=android')
  })
})

describe('every unverified outcome fails closed', () => {
  it('no cookie → 401, and nothing is created', async () => {
    const res = await POST(request({ zaloId: '9999999999' }, ''))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'no_session' })
    expect(createUser).not.toHaveBeenCalled()
  })

  it('a token Zalo rejects → 401, and nothing is created', async () => {
    verify.mockResolvedValue(null)
    const res = await POST(request({ zaloId: '9999999999' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
    expect(createUser).not.toHaveBeenCalled()
  })

  // The -501 region restriction lands here. It must NOT degrade into trusting the body — that
  // fallback is the original vulnerability, and it would be invisible from outside Vietnam.
  it('a verifier that cannot answer → 503, and nothing is created', async () => {
    verify.mockRejectedValue(new Error('zalo graph region restricted'))
    const res = await POST(request({ zaloId: '9999999999', name: 'Attacker' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'verification_unavailable' })
    expect(createUser).not.toHaveBeenCalled()
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('the identity is resolved before any Supabase call', async () => {
    verify.mockRejectedValue(new Error('network'))
    await POST(request({ name: 'Huy' }))
    expect(createUser).not.toHaveBeenCalled()
    expect(generateLink).not.toHaveBeenCalled()
  })
})

describe('the client no longer claims an identity', () => {
  it('the route reads no id from the body', () => {
    const src = read('src/app/api/auth/zalo/complete/route.ts')
    expect(src).not.toMatch(/\bb\.zaloId\b/)
    expect(src).toContain('createGraphZaloVerifier')
  })

  it('the finish page sends no id', () => {
    const page = read('src/app/auth/zalo-finish/page.tsx')
    expect(page).not.toMatch(/zaloId:\s*String\(profile\.id\)/)
  })
})
