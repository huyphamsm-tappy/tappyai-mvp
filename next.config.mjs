/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
    ],
  },
  async headers() {
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
    ]
  },
}

export default nextConfig
