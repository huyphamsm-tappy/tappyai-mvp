import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Nonce-based CSP (STEP A: Report-Only). We generate a per-request nonce, hand
// it to Next via the request's Content-Security-Policy header (Next reads the
// nonce from there and stamps it onto every <script> it renders), and emit the
// strict policy as Content-Security-Policy-Report-Only. The real enforcing CSP
// (with 'unsafe-inline', from next.config.mjs) still applies, so nothing can
// break — this only *reports* whether the stricter nonce policy would hold.
// STEP B (after report-only comes back clean): drop the next.config CSP and
// switch the header name below to 'Content-Security-Policy' to enforce it.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    // 'strict-dynamic' + nonce is the hardened policy modern browsers use (host
    // allowlist + 'unsafe-inline' are ignored once a nonce is present). The
    // extra tokens are a fallback for old browsers that ignore strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'wasm-unsafe-eval' https://us.i.posthog.com https://us-assets.i.posthog.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://nominatim.openstreetmap.org https://vitals.vercel-insights.com https://*.public.blob.vercel-storage.com https://blob.vercel-storage.com",
    "frame-src 'self' https://www.youtube.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join('; ')
}

// While in report-only mode use the Report-Only header so nothing is blocked.
// Flip to 'Content-Security-Policy' in STEP B to enforce.
const CSP_HEADER = 'Content-Security-Policy-Report-Only'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Per-request nonce. Handed to Next via the request CSP header so it stamps
  // the nonce onto its inline bootstrap/hydration scripts.
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  // SharedArrayBuffer (used by SuperTux WASM) requires COOP + COEP headers.
  // Static files in /public can't get headers from next.config.mjs, so we set them here.
  // /games/supertux        — route handler (serves supertux2.html with COOP+COEP)
  // /games/supertux/*      — static assets (supertux2.js, worker, images, SW)
  // /game/supertux         — Next.js page (iframe wrapper, needs credentialless COEP)
  if (pathname.startsWith('/games/supertux') || pathname === '/game/supertux') {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    // Both parent and iframe use require-corp so the iframe's crossOriginIsolated is true
    // on Safari. Safari added COEP credentialless support only in v17 (Sep 2023); on older
    // iOS, credentialless on the parent meant the iframe was NOT cross-origin isolated and
    // SharedArrayBuffer was undefined, crashing supertux2.js with a ReferenceError.
    // Downside: PostHog/Supabase fetch calls on the game page may be blocked (acceptable —
    // the game page has no auth-gated content and analytics failure is silent).
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    response.headers.set(CSP_HEADER, csp)
    return response
  }

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

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
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
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
  await supabase.auth.getUser()

  supabaseResponse.headers.set(CSP_HEADER, csp)
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
