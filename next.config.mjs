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
    // Content-Security-Policy. Tuned to exactly what the app loads:
    //   scripts  — self + PostHog; 'unsafe-inline' for Next's bootstrap inline
    //              scripts and 'wasm-unsafe-eval' for the SuperTux WASM game
    //              (no nonce pipeline, so inline can't be dropped yet).
    //   styles   — self + Google Fonts CSS; 'unsafe-inline' for Tailwind's
    //              inline style props (animationDelay, etc.).
    //   img/media— any https + data/blob (place photos come from many CDNs;
    //              review video/music from Blob/Supabase).
    //   connect  — Supabase (REST + realtime wss), PostHog, Nominatim geocode,
    //              Vercel vitals; everything else is same-origin /api.
    //   frame    — self (SuperTux iframe) + YouTube embeds. Stripe checkout is a
    //              full-page redirect, so it needs no frame/script entry.
    //   frame-ancestors 'self' — clickjacking guard (supersedes X-Frame-Options).
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://us.i.posthog.com https://us-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://nominatim.openstreetmap.org https://vitals.vercel-insights.com",
      "frame-src 'self' https://www.youtube.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join('; ')

    // Baseline security headers applied to every route.
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
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
