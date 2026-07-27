import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const ZALO_APP_ID = process.env.ZALO_APP_ID!

// Build the callback URL from the ACTUAL request host (e.g. www.tappyai.com),
// not NEXT_PUBLIC_APP_URL (which was the bare apex "tappyai.com"). Zalo requires
// redirect_uri to exactly match the registered Callback URL (www), and the PKCE
// cookies are set on this same host — so the callback must land back on it.
function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/'
  // platform=ios|android → the flow ends at the app's custom scheme instead of a
  // web redirect (see /auth/confirm). Strict allowlist — never a free-form value.
  const platformParam = req.nextUrl.searchParams.get('platform')
  const platform = platformParam === 'ios' ? 'ios' : platformParam === 'android' ? 'android' : 'web'
  const REDIRECT_URI = `${originOf(req)}/api/auth/zalo/callback`

  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('hex')

  const url =
    `https://oauth.zaloapp.com/v4/permission?` +
    new URLSearchParams({
      app_id: ZALO_APP_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: codeChallenge,
      state,
    }).toString()

  const res = NextResponse.redirect(url)
  res.cookies.set('zalo_login_cv', codeVerifier, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
  })
  res.cookies.set('zalo_login_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
  })
  res.cookies.set('zalo_login_return', returnTo, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
  })
  res.cookies.set('zalo_login_platform', platform, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
  })
  return res
}
