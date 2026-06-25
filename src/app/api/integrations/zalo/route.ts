import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const ZALO_APP_ID = process.env.ZALO_APP_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/zalo/callback`

// GET /api/integrations/zalo → redirect to Zalo OAuth
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const action = req.nextUrl.searchParams.get('action')

  // Disconnect
  if (action === 'disconnect') {
    await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'zalo')
    return NextResponse.redirect(new URL('/profile/integrations', req.url))
  }

  // Zalo OAuth 2.0 — PKCE required
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

  // Store verifier in cookie (short-lived)
  const res = NextResponse.redirect(
    `https://oauth.zaloapp.com/v4/permission?` +
    new URLSearchParams({
      app_id: ZALO_APP_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: codeChallenge,
      state: user.id,
    }).toString()
  )

  res.cookies.set('zalo_cv', codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 300, // 5 min
    path: '/',
  })

  return res
}
