import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const ZALO_APP_ID = process.env.ZALO_APP_ID!
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET!

// Same host the init route used (e.g. www.tappyai.com) so redirect_uri matches
// exactly at token exchange, and all follow-up redirects stay on this origin.
function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

export async function GET(req: NextRequest) {
  const REDIRECT_URI = `${originOf(req)}/api/auth/zalo/callback`
  const APP_URL = originOf(req)
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const codeVerifier = req.cookies.get('zalo_login_cv')?.value
  const savedState = req.cookies.get('zalo_login_state')?.value
  const returnTo = req.cookies.get('zalo_login_return')?.value || '/'

  const clearCookies = (res: NextResponse) => {
    res.cookies.delete('zalo_login_cv')
    res.cookies.delete('zalo_login_state')
    res.cookies.delete('zalo_login_return')
    return res
  }

  if (!code || !codeVerifier || state !== savedState) {
    return clearCookies(NextResponse.redirect(new URL('/login?error=zalo_denied', APP_URL)))
  }

  try {
    // Exchange code for access token
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
    if (!tokens.access_token) throw new Error('Token exchange failed')

    // Get Zalo user profile
    const profileRes = await fetch(
      'https://graph.zalo.me/v2.0/me?fields=id,name,picture',
      { headers: { access_token: tokens.access_token } }
    )
    const profile = await profileRes.json()
    if (!profile.id) {
      // Surface Zalo's actual response so the exact cause (permission/scope,
      // app-not-activated, token issue) is visible in the runtime logs.
      throw new Error(`Cannot get Zalo profile (HTTP ${profileRes.status}): ${JSON.stringify(profile).slice(0, 400)}`)
    }

    const zaloId = String(profile.id)
    const zaloEmail = `zalo_${zaloId}@zalo.tappyai.com`
    const displayName = profile.name || 'Người dùng Zalo'
    const avatarUrl = profile.picture?.data?.url || null

    const supabase = createAdminClient()

    // Try to find existing user by zalo_id in metadata
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existingUsers?.users?.find(
      (u) => u.user_metadata?.zalo_id === zaloId
    )

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else {
      // Create new user
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: zaloEmail,
        email_confirm: true,
        user_metadata: {
          zalo_id: zaloId,
          full_name: displayName,
          avatar_url: avatarUrl,
          provider: 'zalo',
        },
      })
      if (createErr || !newUser.user) throw createErr || new Error('Create user failed')
      userId = newUser.user.id
    }

    // Generate magic link to sign in as this user
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: zaloEmail,
      options: {
        redirectTo: `${APP_URL}${returnTo.startsWith('/') ? returnTo : '/'}`,
      },
    })
    if (linkErr || !linkData?.properties?.hashed_token) throw linkErr || new Error('Magic link failed')

    const magicLink = `${APP_URL}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(returnTo)}`

    return clearCookies(NextResponse.redirect(magicLink))
  } catch (e) {
    console.error('[auth/zalo/callback]', e)
    return clearCookies(NextResponse.redirect(new URL('/login?error=zalo_failed', APP_URL)))
  }
}
