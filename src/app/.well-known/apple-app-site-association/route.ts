import { NextResponse } from 'next/server'
import { SHOW_GAMES } from '@/lib/config/product'

/**
 * GET /.well-known/apple-app-site-association
 *
 * Serves the Apple App Site Association file for Universal Links and Shared Web Credentials.
 * Must be served as application/json — a static file in public/ cannot guarantee this because
 * Next.js does not apply headers() config to the public/ directory.
 *
 * Before deploying to TestFlight/App Store:
 *   Replace APPLE_TEAM_ID with the 10-character Team ID from
 *   App Store Connect → Membership → Team ID  (e.g. AB12CD34EF)
 */

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ['APPLE_TEAM_ID.com.tappyai.ios'],
        components: [
          { '/': '/chat*',         comment: 'AI Chat tab' },
          { '/': '/reviews*',      comment: 'Reviews & Explore tab' },
          { '/': '/discover*',     comment: 'Discovery tab' },
          // Games deep link withdrawn while Games is parked for Tappy Arcade V2
          // (SHOW_GAMES = false in @/lib/config/product). Restore this entry when
          // the feature ships — the routes themselves were never removed.
          ...(SHOW_GAMES ? [{ '/': '/game*', comment: 'Games tab' }] : []),
          { '/': '/profile*',      comment: 'Profile tab' },
          { '/': '/subscription*', comment: 'Subscription screen' },
          { '/': '/*',             comment: 'Catch-all — routed by DeepLinkHandler' },
        ],
      },
    ],
  },
  webcredentials: {
    apps: ['APPLE_TEAM_ID.com.tappyai.ios'],
  },
}

export function GET() {
  return NextResponse.json(AASA, {
    headers: {
      // Apple's CDN caches the AASA. 1 h is short enough to pick up Team-ID updates quickly.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
