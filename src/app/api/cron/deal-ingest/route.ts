import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { DEAL_SOURCES, rowsForSource, type DealRow, type DealSource } from '@/lib/deals/accesstradeOffers'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// GET /api/cron/deal-ingest — once a day (vercel.json): pulls the ACTIVE promotions of Lazada and Vexere from Accesstrade and keeps them as partner_deals rows
// (metadata.source = 'accesstrade'), which the Deals page, Android and iOS already read through GET /api/deals. Admin-written rows are never touched.
//
// Per partner: fetch -> keep valid offers (accesstradeOffers.ts) -> INSERT the new rows -> only then delete the previous importer rows of that partner. A failed fetch, or one
// with no valid offer, leaves what is on the page as it is (a partner is never emptied by a bad day). The rows expire by themselves (end_at, enforced by the table's RLS).
//
// Auth: CRON_SECRET (the same gate as every cron). Key: ACCESSTRADE_API_KEY, sent as `Authorization: Token <key>`; never logged, never returned.

const ENDPOINT = 'https://api.accesstrade.vn/v1/offers_informations'

type Outcome = { partner: string; fetched: number; kept: number; written: number; skipped?: string }

async function fetchOffers(src: DealSource, key: string): Promise<unknown | null> {
  const url = `${ENDPOINT}?${new URLSearchParams({ domain: src.domain, status: '1', limit: '50', page: '1' }).toString()}`
  const res = await fetch(url, { headers: { Authorization: `Token ${key}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (!res.ok) {
    console.warn(JSON.stringify({ type: 'tappyai_deal_ingest', partner: src.partnerId, status: res.status }))
    return null
  }
  return res.json()
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const key = process.env.ACCESSTRADE_API_KEY
  if (!key) return NextResponse.json({ ok: false, reason: 'no_key' }, { status: 503 })

  const admin = createAdminClient()
  const now = new Date()
  const outcomes: Outcome[] = []

  for (const src of DEAL_SOURCES) {
    const out: Outcome = { partner: src.partnerId, fetched: 0, kept: 0, written: 0 }
    try {
      const json = await fetchOffers(src, key)
      if (json === null) { out.skipped = 'fetch_failed'; outcomes.push(out); continue }
      const rows: DealRow[] = rowsForSource(json, src, now)
      out.kept = rows.length
      if (rows.length === 0) { out.skipped = 'no_valid_offers'; outcomes.push(out); continue }

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
