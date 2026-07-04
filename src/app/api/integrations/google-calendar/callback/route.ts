import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback`

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(new URL('/profile/integrations?error=google_denied', req.url))
  }

  // Bind the OAuth result to the authenticated session. `state` is the user id
  // set by the initiator; without this check anyone could POST a code + an
  // arbitrary `state` and attach a Google account to a victim's TappyAI account
  // (or bind stolen tokens), since the write uses the admin client.
  const { user } = await getRequestUser(req)
  if (!user || user.id !== state) {
    return NextResponse.redirect(new URL('/profile/integrations?error=google_state', req.url))
  }
  const userId = user.id

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.access_token) {
      throw new Error('Token exchange failed')
    }

    // Get user's Google profile email for display
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = profileRes.ok ? await profileRes.json() : {}

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

    const supabase = createAdminClient()
    await supabase
      .from('user_integrations')
      .upsert({
        user_id: userId,
        provider: 'google_calendar',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        scope: tokens.scope,
        metadata: { email: profile.email, name: profile.name, picture: profile.picture },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' })

    return NextResponse.redirect(new URL('/profile/integrations?success=google_calendar', req.url))
  } catch (e) {
    console.error('[google-calendar/callback]', e)
    return NextResponse.redirect(new URL('/profile/integrations?error=google_failed', req.url))
  }
}
