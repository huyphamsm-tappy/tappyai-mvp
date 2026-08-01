import { getActiveDeals } from '@/lib/deals/partnerDeals'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/deals — public partner-deals feed, shared by web, Android and iOS.
// Returns ONLY active deals within their valid date window, sorted by
// display_order (all enforced by RLS + the query in getActiveDeals). No auth:
// this is public, non-user-scoped content. Reads live DB rows on each request
// (admin edits appear immediately), so it must never be statically cached.
//
// `?lang=` selects the display language for category/title/description (default
// vi). Clients pass their in-app language; unknown/absent locales fall back to
// vi field-by-field. `?country=` scopes the pool (default VN). Brand names are
// never translated (title stays the base value unless a deal defines a locale
// title). The Accept-Language header is a fallback when ?lang= is absent.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get('country') || 'VN').toUpperCase()
  const lang =
    req.nextUrl.searchParams.get('lang') ||
    // First tag of Accept-Language, e.g. "en-US,en;q=0.9" → "en-US".
    req.headers.get('accept-language')?.split(',')[0]?.trim() ||
    'vi'
  const deals = await getActiveDeals(country, lang)
  return NextResponse.json({ success: true, deals })
}
