import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { APP_STATE_COOKIE, checkAppState } from '@/lib/auth/appState'
import { getAgeEligibility } from '@/lib/account/ageEligibility'
import { safeReturnTo } from '@/lib/auth/returnTo'
import { clientIpKey } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  // Public, unauthenticated and it talks to Supabase Auth: capped per IP (20/min).
  const flood = await publicRateLimit(`auth-confirm:${clientIpKey(request)}`, 20, 60_000)
  if (!flood.ok) return NextResponse.redirect(`${origin}/login?error=rate_limited`)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'magiclink' | 'email' | null
  const next = safeReturnTo(searchParams.get('next'))
  // Native app flows (iOS/Android): instead of a cookie session + web redirect we
  // hand the session tokens back to the app via its custom scheme. Strict allowlist;
  // schemes are hardcoded. iOS registered tappyai://auth/callback; Android registered
  // tappyai://auth-callback (see android AndroidManifest + SupabaseModule).
  const platform =
    searchParams.get('platform') === 'ios' ? 'ios'
    : searchParams.get('platform') === 'android' ? 'android'
    : 'web'

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`)
  }

  // I6 / R24 (security 30/09): a session goes to the APP only for a sign-in the app started in THIS browser — the link's
  // `app_state` must equal the httpOnly cookie set at the start, within 5 minutes. Checked BEFORE the token is used, so
  // an attacker's own magic link with `&platform=android` creates no session at all. The cookie is single use.
  const appState = searchParams.get('app_state')
  if (platform !== 'web') {
    const verdict = checkAppState(appState, request.cookies.get(APP_STATE_COOKIE)?.value)
    if (verdict !== 'ok') {
      console.warn(JSON.stringify({ type: 'tappyai_auth_app_state_refused', platform, verdict }))
      const refused = NextResponse.redirect(`${origin}/login?error=app_state_invalid`)
      refused.cookies.delete(APP_STATE_COOKIE)
      return refused
    }
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

  // Native app (iOS/Android): finish at the app's callback with the session tokens
  // in the URL FRAGMENT (never sent to servers or logged — same rationale as the Zalo
  // callback). No web cookies are set; onboarding gating is the app's own concern (it
  // reads profiles.onboarded). Web flow is unchanged. iOS ↔ tappyai://auth/callback,
  // Android ↔ tappyai://auth-callback (each app's own registered scheme).
  if ((platform === 'ios' || platform === 'android') && session) {
    const fragment = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: String(session.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
      // ONE name for both apps (Android AuthCallbackState.kt + iOS AuthCallbackState.swift read `state`); the app SENDS
      // it as `app_state` when it starts the sign-in. The app accepts the callback only with the state it created.
      state: appState!,
    })
    const scheme = platform === 'android' ? 'tappyai://auth-callback' : 'tappyai://auth/callback'
    const toApp = NextResponse.redirect(`${scheme}#${fragment.toString()}`)
    toApp.cookies.delete(APP_STATE_COOKIE)
    return toApp
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .maybeSingle()

  // Same order as /auth/callback: authentication → 18+ eligibility → onboarding → product. An account that is not
  // yet eligible (unknown, or ineligible) goes to the age screen first; it is convenience, the APIs refuse on their own.
  const eligibility = await getAgeEligibility(supabase)

  let destination: string
  if (eligibility.status !== 'eligible') {
    destination = next !== '/'
      ? `${origin}/age-check?next=${encodeURIComponent(next)}`
      : `${origin}/age-check`
  } else if (!profile?.onboarded) {
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
