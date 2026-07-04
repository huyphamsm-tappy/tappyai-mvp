import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'magiclink' | 'email' | null
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

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

  const { data: { user }, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error || !user) {
    const msg = error?.message ?? 'verify_failed'
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`)
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
