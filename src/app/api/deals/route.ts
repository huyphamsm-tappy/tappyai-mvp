import { getShopeeDeals } from '@/lib/shopee-deals'
import { NextResponse } from 'next/server'

// GET /api/deals — the same daily-rotating curated deal pool the web's /deals page renders
// (getShopeeDeals()), exposed as REST for Android. No auth: the web page itself has no login
// gate (browse-only access policy), and the data isn't user-scoped — it's a deterministic
// same-for-everyone pool reshuffled once per day.
export async function GET() {
  const deals = await getShopeeDeals()
  return NextResponse.json({ deals })
}
