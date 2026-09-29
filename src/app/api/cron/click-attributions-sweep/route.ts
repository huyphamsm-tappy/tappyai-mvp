import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// click-attributions-sweep cron — R21 (2026-09-29). The affiliate click joins (sub1 → identity,
// commerce_click_attributions, Phương án C) are kept 12 months for commission reconciliation; this
// deletes older rows through commerce_click_attributions_sweep() (migration 20260929140000,
// service_role only). Bounded per call; a backlog clears over successive daily runs.
// Counts only are logged — never a sub1 or an identity.

const BATCH = 5000

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('commerce_click_attributions_sweep', { p_limit: BATCH })
  if (error) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'click-attributions-sweep', ok: false, code: error.code ?? null }))
    return NextResponse.json({ ok: false, error: 'sweep_failed' }, { status: 500 })
  }
  const deleted = typeof data === 'number' ? data : 0
  console.log(JSON.stringify({ type: 'tappyai_cron', job: 'click-attributions-sweep', ok: true, deleted, more: deleted >= BATCH }))
  return NextResponse.json({ ok: true, deleted, more: deleted >= BATCH })
}
