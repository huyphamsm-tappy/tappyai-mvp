import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// decision-evidence-sweep cron — F-097. decision_evidence rows carry a 2-hour TTL that was
// enforced only on read; an owner who never came back kept their rows forever. This deletes the
// expired ones through decision_evidence_sweep() (migration 20260925b, service_role only).
// Bounded per call; a backlog clears over successive runs. Counts only are logged — never rows.

const BATCH = 5000

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('decision_evidence_sweep', { p_limit: BATCH })
  if (error) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'decision-evidence-sweep', ok: false, code: error.code ?? null }))
    return NextResponse.json({ ok: false, error: 'sweep_failed' }, { status: 500 })
  }
  const deleted = typeof data === 'number' ? data : 0
  console.log(JSON.stringify({ type: 'tappyai_cron', job: 'decision-evidence-sweep', ok: true, deleted, more: deleted >= BATCH }))
  return NextResponse.json({ ok: true, deleted, more: deleted >= BATCH })
}
