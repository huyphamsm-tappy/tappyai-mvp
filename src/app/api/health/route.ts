import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/health — liveness + database-reachability probe for uptime monitors
// and load balancers. Cheap head-count against a tiny reference table. Returns
// 200 {status:"ok"} when the DB is reachable, 503 otherwise. No internal detail
// is exposed in the body (errors are logged server-side only).
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('music_providers')
      .select('id', { count: 'exact', head: true })

    if (error) {
      console.error('[health] DB check failed:', error.message)
      return NextResponse.json({ status: 'degraded' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ status: 'ok' }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[health] check failed:', e)
    return NextResponse.json({ status: 'error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
