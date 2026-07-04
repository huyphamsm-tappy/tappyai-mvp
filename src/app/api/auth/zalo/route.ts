import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const ZALO_APP_ID = process.env.ZALO_APP_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/zalo/callback`

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/'

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
  return res
}
