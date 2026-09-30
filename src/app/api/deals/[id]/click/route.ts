import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/security/rateLimit'
import { publicDailyRateLimit, publicRateLimit } from '@/lib/security/publicRateLimit'

// POST /api/deals/[id]/click — bump a partner deal's popularity counter by 1.
// NOT analytics: no tracking SDK, no cookies, no user data — just an atomic +1
// via the SECURITY DEFINER `increment_deal_click` RPC. Best-effort: any failure is
// swallowed and still returns 200 so it can never block the link from opening.
//
// security-audit L1 — the counter feeds affiliate popularity, and it was free to inflate: no
// rate limit here, and the RPC was granted to `anon`, so it could be called straight through
// PostgREST as well. Now:
//   * one COUNTED click per (deal, IP) per day, and at most 60 requests per IP per minute, both on
//     the distributed limiter (a refusal still answers 200 — the link must open);
//   * the id must be a UUID before anything is called;
//   * the RPC is called with the SERVICE ROLE, so 20260928b_revoke_increment_deal_click_public.sql
//     can take EXECUTE away from anon/authenticated without breaking this route.
// Every client (web DealsView, Android DealsApi, iOS DealsService) calls this route, never the RPC.
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notCounted = () => NextResponse.json({ success: true, counted: false })

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ip = clientIp(req)
    if (!(await publicRateLimit(`deal-click:${ip}`, 60, 60_000)).ok) return notCounted()
    if (!UUID.test(params.id)) return notCounted()
    if (!(await publicDailyRateLimit(`deal-click:${params.id}:${ip}`, 1)).ok) return notCounted()
    await createAdminClient().rpc('increment_deal_click', { p_deal_id: params.id })
    return NextResponse.json({ success: true, counted: true })
  } catch {
    /* never block link opening */
    return notCounted()
  }
}
