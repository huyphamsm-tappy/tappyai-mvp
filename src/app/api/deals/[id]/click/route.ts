import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/deals/[id]/click — bump a partner deal's popularity counter by 1.
// NOT analytics: no tracking SDK, no cookies, no user data — just an atomic +1
// via the SECURITY DEFINER `increment_deal_click` RPC (public clients can't
// UPDATE the table directly under RLS). Best-effort: any failure is swallowed
// and still returns 200 so it can never block the link from opening.
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    await supabase.rpc('increment_deal_click', { p_deal_id: params.id })
  } catch {
    /* never block link opening */
  }
  return NextResponse.json({ success: true })
}
