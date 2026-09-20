// ── B5 (2026-09-20): ACCESSTRADE feed INGEST for the approved merchants ──────────────────────
//
// D6 (owner): a feed is fetched ONLY from an authenticated HTTPS endpoint (`decideFeedSource`,
// src/lib/ccp/feeds/source.ts — api.accesstrade.vn, never the broken-TLS static host, never
// plain http, never with certificate checks relaxed). CCP itself performs no I/O, so the fetch
// lives here and the pure parser (`parseAccesstradeCsv`) does the reading.
//
//   CCP_FEED_INGEST_ENABLED       ON since B5 (product.ts)
//   ACCESSTRADE_API_KEY           the publisher API token — read ONLY in ccp/tracking/ (accesstradeFeedAuth)
//   ACCESSTRADE_FEED_ENDPOINT     the authenticated datafeed URL, with `{campaign}` for the campaign id
//                                 (e.g. https://api.accesstrade.vn/v1/datafeeds?campaign={campaign}&format=csv)
//
// Which merchants: the ones the runtime registry says are Tier 1 with an Accesstrade campaign
// (the owner's `commerce_providers` table — `feedMerchants()`), so an approval landing in the
// table turns ingestion on for that merchant with no code edit.
//
// The feed carries NO stock and NO brand: nothing ingested here ever backs a stock claim (the
// shopping gate reports `in_stock` as a gap whenever it is asked) and brand stays a title match.

import { decideFeedSource, FEED_FETCH_OPTIONS } from '@/lib/ccp/feeds/source'
import { parseAccesstradeCsv, type FeedItem } from '@/lib/ccp/feeds/accesstradeCsv'
import { PROVIDER_REGISTRY, providerOverride, effectiveTracking, refreshProviderConfig } from '@/lib/ccp'
import { installProviderConfigSource } from './providerConfigSource'
import { accesstradeFeedAuth } from '@/lib/ccp/tracking/accesstradeFeedAuth'

export interface FeedMerchant { providerId: string; campaignId: string; allowedHosts: readonly string[] }

/** Tier 1 providers with an Accesstrade campaign, per the runtime registry (table first, code defaults after). */
export async function feedMerchants(): Promise<FeedMerchant[]> {
  installProviderConfigSource()
  await refreshProviderConfig()
  const out: FeedMerchant[] = []
  for (const p of PROVIDER_REGISTRY) {
    const t = effectiveTracking(p)
    const o = providerOverride(p.providerId)
    if (!t || t.network !== 'accesstrade' || !t.campaignId || t.approval !== 'approved') continue
    if (o && !o.active) continue
    out.push({ providerId: p.providerId, campaignId: t.campaignId, allowedHosts: p.allowedHosts })
  }
  return out
}

export type IngestOutcome =
  | { ok: true; providerId: string; rowsTotal: number; rowsKept: number; rowsRejected: number; items: FeedItem[] }
  | { ok: false; providerId: string; reason: 'blocked_no_credentials' | 'source_refused' | 'http' | 'too_large' | 'parse' | 'error'; detail?: string }

export interface IngestDeps {
  fetchImpl?: typeof fetch
  env?: NodeJS.ProcessEnv
  ingestEnabled?: boolean
}

/** One merchant's feed: fetched under D6, parsed, host-checked against the registry allow-list. Never throws. */
export async function ingestMerchantFeed(m: FeedMerchant, deps: IngestDeps = {}): Promise<IngestOutcome> {
  const auth = accesstradeFeedAuth(deps.env ?? process.env)
  if ('missing' in auth) return { ok: false, providerId: m.providerId, reason: 'blocked_no_credentials', detail: auth.missing }
  const endpoint = auth.endpointTemplate.replace('{campaign}', encodeURIComponent(m.campaignId))
  const decision = decideFeedSource(endpoint, deps.ingestEnabled)
  if (!decision.ok) return { ok: false, providerId: m.providerId, reason: 'source_refused', detail: decision.reason }
  const f = deps.fetchImpl ?? fetch
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), FEED_FETCH_OPTIONS.timeoutMs)
    let res: Response
    try {
      res = await f(decision.endpoint.toString(), { headers: { Authorization: auth.authorization, Accept: 'text/csv' }, redirect: FEED_FETCH_OPTIONS.redirect, signal: ctl.signal })
    } finally { clearTimeout(timer) }
    if (!res.ok) return { ok: false, providerId: m.providerId, reason: 'http', detail: String(res.status) }
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > FEED_FETCH_OPTIONS.maxBytes) return { ok: false, providerId: m.providerId, reason: 'too_large', detail: String(len) }
    const text = await res.text()
    if (text.length > FEED_FETCH_OPTIONS.maxBytes) return { ok: false, providerId: m.providerId, reason: 'too_large', detail: String(text.length) }
    const parsed = parseAccesstradeCsv(text, `${m.providerId}:${m.campaignId}`, { allowedHosts: m.allowedHosts })
    return { ok: true, providerId: m.providerId, rowsTotal: parsed.rowsTotal, rowsKept: parsed.items.length, rowsRejected: parsed.rowsRejected, items: parsed.items }
  } catch (e) {
    return { ok: false, providerId: m.providerId, reason: 'error', detail: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }
  }
}

/** The row shape written to `commerce_feed_items`. Pure. */
export function feedRow(providerId: string, it: FeedItem): Record<string, unknown> {
  return { provider_id: providerId, sku: it.sku, name: it.name, url: it.url, price: it.price, discount: it.discount, image: it.image, description: it.description, category: it.category, feed_file: it.feedFile, ingested_at: new Date().toISOString() }
}
