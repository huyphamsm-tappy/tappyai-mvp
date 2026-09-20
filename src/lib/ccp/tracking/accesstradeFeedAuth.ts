// ── ACCESSTRADE feed credentials — read HERE and nowhere else (architecture rule
// no-affiliate-keys-outside-ccp-tracking) ─────────────────────────────────────────────────
//
// B5 (2026-09-20): the feed ingester (src/lib/commerce/feedIngest.ts) performs the fetch — CCP
// does no I/O — but the token it sends is resolved by this module, so the credential is read in
// the one directory the guard allows. Returns the header value or null; never logs the key.

export interface FeedAuth { authorization: string; endpointTemplate: string }

/** The publisher token and the authenticated datafeed endpoint template (`{campaign}` placeholder), or null when either is absent. */
export function accesstradeFeedAuth(env: NodeJS.ProcessEnv = process.env): FeedAuth | { missing: 'ACCESSTRADE_API_KEY' | 'ACCESSTRADE_FEED_ENDPOINT' } {
  const key = env.ACCESSTRADE_API_KEY?.trim()
  if (!key) return { missing: 'ACCESSTRADE_API_KEY' }
  const template = env.ACCESSTRADE_FEED_ENDPOINT?.trim()
  if (!template) return { missing: 'ACCESSTRADE_FEED_ENDPOINT' }
  return { authorization: `Token ${key}`, endpointTemplate: template }
}
