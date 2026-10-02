import { NextResponse } from 'next/server'
import { appleAppSiteAssociation } from '@/lib/growth/appLinks'

// iOS Universal Links association. 404 until IOS_UNIVERSAL_LINKS_APP_ID is configured
// (owner action) — see src/lib/growth/appLinks.ts. Served as application/json, no extension.
export const dynamic = 'force-dynamic'

export function GET() {
  const body = appleAppSiteAssociation()
  if (!body) return new NextResponse(null, { status: 404 })
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
