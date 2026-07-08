/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build gates ENFORCED: production builds fail on TypeScript or ESLint errors.
  // (Previously both were disabled via ignoreBuildErrors/ignoreDuringBuilds,
  // which let type/lint regressions reach production unchecked.)
  experimental: {
    // By default Next.js keeps dynamic-page RSC payloads in the Router Cache
    // (client-side in-memory) for 30 seconds. Back navigation within that window
    // serves the stale snapshot instead of re-fetching from the server.
    // For a chat app this causes conversations to appear empty: the snapshot was
    // taken before the user chatted, so savedMessages is outdated.
    // Setting dynamic to 0 forces every navigation (including Back) to re-fetch.
    staleTimes: { dynamic: 0 },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
  async headers() {
    // Baseline security headers applied to every route. CSP is intentionally
    // omitted here — a strict policy needs per-page testing against inline
    // styles, Stripe, and remote images, and is tracked as a follow-up.
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Camera (OCR), mic (voice), geolocation ("tìm quanh đây") are used by the
      // app itself; allow same-origin only and deny the rest by default.
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), browsing-topics=()' },
      // HSTS — Vercel serves HTTPS everywhere; pin it for 2 years.
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ]
    return [
      {
        // COOP + COEP on the parent Next.js page (required for embedded iframe SharedArrayBuffer).
        // Static files in public/ are handled via vercel.json (middleware can't reach them).
        source: '/game/supertux',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      { source: '/:path*', headers: securityHeaders },
    ]
  },
}

export default nextConfig
