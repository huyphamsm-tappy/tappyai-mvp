import { NextRequest, NextResponse } from 'next/server'

const ZALO_APP_ID = process.env.ZALO_APP_ID!
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET!

// Same host the init route used (e.g. www.tappyai.com) so redirect_uri matches
// exactly at token exchange.
function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

export async function GET(req: NextRequest) {
  const origin = originOf(req)
  const REDIRECT_URI = `${origin}/api/auth/zalo/callback`
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const codeVerifier = req.cookies.get('zalo_login_cv')?.value
  const savedState = req.cookies.get('zalo_login_state')?.value
  const returnTo = req.cookies.get('zalo_login_return')?.value || '/'
  const next = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  const platform = req.cookies.get('zalo_login_platform')?.value === 'ios' ? 'ios' : 'web'

  const clearFlow = (res: NextResponse) => {
    res.cookies.delete('zalo_login_cv')
    res.cookies.delete('zalo_login_state')
    res.cookies.delete('zalo_login_return')
    res.cookies.delete('zalo_login_platform')
    return res
  }

  if (!code || !codeVerifier || state !== savedState) {
    return clearFlow(NextResponse.redirect(new URL('/login?error=zalo_denied', origin)))
  }

  try {
    // Exchange code → access token (server-side; needs the secret). This step is
    // NOT IP-restricted, so it works from Vercel (US).
    const tokenRes = await fetch('https://oauth.zaloapp.com/v4/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': ZALO_APP_SECRET,
      },
      body: new URLSearchParams({
        app_id: ZALO_APP_ID,
        code,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI,
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(tokens).slice(0, 300))

    // Zalo restricts the profile API (graph.zalo.me/v2.0/me) to VIETNAM IP
    // addresses — Vercel runs in the US, so a server-side /me returns error -501
    // ("Personal information is limited due to IP address not inside Vietnam").
    // So we hand the access token to the client (the user's Vietnamese browser)
    // via the URL fragment — fragments are never sent to the server or logged —
    // and finish there. The short-lived httpOnly copy binds the /complete step
    // to a caller that actually performed this server-side exchange.
    const finishUrl = `${origin}/auth/zalo-finish#at=${encodeURIComponent(tokens.access_token)}&next=${encodeURIComponent(next)}${platform === 'ios' ? '&platform=ios' : ''}`
    const res = clearFlow(NextResponse.redirect(finishUrl))
    res.cookies.set('zalo_at', tokens.access_token, {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/',
    })
    return res
  } catch (e) {
    console.error('[auth/zalo/callback]', e)
    return clearFlow(NextResponse.redirect(new URL('/login?error=zalo_failed', origin)))
  }
}
