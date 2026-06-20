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
    // Parent page uses credentialless so PostHog/Supabase cross-origin fetches still work.
    // Static game files and route handler use require-corp (all same-origin, no external deps).
    response.headers.set(
      'Cross-Origin-Embedder-Policy',
      pathname === '/game/supertux' ? 'credentialless' : 'require-corp'
    )
    return response
  }

  let supabaseResponse = NextResponse.next({ request })

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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session cookies — no auth redirects, app is open to all
  const { data: { session } } = await supabase.auth.getSession()

  // If logged in and on login page → redirect to /chat
  if (request.nextUrl.pathname.startsWith('/login') && session) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
