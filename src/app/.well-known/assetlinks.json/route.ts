import { NextResponse } from 'next/server'
import { assetLinks } from '@/lib/growth/appLinks'

// Android App Links statement. 404 until ANDROID_APP_LINKS_SHA256 is configured
// (owner action) — see src/lib/growth/appLinks.ts. Public by design; contains no secret.
export const dynamic = 'force-dynamic'

export function GET() {
  const body = assetLinks()
  if (!body) return new NextResponse(null, { status: 404 })
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
