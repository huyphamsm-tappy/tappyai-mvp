import { amount, asArray, asRecord, currencyOf, fail, missingInUrl, ok, ownedUrl, pickUrls, post, text } from './common'
import type { AdapterDeps, Outcome, RealtimeAdapter, RecheckResult, SearchCriteria, SearchResult } from './types'

// ── Booking.com Demand API adapter ───────────────────────────────────────────────────────────────────────────────────────────
// Flow (owner brief 06/10): accommodations/search → user picks → accommodations/availability (realtime price + availability) →
// provider url → handoff. Request shapes follow the public Demand API reference (POST …/accommodations/search and …/availability:
// booker, checkin, checkout, guests{number_of_adults, number_of_rooms}, city | accommodations; headers Authorization: Bearer + X-Affiliate-Id).
//
// ⚠ NOT VERIFIED AGAINST A LIVE OR SANDBOX ACCOUNT. The response mapper below is TOLERANT by design: the price may sit at products[].price.total
// / .book / .base (number, numeric string or {amount|value}), and the URL may be a string or a {web, app} object (v3.x "unified url") or the older
// `url` + `deep_link_url` pair — none of those is assumed. The API version is NOT hard-coded: the base URL comes from env, so 3.1 → 3.2 is config.
// BLOCKED — awaiting provider access (Affiliate Partner Center rights + Demand API token). Until then the feature flag stays OFF.
//
// Server env NAMES (values never in code, logs or results): BOOKING_DEMAND_API_BASE · BOOKING_DEMAND_TOKEN · BOOKING_DEMAND_AFFILIATE_ID.

const ENV = { base: 'BOOKING_DEMAND_API_BASE', token: 'BOOKING_DEMAND_TOKEN', affiliate: 'BOOKING_DEMAND_AFFILIATE_ID' } as const
const SOURCE_SEARCH = 'booking-demand/accommodations.search'
const SOURCE_AVAILABILITY = 'booking-demand/accommodations.availability'

function headers(env: AdapterDeps['env']): Record<string, string> {
  return { authorization: `Bearer ${env[ENV.token]}`, 'x-affiliate-id': String(env[ENV.affiliate]) }
}

const endpoint = (env: AdapterDeps['env'], path: string) => `${String(env[ENV.base]).replace(/\/+$/, '')}${path}`

/** The stay part of a request, or a reason the criteria cannot be asked. */
function stayBody(c: SearchCriteria): Outcome<Record<string, unknown>> {
  const x = c.context
  if (!x.checkIn || !x.checkOut || !x.adults) return fail('unsupported', 'needs checkIn, checkOut, adults')
  const children = x.children ?? 0
  if (children > 0 && (x.childrenAges?.length ?? 0) !== children) return fail('needs_children_ages')
  return ok({
    booker: { country: (c.userCountry ?? 'vn').toLowerCase(), platform: 'desktop' },
    checkin: x.checkIn,
    checkout: x.checkOut,
    guests: { number_of_adults: x.adults, number_of_rooms: x.rooms ?? 1, ...(children > 0 ? { children: x.childrenAges } : {}) },
    ...(c.currency ? { currency: c.currency } : {}),
  })
}

/** Lowest price across an accommodation's products, with the product that carries it. */
function cheapest(products: unknown[]): { price: number; url: unknown; deep: unknown } | null {
  let best: { price: number; url: unknown; deep: unknown } | null = null
  for (const p of products) {
    const r = asRecord(p)
    if (!r) continue
    const pr = asRecord(r.price)
    const price = pr ? (amount(pr.total) ?? amount(pr.book) ?? amount(pr.base)) : amount(r.price)
    if (price === null) continue
    if (!best || price < best.price) best = { price, url: r.url ?? null, deep: r.deep_link_url ?? null }
  }
  return best
}

export function mapAccommodation(raw: unknown, c: SearchCriteria, requestId: string, now: Date, source: string): SearchResult | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = r.id === undefined || r.id === null ? null : String(r.id)
  if (!id || !/^\d{1,12}$/.test(id)) return null
  const products = asArray(r.products)
  const best = cheapest(products)
  // URL: the product's, else the accommodation's own. Both forms (string / {web,app} / deep_link_url) are read.
  const urls = pickUrls(best?.url ?? r.url, best?.deep ?? r.deep_link_url)
  const bookingUrl = ownedUrl('booking', urls.web)
  const deepLinkUrl = ownedUrl('booking', urls.app)
  const currency = currencyOf(r.currency) ?? c.currency ?? null
  return {
    provider: 'booking',
    vertical: 'hotel',
    providerItemId: id,
    title: text(r.name) ?? `Chỗ nghỉ #${id}`,
    subtitle: c.context.destination ?? null,
    price: best && currency ? best.price : null, // a price without a currency is no price
    currency: best && currency ? currency : null,
    availability: null, // the API reports products, not a room count
    availabilityStatus: products.length > 0 ? 'available' : 'sold_out',
    lastCheckedAt: now.toISOString(),
    source: 'REALTIME_TAPPY',
    realtimeSource: source,
    bookingUrl,
    deepLinkUrl,
    context: c.context,
    contextMissingInUrl: missingInUrl(bookingUrl, c.context),
    rawReference: `booking:${requestId}:${id}`,
  }
}

export const bookingDemandAdapter: RealtimeAdapter = {
  provider: 'booking',
  verticals: ['hotel'],
  credentialEnv: [ENV.base, ENV.token, ENV.affiliate],
  flagEnv: 'CCP_REALTIME_BOOKING',

  async search(criteria, deps) {
    if (criteria.vertical !== 'hotel') return fail('unsupported', 'hotel only')
    const stay = stayBody(criteria)
    if (!stay.ok) return stay
    const x = criteria.context
    const own = x.providerRefs?.booking
    const ids = (own?.propertyRefs ?? []).filter(i => /^\d{1,12}$/.test(i)).map(Number).slice(0, 100)
    const city = own?.cityRef && /^-?\d{1,12}$/.test(own.cityRef) ? Number(own.cityRef) : null
    // A destination NAME is never sent: the API takes ids. Resolving a name to a Booking city id is a separate (locations) call.
    if (!ids.length && city === null) return fail('needs_location_id')
    const body = { ...stay.value, ...(ids.length ? { accommodations: ids } : { city }), extras: ['products'] }
    const res = await post(deps, endpoint(deps.env, '/accommodations/search'), headers(deps.env), body)
    if (!res.ok) return res
    const root = asRecord(res.value)
    const data = root && Array.isArray(root.data) ? root.data : null
    if (!data) return fail('malformed')
    const requestId = text(root?.request_id, 80) ?? 'unknown'
    const now = deps.now()
    const results = data.map(d => mapAccommodation(d, criteria, requestId, now, SOURCE_SEARCH)).filter((r): r is SearchResult => r !== null).slice(0, criteria.limit ?? 20)
    if (data.length > 0 && results.length === 0) return fail('malformed')
    return results.length ? ok(results) : fail('empty')
  },

  async recheck(item, criteria, deps): Promise<Outcome<RecheckResult>> {
    const stay = stayBody(criteria)
    if (!stay.ok) return stay
    const body = { ...stay.value, accommodation: Number(item.providerItemId) }
    const res = await post(deps, endpoint(deps.env, '/accommodations/availability'), headers(deps.env), body)
    if (!res.ok) return res
    const root = asRecord(res.value)
    const data = asRecord(root?.data)
    if (!data) return fail('malformed')
    const current = mapAccommodation({ ...data, id: data.id ?? item.providerItemId }, criteria, text(root?.request_id, 80) ?? 'unknown', deps.now(), SOURCE_AVAILABILITY)
    if (!current) return fail('malformed')
    if (current.availabilityStatus === 'sold_out' || current.price === null) return ok({ status: 'unavailable', previousPrice: item.price, currentPrice: null, result: null })
    const changed = item.price !== null && current.price !== item.price
    return ok({ status: changed ? 'price_changed' : 'ok', previousPrice: item.price, currentPrice: current.price, result: current })
  },
}
