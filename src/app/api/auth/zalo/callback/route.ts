import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { createAdminClient } from '@/lib/supabase/admin'
import { createZaloProfileVerifier } from '@/lib/zalo/identity'
import { safeNext, zaloConfirmUrl } from '@/lib/zalo/session'

const ZALO_APP_ID = process.env.ZALO_APP_ID!
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET!

// Same host the init route used (e.g. www.tappyai.com) so redirect_uri matches
// exactly at token exchange.
function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

// Zalo login, start to finish, on the server.
//
// 🚨 THE ACCESS TOKEN NEVER REACHES THE BROWSER. It used to: `graph.zalo.me/v2.0/me` answers only
// Vietnamese IP addresses, so the token was put in a URL fragment (`/auth/zalo-finish#at=…`) for
// the user's own browser to make that call. Measured on 2026-09-26, the fragment stayed in
// Chrome's History database — a live login token, in history, in browser sync, in screenshots,
// and readable by any extension that can see `location`.
//
// The server can reach Zalo now: `createZaloProfileVerifier` asks our own verifier in Vietnam
// (infra/zalo-verify/). So this route exchanges the code, resolves the identity, creates the
// session and redirects straight to `/auth/confirm` with a one-time Supabase token_hash. No
// fragment, no `zalo_at` cookie, no client-side step. `/auth/zalo-finish` and
// `/api/auth/zalo/complete` are deleted, and serverSideCallback.test.ts fails if either returns.
//
// 🚨 FAIL-CLOSED. An identity that cannot be verified is never guessed at: the verifier throwing
// (unconfigured, unreachable, -501, wrong secret) ends at `?error=zalo_unavailable`, and a token
// Zalo rejects ends at `?error=zalo_invalid`. Neither creates nor signs in anything. That is the
// R-1 rule — the account comes from the token, or there is no account.
export async function GET(req: NextRequest) {
  const origin = originOf(req)
  const REDIRECT_URI = `${origin}/api/auth/zalo/callback`
  const code = searchParam(req, 'code')
  const state = searchParam(req, 'state')
  const codeVerifier = req.cookies.get('zalo_login_cv')?.value
  const savedState = req.cookies.get('zalo_login_state')?.value
  const next = safeNext(req.cookies.get('zalo_login_return')?.value)
  const platformCookie = req.cookies.get('zalo_login_platform')?.value
  const platform = platformCookie === 'ios' ? 'ios' : platformCookie === 'android' ? 'android' : 'web'

  const clearFlow = (res: NextResponse) => {
    res.cookies.delete('zalo_login_cv')
    res.cookies.delete('zalo_login_state')
    res.cookies.delete('zalo_login_return')
    res.cookies.delete('zalo_login_platform')
    return res
  }
  const fail = (reason: string) =>
    clearFlow(NextResponse.redirect(new URL(`/login?error=${reason}`, origin)))

  if (!code || !codeVerifier || state !== savedState) return fail('zalo_denied')

  let accessToken: string
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
    accessToken = tokens.access_token
  } catch (e) {
    console.error('[auth/zalo/callback] token exchange:', e)
    return fail('zalo_failed')
  }

  // Who the token belongs to, according to Zalo. Resolved through the Vietnam verifier, before
  // Supabase is touched at all.
  let profile
  try {
    profile = await createZaloProfileVerifier().verify(accessToken)
  } catch (e) {
    console.error('[auth/zalo/callback] identity verification unavailable:', e instanceof Error ? e.message : e)
    return fail('zalo_unavailable')
  }
  if (!profile) return fail('zalo_invalid')

  try {
    const confirmUrl = await zaloConfirmUrl(createAdminClient(), { profile, origin, next, platform })
    return clearFlow(NextResponse.redirect(confirmUrl))
  } catch (e) {
    console.error('[auth/zalo/callback] session:', e)
    return fail('zalo_failed')
  }
}
