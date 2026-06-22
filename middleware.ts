import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // SharedArrayBuffer (used by SuperTux WASM) requires COOP + COEP headers.
  // Static files in /public can't get headers from next.config.mjs, so we set them here.
  // /games/supertux        — route handler (serves supertux2.html with COOP+COEP)
  // /games/supertux/*      — static assets (supertux2.js, worker, images, SW)
  // /game/supertux         — Next.js page (iframe wrapper, needs credentialless COEP)
  if (pathname.startsWith('/games/supertux') || pathname === '/game/supertux') {
    const response = NextResponse.next({ request })
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    // Both parent and iframe use require-corp so the iframe's crossOriginIsolated is true
    // on Safari. Safari added COEP credentialless support only in v17 (Sep 2023); on older
    // iOS, credentialless on the parent meant the iframe was NOT cross-origin isolated and
    // SharedArrayBuffer was undefined, crashing supertux2.js with a ReferenceError.
    // Downside: PostHog/Supabase fetch calls on the game page may be blocked (acceptable —
    // the game page has no auth-gated content and analytics failure is silent).
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    return response
  }

  let supabaseResponse = NextResponse.next({ request })

  // Collect any cookies set/refreshed during getSession (e.g. token rotation).
  // We need these on hand so we can copy them onto any redirect response we
  // create — otherwise a fresh NextResponse.redirect() would silently drop
  // the rotated tokens, leaving the browser with stale cookies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshedCookies: Array<{ name: string; value: string; options: any }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            refreshedCookies.push({ name, value, options: options as any })
          })
        },
      },
    }
  )

  // Refresh session cookies — no auth redirects, app is open to all
  const { data: { session } } = await supabase.auth.getSession()

  // If logged in and on login page → redirect to returnTo (if safe) or home.
  // This covers the common case where the browser Back button returns to
  // /login?returnTo=... after OAuth; without this the user would stay on /login.
  if (request.nextUrl.pathname.startsWith('/login') && session) {
    const returnTo = request.nextUrl.searchParams.get('returnTo')
    const dest =
      returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
        ? new URL(returnTo, request.url)
        : (() => {
            const u = request.nextUrl.clone()
            u.pathname = '/'
            u.search = ''
            return u
          })()

    const redirect = NextResponse.redirect(dest)
    // Copy any rotated session cookies onto the redirect so the browser
    // receives the latest tokens even via this UX-only shortcut redirect.
    refreshedCookies.forEach(({ name, value, options }) => {
      redirect.cookies.set(name, value, options)
    })
    return redirect
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
