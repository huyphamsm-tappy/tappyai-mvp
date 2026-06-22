import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionCookies: Array<{ name: string; value: string; options: any }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Determine redirect destination based on onboarding status.
  // Use .maybeSingle() so a missing row is data=null without an error,
  // avoiding the PGRST116 "no rows" error that could mask a real DB error.
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
