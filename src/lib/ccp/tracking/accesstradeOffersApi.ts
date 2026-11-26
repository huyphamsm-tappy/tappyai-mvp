// ── ACCESSTRADE promotions API — request description (no I/O) ─────────────────
// The Deals importer (src/app/api/cron/deal-ingest) reads the ACTIVE promotions of a few merchants from Accesstrade. The network, its endpoint, its credential and the hosts a
// tracked link may point to are CCP knowledge (the architecture guard keeps merchant / affiliate hosts and affiliate credentials inside src/lib/ccp), so this file only DESCRIBES
// the request; the route sends it. CCP itself performs no network I/O.
//
// Endpoint (developers.accesstrade.vn, "Get promotional information"): GET /v1/offers_informations, header `Authorization: Token <key>`, filters `domain`, `status=1`
// (active), `limit`, `page`. ACCESSTRADE_API_KEY is read here and nowhere else; it is never logged or returned.

const OFFERS_ENDPOINT = 'https://api.accesstrade.vn/v1/offers_informations'

/** Which merchants the importer asks for, and where a tracked link of each may point (the Accesstrade deep-link host and the merchant's own). */
export const OFFER_ROUTES = {
  lazada: { domain: 'lazada.vn', linkHosts: ['go.isclix.com', 'lazada.vn'] },
  vexere: { domain: 'vexere.com', linkHosts: ['go.isclix.com', 'vexere.com'] },
} as const

export type OfferRouteId = keyof typeof OFFER_ROUTES

export function isAccesstradeOffersConfigured(): boolean {
  return Boolean(process.env.ACCESSTRADE_API_KEY)
}

/** The request for one merchant's active promotions, or null when the key is not configured. */
export function accesstradeOffersRequest(route: OfferRouteId): { url: string; headers: Record<string, string> } | null {
  const key = process.env.ACCESSTRADE_API_KEY
  if (!key) return null
  const query = new URLSearchParams({ domain: OFFER_ROUTES[route].domain, status: '1', limit: '50', page: '1' })
  return { url: `${OFFERS_ENDPOINT}?${query.toString()}`, headers: { Authorization: `Token ${key}`, Accept: 'application/json' } }
}
