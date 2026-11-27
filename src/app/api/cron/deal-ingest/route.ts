import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { accesstradeOffersRequest, isAccesstradeOffersConfigured } from '@/lib/ccp/tracking/accesstradeOffersApi'
import { DEAL_SOURCES, describeAnswer, rowsForSource, type DealRow, type DealSource } from '@/lib/deals/accesstradeOffers'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// GET /api/cron/deal-ingest — once a day (vercel.json): pulls the ACTIVE promotions of Lazada and Vexere from Accesstrade and keeps them as partner_deals rows
// (metadata.source = 'accesstrade'), which the Deals page, Android and iOS already read through GET /api/deals. Admin-written rows are never touched.
//
// Per partner: fetch -> keep valid offers (accesstradeOffers.ts) -> INSERT the new rows -> only then delete the previous importer rows of that partner. A failed fetch, or one
// with no valid offer, leaves what is on the page as it is (a partner is never emptied by a bad day). The rows expire by themselves (end_at, enforced by the table's RLS).
//
// Auth: CRON_SECRET (the same gate as every cron). The Accesstrade request (endpoint, token header, filters) is described by src/lib/ccp/tracking/accesstradeOffersApi.ts, which is
// the only place that knows the key; it is never logged and never returned here.

type Outcome = { partner: string; kept: number; written: number; skipped?: string }

// Accesstrade answered the second call of the first run (27/11/2026) with 429: the calls are spaced out and a 429 is retried once after a pause.
const PAUSE_MS = process.env.NODE_ENV === 'test' ? 0 : 2500
const pause = (ms: number) => (ms > 0 ? new Promise<void>(r => setTimeout(r, ms)) : Promise.resolve())

async function fetchOffers(src: DealSource): Promise<unknown | null> {
  const req = accesstradeOffersRequest(src.partnerId)
  if (!req) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(req.url, { headers: req.headers, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (res.ok) return res.json()
    console.warn(JSON.stringify({ type: 'tappyai_deal_ingest', partner: src.partnerId, status: res.status, attempt }))
    if (res.status !== 429) return null
    await pause(PAUSE_MS * 2)
  }
  return null
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAccesstradeOffersConfigured()) return NextResponse.json({ ok: false, reason: 'no_key' }, { status: 503 })

  const admin = createAdminClient()
  const now = new Date()
  const outcomes: Outcome[] = []

  for (const src of DEAL_SOURCES) {
    const out: Outcome = { partner: src.partnerId, kept: 0, written: 0 }
    if (src !== DEAL_SOURCES[0]) await pause(PAUSE_MS)
    try {
      const json = await fetchOffers(src)
      if (json === null) { out.skipped = 'fetch_failed'; outcomes.push(out); continue }
      const rows: DealRow[] = rowsForSource(json, src, now)
      out.kept = rows.length
      if (rows.length === 0) {
        // The answer held nothing we may show: say what it looked like (counts by reason, key names, hosts; no key, no codes) so the next fix is not a guess.
        console.warn(JSON.stringify({ type: 'tappyai_deal_ingest_empty', partner: src.partnerId, answer: describeAnswer(json, src, now) }))
        out.skipped = 'no_valid_offers'; outcomes.push(out); continue
      }

      // the importer's previous rows of this partner, read BEFORE inserting so only they are removed afterwards
      const { data: old } = await admin.from('partner_deals').select('id').eq('partner_slug', src.partnerId).eq('metadata->>source', 'accesstrade')
      const { data: inserted, error } = await admin.from('partner_deals').insert(rows).select('id')
      if (error) { console.error('[deal-ingest] insert:', error.message); out.skipped = 'insert_failed'; outcomes.push(out); continue }
      out.written = inserted?.length ?? 0
      const oldIds = ((old ?? []) as Array<{ id: string }>).map(r => r.id)
      if (oldIds.length) await admin.from('partner_deals').delete().in('id', oldIds)
    } catch (e) {
      console.error('[deal-ingest]', src.partnerId, e instanceof Error ? e.message : e)
      out.skipped = 'error'
    }
    outcomes.push(out)
  }

  console.log(JSON.stringify({ type: 'tappyai_deal_ingest_done', outcomes }))
  return NextResponse.json({ ok: true, outcomes })
}
