import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Log all cookies for debugging
  const allCookies = request.cookies.getAll()
  const cookieNames = allCookies.map(c => c.name).join(', ')
  const hasCodeVerifier = allCookies.some(c => c.name.includes('code-verifier') || c.name.includes('pkce'))
  console.log('[auth/callback] cookies:', cookieNames)
  console.log('[auth/callback] has code verifier:', hasCodeVerifier)
  console.log('[auth/callback] code present:', !!code)

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

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      console.log('[auth/callback] success, redirecting to', next)
      return response
    }

    console.error('[auth/callback] exchangeCodeForSession error:', JSON.stringify(error))
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
