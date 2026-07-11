import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'magiclink' | 'email' | null
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'
  // platform=ios: the flow runs inside the app's ASWebAuthenticationSession, so
  // instead of a cookie session + web redirect we hand the session tokens back
  // to the app via its custom scheme. Strict allowlist; the scheme is hardcoded.
  const isIos = searchParams.get('platform') === 'ios'

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`)
  }

  const sessionCookies: Array<{ name: string; value: string; options: any }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(c => sessionCookies.push(c as any))
        },
      },
    }
  )

  const { data: { user, session }, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error || !user) {
    const msg = error?.message ?? 'verify_failed'
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`)
  }

  // iOS: finish at the app's callback with the session tokens in the URL
  // FRAGMENT (never sent to servers or logged — same rationale as the Zalo
  // callback). No web cookies are set; onboarding gating is the app's own
  // concern (it reads profiles.onboarded, docs/ios/09). Web flow is unchanged.
  if (isIos && session) {
    const fragment = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: String(session.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
    })
    return NextResponse.redirect(`tappyai://auth/callback#${fragment.toString()}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .maybeSingle()

  let destination: string
  if (!profile?.onboarded) {
    destination = next !== '/'
      ? `${origin}/onboarding?next=${encodeURIComponent(next)}`
      : `${origin}/onboarding`
  } else {
    destination = `${origin}${next}`
  }

  const response = NextResponse.redirect(destination)
  sessionCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}
