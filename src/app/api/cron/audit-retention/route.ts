import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// audit-retention cron — F-096 (owner 2026-09-25). Two retention clocks, both in SQL
// (migration 20260925d, service_role only):
//   audit_log_client_sweep(90)  IP address + user-agent of audit rows: 90 days
//   audit_log_prune(12)         the chain itself: 12 months, pruned behind a verified anchor;
//                               refuses (and reports) if the old prefix does not verify.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const sweep = await db.rpc('audit_log_client_sweep', { p_days: 90 })
  const prune = await db.rpc('audit_log_prune', { p_months: 12 })
  const out = {
    clientRowsDeleted: typeof sweep.data === 'number' ? sweep.data : null,
    chainRowsPruned: typeof prune.data === 'number' ? prune.data : null,
    sweepError: sweep.error?.code ?? null,
    pruneError: prune.error?.code ?? null,
  }
  const ok = !sweep.error && !prune.error
  const line = JSON.stringify({ type: 'tappyai_cron', job: 'audit-retention', ok, ...out })
  if (ok) console.log(line)
  else console.error(line)
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 500 })
}
