import { amount, asArray, asRecord, currencyOf, fail, missingInUrl, ok, ownedUrl, post, text } from './common'
import type { AdapterDeps, Outcome, RealtimeAdapter, RecheckResult, SearchCriteria, SearchResult } from './types'

// ── Agoda Search API adapter ─────────────────────────────────────────────────────────────────────────────────────────────────
// Agoda's Search API (2.0) returns rates + availability per property; the response carries `landingUrl` ONLY when the request asks for the
// `metaSearch` extra, so this adapter always asks for it. Request shape per the public reference: criteria{propertyIds | cityId, checkIn,
// checkOut, rooms, adults, children, childrenAges, language, currency}, features{extra[]}, and a user-context block with the traveller country.
//
// ⚠ NOT VERIFIED AGAINST A LIVE OR SANDBOX ACCOUNT. The reference does not publish the endpoint URL or the auth scheme in its public pages
// ("contact the Agoda technical team"), so BOTH come from env and nothing is guessed in code: AGODA_DEMAND_API_BASE is the full search URL,
// and the auth header is `authorization: <site id>:<key>` — the scheme of the affiliate Lite API — which MUST be confirmed with Agoda before go-live.
// BLOCKED — awaiting provider access: the Agoda partner account is still pending approval (domain not verified), so no API key can be issued yet.
//
// Precheck: Agoda's Precheck belongs to its BOOK API (verify the selected offer before booking). Tappy does not book — it hands the user to
// Agoda — so the equivalent safeguard here is `recheck`: re-ask the SAME property just before the handoff and compare price/availability.
// If Tappy is ever granted the Book API, Precheck replaces recheck at that step; it is never skipped for a booking Tappy itself submits.
//
// Server env NAMES (values never in code, logs or results): AGODA_DEMAND_API_BASE · AGODA_DEMAND_SITE_ID · AGODA_DEMAND_KEY.

const ENV = { base: 'AGODA_DEMAND_API_BASE', site: 'AGODA_DEMAND_SITE_ID', key: 'AGODA_DEMAND_KEY' } as const
const SOURCE = 'agoda-search/properties.search'

const headers = (env: AdapterDeps['env']): Record<string, string> => ({ authorization: `${env[ENV.site]}:${env[ENV.key]}` })

function requestBody(c: SearchCriteria, propertyIds: number[] | null, cityId: number | null): Outcome<Record<string, unknown>> {
  const x = c.context
  if (!x.checkIn || !x.checkOut || !x.adults) return fail('unsupported', 'needs checkIn, checkOut, adults')
  const children = x.children ?? 0
  if (children > 0 && (x.childrenAges?.length ?? 0) !== children) return fail('needs_children_ages')
  if (!propertyIds?.length && cityId === null) return fail('needs_location_id')
  return ok({
    liveOffersContext: { userContext: { userCountry: (c.userCountry ?? 'VN').toUpperCase() } },
    criteria: {
      ...(propertyIds?.length ? { propertyIds } : { cityId }),
      checkIn: x.checkIn,
      checkOut: x.checkOut,
      rooms: x.rooms ?? 1,
      adults: x.adults,
      children: children,
      ...(children > 0 ? { childrenAges: x.childrenAges } : {}),
      language: 'vi-vn',
      currency: c.currency ?? 'VND',
    },
    features: { extra: ['metaSearch', 'rateDetail'] },
  })
}

/** The cheapest room of a property (by total payment, else rate), with its currency and remaining-rooms hint. */
function cheapestRoom(rooms: unknown[]): { price: number; currency: unknown; remaining: number | null; landing: unknown } | null {
  let best: { price: number; currency: unknown; remaining: number | null; landing: unknown } | null = null
  for (const rm of rooms) {
    const r = asRecord(rm)
    if (!r) continue
    const pay = asRecord(r.totalPayment) ?? asRecord(r.rate)
    const price = pay ? (amount(pay.inclusive) ?? amount(pay.exclusive)) : null
    if (price === null) continue
    if (!best || price < best.price) {
      const rem = typeof r.remainingRooms === 'number' && Number.isFinite(r.remainingRooms) && r.remainingRooms >= 0 ? r.remainingRooms : null
      best = { price, currency: pay?.currency ?? (asRecord(r.rate)?.currency ?? null), remaining: rem, landing: r.landingUrl ?? r.landingURL ?? null }
    }
  }
  return best
}

export function mapProperty(raw: unknown, c: SearchCriteria, searchId: string, now: Date): SearchResult | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = r.propertyId === undefined || r.propertyId === null ? null : String(r.propertyId)
  if (!id || !/^\d{1,12}$/.test(id)) return null
  const rooms = asArray(r.rooms)
  const best = cheapestRoom(rooms)
  const currency = currencyOf(best?.currency) ?? null
  // landingUrl: the room's, else the property's. Only an https URL on Agoda's own hosts survives (a poisoned landing URL is dropped).
  const bookingUrl = ownedUrl('agoda', best?.landing ?? r.landingUrl ?? r.landingURL)
  return {
    provider: 'agoda',
    vertical: 'hotel',
    providerItemId: id,
    title: text(r.propertyName) ?? `Chỗ nghỉ #${id}`,
    subtitle: c.context.destination ?? null,
    price: best && currency ? best.price : null,
    currency: best && currency ? currency : null,
    availability: best?.remaining ?? null,
    availabilityStatus: rooms.length > 0 ? 'available' : 'sold_out',
    lastCheckedAt: now.toISOString(),
    source: 'REALTIME_TAPPY',
    realtimeSource: SOURCE,
    bookingUrl,
    deepLinkUrl: null, // Agoda's search contract has no app URL
    context: c.context,
    contextMissingInUrl: missingInUrl(bookingUrl, c.context),
    rawReference: `agoda:${searchId}:${id}`,
  }
}

async function run(c: SearchCriteria, propertyIds: number[] | null, cityId: number | null, deps: AdapterDeps): Promise<Outcome<{ results: SearchResult[]; empty: boolean }>> {
  const body = requestBody(c, propertyIds, cityId)
  if (!body.ok) return body
  const res = await post(deps, String(deps.env[ENV.base]), headers(deps.env), body.value)
  if (!res.ok) return res
  const root = asRecord(res.value)
  const props = root && Array.isArray(root.properties) ? root.properties : null
  if (!props) return fail('malformed')
  const searchId = text(root?.searchId, 80) ?? 'unknown'
  const now = deps.now()
  const results = props.map(p => mapProperty(p, c, searchId, now)).filter((r): r is SearchResult => r !== null)
  if (props.length > 0 && results.length === 0) return fail('malformed')
  return ok({ results, empty: props.length === 0 })
}

export const agodaAdapter: RealtimeAdapter = {
  provider: 'agoda',
  verticals: ['hotel'],
  credentialEnv: [ENV.base, ENV.site, ENV.key],
  flagEnv: 'CCP_REALTIME_AGODA',

  async search(criteria, deps) {
    if (criteria.vertical !== 'hotel') return fail('unsupported', 'hotel only')
    const x = criteria.context
    const own = x.providerRefs?.agoda
    const ids = (own?.propertyRefs ?? []).filter(i => /^\d{1,12}$/.test(i)).map(Number).slice(0, 100)
    const city = own?.cityRef && /^\d{1,12}$/.test(own.cityRef) ? Number(own.cityRef) : null
    const r = await run(criteria, ids.length ? ids : null, ids.length ? null : city, deps)
    if (!r.ok) return r
    const list = r.value.results.slice(0, criteria.limit ?? 20)
    return list.length ? ok(list) : fail('empty')
  },

  async recheck(item, criteria, deps): Promise<Outcome<RecheckResult>> {
    const r = await run(criteria, [Number(item.providerItemId)], null, deps)
    if (!r.ok) return r
    const current = r.value.results.find(x => x.providerItemId === item.providerItemId) ?? null
    if (!current || current.availabilityStatus === 'sold_out' || current.price === null) return ok({ status: 'unavailable', previousPrice: item.price, currentPrice: null, result: null })
    const changed = item.price !== null && current.price !== item.price
    return ok({ status: changed ? 'price_changed' : 'ok', previousPrice: item.price, currentPrice: current.price, result: current })
  },
}
