import { CCP_FEED_INGEST_ENABLED } from '@/lib/config/product'

// ── Feed transport policy (owner decision D6) ────────────────────────────────
// The public static host datafeed.accesstrade.me presents a TLS certificate
// that expired on 21 Oct 2021, so a default HTTPS client refuses it. The
// decision: fetch feeds ONLY from an authenticated HTTPS endpoint (the
// /v1/datafeeds API or another valid one); NEVER fall back to plain http://;
// NEVER relax certificate validation; treat a broken-TLS endpoint as
// unavailable. This module encodes that policy as data + a checker so an
// ingester cannot be pointed at an unsafe source by configuration.

export type FeedSourceDecision =
  | { ok: true; endpoint: URL }
  | { ok: false; reason: 'ingest_disabled' | 'not_https' | 'host_not_allowed' | 'known_broken_tls' | 'unparseable' }

/** Hosts whose TLS is known broken as of 13 Sep 2026 — treated as unavailable. */
export const KNOWN_BROKEN_TLS_HOSTS = ['datafeed.accesstrade.me'] as const
/** Authenticated API hosts allowed for feed ingestion. */
export const FEED_API_HOSTS = ['api.accesstrade.vn'] as const

export function decideFeedSource(endpoint: string, ingestEnabled: boolean = CCP_FEED_INGEST_ENABLED): FeedSourceDecision {
  if (!ingestEnabled) return { ok: false, reason: 'ingest_disabled' }
  let u: URL
  try {
    u = new URL(endpoint)
  } catch {
    return { ok: false, reason: 'unparseable' }
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' }
  const host = u.hostname.toLowerCase()
  if ((KNOWN_BROKEN_TLS_HOSTS as readonly string[]).includes(host)) return { ok: false, reason: 'known_broken_tls' }
  if (!(FEED_API_HOSTS as readonly string[]).includes(host)) return { ok: false, reason: 'host_not_allowed' }
  return { ok: true, endpoint: u }
}

/**
 * Request options an ingester must use. There is deliberately no option to
 * disable certificate checks: Node's fetch validates by default and this
 * module never exposes `rejectUnauthorized` or an agent override.
 */
export const FEED_FETCH_OPTIONS = Object.freeze({
  redirect: 'error' as const, // a feed endpoint that redirects is not the endpoint we validated
  maxBytes: 64 * 1024 * 1024,
  timeoutMs: 60_000,
})
