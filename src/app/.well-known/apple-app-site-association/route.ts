import { NextResponse } from 'next/server'
import { appleAppSiteAssociation } from '@/lib/growth/appLinks'

// iOS Universal Links association (see src/lib/growth/appLinks.ts).
//
// Apple's CDN fetches this over HTTPS with no redirects, and it must be JSON at exactly this path
// with no file extension. NextResponse.json sets `Content-Type: application/json`, which a static
// file in public/ with no extension cannot be relied on to get. No env, no secrets, so it is built
// once and served from the edge cache.
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(appleAppSiteAssociation(), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
