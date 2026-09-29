import { NextResponse } from 'next/server'
import { PLAN_IMAGE_MANIFEST } from '@/lib/plans/images/manifest'

// R22: public and cacheable — the plan-card image manifest (see lib/plans/images/manifest.ts).
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(PLAN_IMAGE_MANIFEST, { headers: { 'cache-control': 'public, max-age=3600, s-maxage=3600' } })
}
