import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const ZALO_APP_ID = process.env.ZALO_APP_ID!
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/zalo/callback`

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const userId = req.nextUrl.searchParams.get('state')
  const codeVerifier = req.cookies.get('zalo_cv')?.value

  if (!code || !userId || !codeVerifier) {
    return NextResponse.redirect(new URL('/profile/integrations?error=zalo_denied', req.url))
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
    if (!tokenRes.ok || !tokens.access_token) throw new Error('Token exchange failed')

    // Get Zalo user info
    const profileRes = await fetch(
      `https://graph.zalo.me/v2.0/me?fields=id,name,picture`,
      { headers: { access_token: tokens.access_token } }
    )
    const profile = profileRes.ok ? await profileRes.json() : {}

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 86400) * 1000).toISOString()

    const supabase = createAdminClient()
    await supabase
      .from('user_integrations')
      .upsert({
        user_id: userId,
        provider: 'zalo',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        provider_user_id: String(profile.id ?? ''),
        metadata: {
          name: profile.name,
          picture: profile.picture?.data?.url,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' })

    const res = NextResponse.redirect(new URL('/profile/integrations?success=zalo', req.url))
    res.cookies.delete('zalo_cv')
    return res
  } catch (e) {
    console.error('[zalo/callback]', e)
    return NextResponse.redirect(new URL('/profile/integrations?error=zalo_failed', req.url))
  }
}
