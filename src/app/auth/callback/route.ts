import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getAgeEligibility } from '@/lib/account/ageEligibility'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/'
  // Restrict to relative paths only to prevent open-redirect attacks
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  // Collect all cookies emitted by exchangeCodeForSession (session tokens +
  // PKCE verifier deletion). We apply them AFTER determining the redirect
  // destination so we can create one clean NextResponse.redirect(url) instead
  // of mutating a pre-built response's Location header — that mutation is
  // fragile across Next.js / edge-runtime versions.
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

  const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !user) {
    const msg = error?.message ?? 'exchange_failed'
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`)
  }

  // Determine redirect destination.
  // Use .maybeSingle() so a missing row is data=null without an error,
  // avoiding the PGRST116 "no rows" error that could mask a real DB error.
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .maybeSingle()

  // ── V3 User Data Foundation: 18+ eligibility comes BEFORE onboarding ──────
  //
  // The required order is authentication → eligibility → onboarding → product.
  // Putting the age question after the interests-and-city wizard would collect
  // preference data from someone who may not be permitted to use the product at
  // all, and would make the first thing an under-18 visitor sees a wizard that
  // ends in a refusal.
  //
  // A user who already has an eligible date of birth is NOT asked again — that
  // is the whole point of storing it. `getAgeEligibility` reads the derived
  // status through `user_age_status()`; it cannot read the date itself.
  //
  // This redirect is convenience, not enforcement. Every product API refuses an
  // ineligible caller independently, so skipping this hop changes nothing about
  // what the account can actually do.
  const eligibility = await getAgeEligibility(supabase)

  let destination: string
  if (eligibility.status !== 'eligible') {
    // `next` is preserved so the user lands where they were going once they
    // pass, rather than being dropped on the home page.
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

  // Build the final redirect and stamp ALL session cookies onto it.
  // Creating a fresh NextResponse.redirect(destination) here (rather than
  // mutating headers on a pre-existing response) guarantees the Location
  // and Set-Cookie headers are coherent and will be sent together.
  const response = NextResponse.redirect(destination)
  sessionCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}
