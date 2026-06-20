import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Restrict to relative paths only to prevent open-redirect attacks
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') ? rawNext : '/'

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              response.cookies.set(name, value, options as any)
            })
          },
        },
      }
    )

    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && user) {
      // Kiểm tra user mới (profile chưa có full_name) → redirect onboarding
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', user.id)
        .single()
      if (!profile?.onboarded) {
        const onboardingUrl = next && next !== '/'
          ? `${origin}/onboarding?next=${encodeURIComponent(next)}`
          : `${origin}/onboarding`
        // Reuse `response` so its Set-Cookie headers (session tokens from
        // exchangeCodeForSession) are preserved. A fresh NextResponse.redirect
        // would have no cookies, leaving the user unauthenticated on /onboarding.
        response.headers.set('Location', onboardingUrl)
        return response
      }
      return response
    }
    if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
