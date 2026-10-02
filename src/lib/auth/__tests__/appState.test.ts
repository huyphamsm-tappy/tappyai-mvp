import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { checkAppState, appStateCookieValue, validAppState, APP_STATE_TTL_S } from '../appState'

// I6 / ANDROID-REQUESTS R24 (security 30/09, High): a session reaches the native app ONLY for a sign-in the app started
// in this browser. Missing / wrong / expired / reused state → refused, no session created.

const verifyOtp = vi.fn()
const profileRow = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { verifyOtp },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profileRow }) }) }),
  }),
}))

const ST = 'Abc_def-0123456789abcdefghijklmnopqrstuvwxy' // 43 chars, base64url
const OTHER = 'Zzz_def-0123456789abcdefghijklmnopqrstuvwxy'
const nowS = () => Math.floor(Date.now() / 1000)
const req = (url: string, cookie = '') => new NextRequest(new Request(url, { headers: { cookie, host: 'uat.tappyai.com', 'x-forwarded-proto': 'https' } }), {})
const loc = (r: Response) => r.headers.get('location') ?? ''
const cookiesOut = (r: Response) => r.headers.getSetCookie?.().join('\n') ?? ''
const CONFIRM = 'https://uat.tappyai.com/auth/confirm?token_hash=HASH&type=magiclink&next=%2F'

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 'AT', refresh_token: 'RT', expires_at: 999 } }, error: null })
  profileRow.mockReset().mockResolvedValue({ data: { onboarded: true } })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('checkAppState', () => {
  it('accepts only the same state, within 5 minutes', () => {
    const t = Date.now()
    expect(checkAppState(ST, appStateCookieValue(ST, t), t + 1000)).toBe('ok')
    expect(checkAppState(null, appStateCookieValue(ST, t), t)).toBe('missing')
    expect(checkAppState(ST, undefined, t)).toBe('missing')
    expect(checkAppState(OTHER, appStateCookieValue(ST, t), t)).toBe('mismatch')
    expect(checkAppState(ST, appStateCookieValue(ST, t), t + (APP_STATE_TTL_S + 1) * 1000)).toBe('expired')
    expect(checkAppState('short', appStateCookieValue(ST, t), t)).toBe('malformed')
    expect(checkAppState(ST, `garbage`, t)).toBe('malformed')
  })
  it('the state format is strict base64url, 43–128 chars', () => {
    expect(validAppState(ST)).toBe(true)
    expect(validAppState(ST + '=')).toBe(false)
    expect(validAppState('a'.repeat(42))).toBe(false)
    expect(validAppState('<script>' + 'a'.repeat(40))).toBe(false)
  })
})

describe('/api/auth/zalo — a native start needs the app state', () => {
  beforeEach(() => { process.env.ZALO_APP_ID = 'APP' })
  it('android without / with a malformed app_state: nothing starts', async () => {
    const { GET } = await import('@/app/api/auth/zalo/route')
    for (const q of ['', '&app_state=bad']) {
      const r = await GET(req(`https://uat.tappyai.com/api/auth/zalo?platform=android${q}`))
      expect(loc(r)).toBe('https://uat.tappyai.com/login?error=app_state_invalid')
    }
  })
  it('android with a valid app_state: Zalo starts and the state is kept httpOnly for 5 minutes', async () => {
    const { GET } = await import('@/app/api/auth/zalo/route')
    const r = await GET(req(`https://uat.tappyai.com/api/auth/zalo?platform=android&app_state=${ST}`))
    expect(loc(r)).toContain('oauth.zaloapp.com')
    const c = cookiesOut(r)
    expect(c).toMatch(new RegExp(`app_login_state=\\d+\\.${ST}`))
    expect(c).toMatch(/app_login_state=[^\n]*HttpOnly/i)
    expect(c).toMatch(/app_login_state=[^\n]*Secure/i)
    expect(c).toMatch(/app_login_state=[^\n]*SameSite=lax/i)
    expect(c).toMatch(/app_login_state=[^\n]*Max-Age=300/i)
  })
  it('iOS: the same rule — no state → nothing starts; a valid state → Zalo + the 5-minute cookie', async () => {
    const { GET } = await import('@/app/api/auth/zalo/route')
    expect(loc(await GET(req('https://uat.tappyai.com/api/auth/zalo?platform=ios')))).toBe('https://uat.tappyai.com/login?error=app_state_invalid')
    const hex64 = 'a1b2c3d4'.repeat(8) // iOS fallback shape (two UUIDs, no hyphens)
    const r = await GET(req(`https://uat.tappyai.com/api/auth/zalo?platform=ios&app_state=${hex64}`))
    expect(loc(r)).toContain('oauth.zaloapp.com')
    expect(cookiesOut(r)).toMatch(new RegExp(`app_login_state=\\d+\\.${hex64}`))
  })
  it('web is unchanged (no app state needed)', async () => {
    const { GET } = await import('@/app/api/auth/zalo/route')
    const r = await GET(req('https://uat.tappyai.com/api/auth/zalo?returnTo=/deals'))
    expect(loc(r)).toContain('oauth.zaloapp.com')
  })
})

describe('/auth/confirm — the session goes to the app only with the matching state', () => {
  it('the right flow: tokens + state in the fragment, cookie cleared (single use)', async () => {
    const { GET } = await import('@/app/auth/confirm/route')
    const r = await GET(req(`${CONFIRM}&platform=android&app_state=${ST}`, `app_login_state=${nowS()}.${ST}`))
    const l = loc(r)
    expect(l.startsWith('tappyai://auth-callback#')).toBe(true)
    const f = new URLSearchParams(l.split('#')[1])
    expect(f.get('access_token')).toBe('AT')
    expect(f.get('state')).toBe(ST)
    expect(f.has('app_state')).toBe(false) // one field name for both apps
    expect(cookiesOut(r)).toMatch(/app_login_state=;/)
  })
  it("an attacker's own magic link opened in the victim's browser: refused BEFORE the token is used", async () => {
    const { GET } = await import('@/app/auth/confirm/route')
    for (const [q, cookie] of [
      ['&platform=android', ''], // no state at all
      [`&platform=android&app_state=${OTHER}`, `app_login_state=${nowS()}.${ST}`], // wrong state
      [`&platform=ios&app_state=${ST}`, `app_login_state=${nowS() - 301}.${ST}`], // expired
      [`&platform=android&app_state=${ST}`, ''], // reused: the cookie was cleared by the first use
    ] as const) {
      verifyOtp.mockClear()
      const r = await GET(req(`${CONFIRM}${q}`, cookie))
      expect(loc(r)).toBe('https://uat.tappyai.com/login?error=app_state_invalid')
      expect(loc(r)).not.toContain('tappyai://')
      expect(verifyOtp).not.toHaveBeenCalled()
    }
  })
  it('iOS: tokens + state go to tappyai://auth/callback (its own scheme); a missing state is refused', async () => {
    const { GET } = await import('@/app/auth/confirm/route')
    const ok = await GET(req(`${CONFIRM}&platform=ios&app_state=${ST}`, `app_login_state=${nowS()}.${ST}`))
    expect(loc(ok).startsWith('tappyai://auth/callback#')).toBe(true)
    expect(new URLSearchParams(loc(ok).split('#')[1]).get('state')).toBe(ST)
    verifyOtp.mockClear()
    const bad = await GET(req(`${CONFIRM}&platform=ios`, ''))
    expect(loc(bad)).toBe('https://uat.tappyai.com/login?error=app_state_invalid')
    expect(verifyOtp).not.toHaveBeenCalled()
  })
  it('the web / email-link flow is unchanged: no state needed, web session cookies', async () => {
    const { GET } = await import('@/app/auth/confirm/route')
    const r = await GET(req(CONFIRM))
    expect(loc(r)).toBe('https://uat.tappyai.com/')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'HASH', type: 'magiclink' })
  })
})
