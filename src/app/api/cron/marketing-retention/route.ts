import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruneMarketingRetention } from '@/lib/marketing/retention'

// GET /api/cron/marketing-retention — prune marketing records past 1 year.
//
// Contract: M-26 (deliveries, REQUIRED by doc 34) · M-27 (campaigns, Owner
// decision) · M-27a (order, so nothing is orphaned).
//
// Runs daily — configured in vercel.json, 0 5 * * * (05:00 UTC = 12:00 VN).
//
// 🔑 THIS IS THE MACHINE PATH, AND IT USES `CRON_SECRET` LIKE EVERY OTHER CRON
// ROUTE. That is not the same thing as the retired `/api/notifications/
// broadcast`: this route DELETES OLD ROWS and cannot notify anybody. The reason
// the legacy broadcast route was retired is that a machine credential must not
// be able to reach a person — pruning reaches nobody.
//
// 🚨 IT SENDS NOTHING AND TOUCHES NO CONSENT. `marketing_consent` is
// deliberately absent from the prune: consent is a record of what a person
// agreed to and what they revoked, and M-24 requires a revocation to stay
// evidenced. Deleting an old consent row would return that user to "absence",
// which reads as opted out — behaviourally safe, and it would destroy the proof
// that they ever asked. No document assigns consent a retention period, and
// this route will not invent one.

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await pruneMarketingRetention(admin)
    // Counts only. Which rows were pruned is not reported, and a deleted
    // delivery's user id never appears here or in any log.
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    // Fails loudly rather than reporting success: a prune that silently did
    // nothing is indistinguishable from one that had nothing to do, and the
    // retention obligation would quietly stop being met.
    console.error('[cron][marketing-retention]', err)
    return NextResponse.json({ error: 'prune_failed' }, { status: 500 })
  }
}
