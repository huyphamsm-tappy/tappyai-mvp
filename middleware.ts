import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          })
        },
      },
    }
  )

  // Refresh session cookies — no auth redirects, app is open to all.
  // The /login redirect-away is handled client-side in login/page.tsx using
  // router.replace() so that the browser's Back button works correctly on
  // iOS Safari (server-side 307 redirects during Back navigation add a new
  // history entry on Safari, creating an infinite Back→login→service loop).
  //
  // MUST be getUser(), not getSession(): only getUser() revalidates the token
  // against the Supabase auth server and rotates/writes the refreshed access+
  // refresh cookies back onto supabaseResponse. getSession() just reads cookies
  // without a guaranteed refresh, so once the ~1h access token expired the
  // server started rendering the user as logged-out (the reported "desktop
  // session logs out periodically" symptom).
  const { data: { user } } = await supabase.auth.getUser()

  // Back Office route protection (Architecture v1.1, owner decision Phase 0):
  // middleware enforces AUTHENTICATION only — never a DB-backed role check. The
  // authoritative RBAC role gate runs in the /admin server layout and in every
  // /api/admin/* handler (defense-in-depth, Security §4). Unauthenticated users
  // hitting an /admin PAGE are redirected to login; /api/admin/* is untouched
  // here (those handlers return JSON 401/403 themselves).
  if (pathname.startsWith('/admin') && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = `?redirect=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
