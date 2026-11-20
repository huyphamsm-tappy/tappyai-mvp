import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { tviMaintainOn, runTviMaintenance } from '@/lib/tvi/maintain'
import { loadCoverageRows, summarizeCoverage } from '@/lib/tvi/coverage'

export const runtime = 'nodejs'
export const maxDuration = 60

// TVI maintenance cron (R13 §8, phase A): promotes candidates that have enough evidence, expires facts whose validity ended, and reports the store's coverage (counts only).
// OFF unless TVI_MAINTAIN=1 (locked off in a production runtime). It is NOT scheduled in vercel.json: it is run by hand or by a scheduler the owner adds.

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!tviMaintainOn()) return NextResponse.json({ ok: true, skipped: 'flag_off' })

  const db = createAdminClient()
  const maintain = await runTviMaintenance(db)
  const { entities, rows } = await loadCoverageRows(db)
  const coverage = summarizeCoverage(rows, entities)
  console.log(JSON.stringify({ type: 'tappyai_tvi_coverage', entities: coverage.entities, facts: coverage.facts, activeShare: coverage.activeShare, byStatus: coverage.byStatus, freshness: coverage.freshness }))
  return NextResponse.json({ ok: true, maintain, coverage })
}
