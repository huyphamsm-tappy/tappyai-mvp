import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ── Zalo login finishes on the SERVER; the access token never reaches the browser ─────────────
//
// 🚨 THE DEFECT THIS PINS. The callback used to redirect to `/auth/zalo-finish#at=<token>` so the
// user's Vietnamese browser could call `graph.zalo.me/v2.0/me` (Zalo answers only Vietnamese IPs).
// Measured 2026-09-26 on this machine: after three logins, Chrome's History database held three
// rows with a live `#at=` token in the URL, plus the OAuth `code` in the callback row.
// `history.replaceState` did not remove them — it only added a second, clean row.
//
// The verifier in Vietnam (infra/zalo-verify/) removed the reason for the browser leg, so the
// whole flow is one server request now. The tests below pin the two properties that matter:
//   1. nothing that reaches the browser ever contains the token (the owner's test), and
//   2. an identity that cannot be verified signs nobody in (R-1, fail-closed).

const ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const verify = vi.fn<(token: string) => Promise<{ id: string; name: string | null; avatar: string | null } | null>>()
const createUser = vi.fn()
const generateLink = vi.fn()

vi.mock('@/lib/zalo/identity', () => ({ createZaloProfileVerifier: () => ({ verify }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, generateLink } } }),
}))

import { NextRequest } from 'next/server'
import { GET } from './route'

const TOKEN = 'zalo-access-token-SENSITIVE-0123456789'
const CODE = 'oauth-code-abcdef'

let fetchMock: ReturnType<typeof vi.fn>

/** The request Zalo sends back, with the cookies the init route set. */
function callback(
  { code = CODE, state = 'S1', cookies = 'zalo_login_cv=VERIFIER; zalo_login_state=S1; zalo_login_return=/deals' } = {},
) {
  const url = `https://uat.tappyai.com/api/auth/zalo/callback?code=${encodeURIComponent(code)}&state=${state}`
  return new NextRequest(new Request(url, {
    headers: { cookie: cookies, host: 'uat.tappyai.com', 'x-forwarded-proto': 'https' },
  }), {})
}

const location = (res: Response) => res.headers.get('location') ?? ''
const setCookies = (res: Response) => res.headers.getSetCookie?.().join('\n') ?? ''

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ id: '1111111111', name: 'Huy Phạm', avatar: 'https://zalo/av.jpg' })
  createUser.mockReset().mockResolvedValue({ error: null })
  generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: 'HASH' } }, error: null })
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: TOKEN }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('the happy path never shows the browser a token', () => {
  it('redirects straight to /auth/confirm with a one-time hash', async () => {
    const res = await GET(callback())

    expect(res.status).toBe(307)
    expect(location(res)).toBe('https://uat.tappyai.com/auth/confirm?token_hash=HASH&type=magiclink&next=%2Fdeals')
  })

  // The owner's test: the URL the browser is handed, and every header with it, carries no token.
  it('no response header contains the access token, the code, or a fragment', async () => {
    const res = await GET(callback())
    const all = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')

    expect(all).not.toContain(TOKEN)
    expect(all).not.toContain(CODE)
    expect(location(res)).not.toContain('#')
    expect(location(res)).not.toContain('at=')
    expect(location(res)).not.toContain('zalo-finish')
  })

  it('sets no zalo_at cookie, and clears the flow cookies', async () => {
    const res = await GET(callback())
    const cookies = setCookies(res)

    expect(cookies).not.toContain('zalo_at')
    expect(cookies).not.toContain(TOKEN)
    for (const c of ['zalo_login_cv', 'zalo_login_state', 'zalo_login_return', 'zalo_login_platform']) {
      expect(cookies).toContain(c)          // present…
    }
    expect(cookies).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/)  // …only to be deleted
  })

  it('the token goes to the verifier and nowhere else', async () => {
    await GET(callback())

    expect(verify).toHaveBeenCalledWith(TOKEN)
    // The one outbound call this route makes itself is the code exchange. Everything about the
    // token after that happens inside the verifier.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://oauth.zaloapp.com/v4/access_token')
  })

  it('the account comes from the verified id; name and avatar are display only', async () => {
    await GET(callback())

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'zalo_1111111111@zalo.tappyai.com',
      user_metadata: expect.objectContaining({ zalo_id: '1111111111', full_name: 'Huy Phạm', avatar_url: 'https://zalo/av.jpg' }),
    }))
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ email: 'zalo_1111111111@zalo.tappyai.com' }))
  })

  it('a native login still returns through its own scheme', async () => {
    const res = await GET(callback({ cookies: 'zalo_login_cv=V; zalo_login_state=S1; zalo_login_platform=android' }))
    expect(location(res)).toContain('platform=android')
    expect(location(res)).toContain('next=%2F')
  })

  it('an off-site `next` is refused', async () => {
    const res = await GET(callback({ cookies: 'zalo_login_cv=V; zalo_login_state=S1; zalo_login_return=//evil.example' }))
    expect(location(res)).toMatch(/next=%2F$/) // '/' — not the attacker's host
    expect(location(res)).not.toContain('evil.example')
  })
})

describe('every unverified outcome signs nobody in', () => {
  const assertNoSession = async (res: Response, reason: string) => {
    expect(location(res)).toBe(`https://uat.tappyai.com/login?error=${reason}`)
    expect(createUser).not.toHaveBeenCalled()
    expect(generateLink).not.toHaveBeenCalled()
  }

  it('state mismatch → zalo_denied, and no token is even requested', async () => {
    const res = await GET(callback({ state: 'WRONG' }))
    await assertNoSession(res, 'zalo_denied')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no code → zalo_denied', async () => {
    await assertNoSession(await GET(callback({ code: '' })), 'zalo_denied')
  })

  it('token exchange fails → zalo_failed, and the verifier is never called', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: -14002 }), { status: 200 }))
    await assertNoSession(await GET(callback()), 'zalo_failed')
    expect(verify).not.toHaveBeenCalled()
  })

  // -501, an unreachable VPS, a wrong shared secret, missing env — all of them land here.
  it('the verifier cannot answer → zalo_unavailable', async () => {
    verify.mockRejectedValue(new Error('zalo verify proxy unreachable: TimeoutError'))
    await assertNoSession(await GET(callback()), 'zalo_unavailable')
  })

  it('Zalo rejects the token → zalo_invalid', async () => {
    verify.mockResolvedValue(null)
    await assertNoSession(await GET(callback()), 'zalo_invalid')
  })

  it('Supabase fails → zalo_failed, and no half-made session leaks out', async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await GET(callback())
    expect(location(res)).toBe('https://uat.tappyai.com/login?error=zalo_failed')
    expect(location(res)).not.toContain('HASH')
  })

  it('no failure path puts the token in the redirect', async () => {
    for (const setup of [
      () => verify.mockRejectedValue(new Error('down')),
      () => verify.mockResolvedValue(null),
      () => generateLink.mockResolvedValue({ data: null, error: { message: 'boom' } }),
    ]) {
      createUser.mockClear(); generateLink.mockClear().mockResolvedValue({ data: { properties: { hashed_token: 'HASH' } }, error: null })
      verify.mockReset().mockResolvedValue({ id: '1111111111', name: null, avatar: null })
      setup()
      const res = await GET(callback())
      expect(location(res)).not.toContain(TOKEN)
      expect(location(res)).not.toContain('#')
    }
  })
})

describe('the browser leg is gone for good', () => {
  it('/auth/zalo-finish and /api/auth/zalo/complete no longer exist', () => {
    expect(existsSync(join(ROOT, 'src/app/auth/zalo-finish'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/app/api/auth/zalo/complete'))).toBe(false)
  })

  it('the callback holds no fragment, no zalo_at cookie and no finish redirect', () => {
    // Code only: the header comment names the old fragment in order to explain why it is gone.
    const code = read('src/app/api/auth/zalo/callback/route.ts')
      .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toMatch(/cookies\.set\(\s*'zalo_at'/)
    expect(code).not.toContain('#at=')
    expect(code).not.toContain('zalo-finish')
  })

  it('nothing in src still reads or writes the zalo_at cookie', () => {
    // A leftover reader would be a second, unverified way into an account.
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const hits = execSync('git grep -l "zalo_at" -- src || true', { cwd: ROOT, encoding: 'utf8' }).trim()
    const files = hits ? hits.split('\n').filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx')) : []
    // Only prose in the two files that explain why it is gone.
    for (const f of files) {
      expect(read(f)).not.toMatch(/cookies\.(get|set)\(\s*'zalo_at'/)
    }
  })
})
