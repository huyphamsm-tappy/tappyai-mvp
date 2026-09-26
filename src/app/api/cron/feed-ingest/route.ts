import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { feedMerchants, ingestMerchantFeed, feedRow } from '@/lib/commerce/feedIngest'

// B5 (2026-09-20): the ACCESSTRADE feed ingest, one run per approved merchant (the runtime
// registry decides which), under D6's transport policy. Rows land in `commerce_feed_items`
// (upsert on provider + sku); every run is recorded in `commerce_feed_runs`. A merchant that
// cannot be ingested (no credentials, a refused source, an HTTP error) is recorded as such —
// visible, never silent — and the run moves on to the next.
//
// Same CRON_SECRET bearer as the other crons; `vercel.json` schedules it daily.

export const maxDuration = 300

const BATCH = 500

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const merchants = await feedMerchants()
  const report: Array<Record<string, unknown>> = []
  for (const m of merchants) {
    const { data: run } = await supabase.from('commerce_feed_runs').insert({ provider_id: m.providerId }).select('id').single()
    const out = await ingestMerchantFeed(m)
    if (!out.ok) {
      console.error(JSON.stringify({ type: 'tappyai_feed_ingest', provider: m.providerId, outcome: out.reason, detail: out.detail ?? null }))
      await supabase.from('commerce_feed_runs').update({ finished_at: new Date().toISOString(), outcome: out.reason, detail: out.detail ?? null }).eq('id', run?.id ?? -1)
      report.push({ provider: m.providerId, outcome: out.reason, detail: out.detail ?? null })
      continue
    }
    let written = 0
    for (let i = 0; i < out.items.length; i += BATCH) {
      const rows = out.items.slice(i, i + BATCH).map(it => feedRow(m.providerId, it))
      const { error } = await supabase.from('commerce_feed_items').upsert(rows, { onConflict: 'provider_id,sku' })
      if (error) { console.error(JSON.stringify({ type: 'tappyai_feed_ingest', provider: m.providerId, outcome: 'db_error', detail: error.message.slice(0, 120) })); break }
      written += rows.length
    }
    console.log(JSON.stringify({ type: 'tappyai_feed_ingest', provider: m.providerId, outcome: 'ok', rows_total: out.rowsTotal, rows_kept: out.rowsKept, rows_rejected: out.rowsRejected, written }))
    await supabase.from('commerce_feed_runs').update({ finished_at: new Date().toISOString(), outcome: 'ok', rows_total: out.rowsTotal, rows_kept: out.rowsKept, rows_rejected: out.rowsRejected }).eq('id', run?.id ?? -1)
    report.push({ provider: m.providerId, outcome: 'ok', rows_kept: out.rowsKept, written })
  }
  return NextResponse.json({ merchants: merchants.length, report })
}
