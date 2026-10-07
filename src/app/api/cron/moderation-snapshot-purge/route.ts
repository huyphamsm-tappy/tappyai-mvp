import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

// GET /api/cron/moderation-snapshot-purge — clears the comment snapshots kept on the strike ledger for appeals, once they are older than
// 60 days and have no pending appeal (public.moderation_purge_snapshots, the one edit the immutable ledger allows). Behind
// MODERATION_ADMIN_ENABLED (404 off) and the CRON secret. NOT scheduled in vercel.json yet — the line to add is in Part B.

export async function GET(req: Request) {
  if (!moderationAdminEnabled()) return new NextResponse(null, { status: 404 })
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await createAdminClient().rpc('moderation_purge_snapshots', { p_older_than_days: 60 })
  if (error) return NextResponse.json({ error: 'purge_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, purged: data ?? 0 })
}
