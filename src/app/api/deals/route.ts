import { getActiveDeals } from '@/lib/deals/partnerDeals'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/deals — public partner-deals feed, shared by web, Android and iOS.
// Returns ONLY active deals within their valid date window, sorted by
// display_order (all enforced by RLS + the query in getActiveDeals). No auth:
// this is public, non-user-scoped content. Reads live DB rows on each request
// (admin edits appear immediately), so it must never be statically cached.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get('country') || 'VN').toUpperCase()
  const deals = await getActiveDeals(country)
  return NextResponse.json({ success: true, deals })
}
