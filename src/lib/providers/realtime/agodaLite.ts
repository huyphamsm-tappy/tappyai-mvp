import { amount, asArray, asRecord, currencyOf, fail, missingInUrl, ok, ownedUrl, post, text } from './common'
import type { AdapterDeps, Outcome, RealtimeAdapter, RecheckResult, SearchCriteria, SearchResult } from './types'

// ── Agoda Affiliate Lite API adapter (30/10/2026) ────────────────────────────────────────────────────────────────────────────────
// Source: "Affiliate_Lite_API_V2.0.pdf" (Agoda Partners → Tools → API, downloaded 30/10, D:/TappyAI-review-artifacts/agoda/). Owner 29/10: the
// real nightly rate per hotel, and the hotel id that makes the tracked link Agoda documents (partnersearch.aspx?cid=&hid=) — which the Lite API
// returns itself as `landingURL`.
//
//   POST <base>  headers: Authorization "<site id>:<api key>", Accept-Encoding gzip,deflate   (the PDF; fetch decodes gzip itself)
//   body: { criteria: { additional: { currency, language, maxResult, sortBy, occupancy{numberOfAdult, numberOfChildren, childrenAges} },
//                       checkInDate, checkOutDate, cityId | hotelId[] } }
//   200:  { results: [ { hotelId, hotelName, dailyRate, crossedOutRate, discountPercentage, currency, starRating, reviewScore, reviewCount,
//                        imageURL, landingURL, includeBreakfast, freeWifi } ] }   ·   no result: { error: { id: 911, message } }
//
// The PDF gives an http:// endpoint and says https is "via your account manager". Measured 30/10: the same host answers over https with a
// valid certificate (401 "Site ID or API key is invalid or missing" without a key), so ONLY https is used — the key never travels in clear.
// `dailyRate` is per night and "sell exclusive" (before taxes and fees): the subtitle says so, and the price is the nightly rate, not a total.
//
// Server env NAMES (values never in code, logs or results): AGODA_LITE_SITE_ID · AGODA_LITE_API_KEY. Flag: CCP_REALTIME_AGODA_LITE (only '1').

export const AGODA_LITE_URL = 'https://affiliateapi7643.agoda.com/affiliateservice/lt_v1'
const ENV = { site: 'AGODA_LITE_SITE_ID', key: 'AGODA_LITE_API_KEY' } as const
const SOURCE = 'agoda-lite/lt_v1'
/** The PDF's "no search result" error id: an empty answer, not a failure. */
const NO_RESULT = 911
/** City search returns at most 30 (the PDF's maxResult range). */
const MAX_RESULT = 30

/**
 * The key as the API wants it. The portal's copy button gives the PAIR "<site id>:<api key>" (measured 30/10: pasted whole, the header became
 * "<site>:<site>:<key>" and Agoda answered 401 error 108); a value that starts with this site id and a colon is read as that pair.
 */
const apiKey = (env: AdapterDeps['env']): string => {
  const site = (env[ENV.site] ?? '').trim()
  const key = (env[ENV.key] ?? '').trim()
  return site && key.startsWith(`${site}:`) ? key.slice(site.length + 1) : key
}
const headers = (env: AdapterDeps['env']): Record<string, string> => ({ authorization: `${(env[ENV.site] ?? '').trim()}:${apiKey(env)}`, 'accept-encoding': 'gzip,deflate' })

function requestBody(c: SearchCriteria, hotelIds: number[] | null, cityId: number | null): Outcome<Record<string, unknown>> {
  const x = c.context
  if (!x.checkIn || !x.checkOut || !x.adults) return fail('unsupported', 'needs checkIn, checkOut, adults')
  const children = x.children ?? 0
  if (children > 0 && (x.childrenAges?.length ?? 0) !== children) return fail('needs_children_ages')
  if (!hotelIds?.length && cityId === null) return fail('needs_location_id')
  const occupancy = { numberOfAdult: x.adults, numberOfChildren: children, ...(children > 0 ? { childrenAges: x.childrenAges } : {}) }
  const city = hotelIds?.length ? {} : { maxResult: Math.min(Math.max(c.limit ?? 10, 1), MAX_RESULT), sortBy: 'Recommended' }
  return ok({
    criteria: {
      additional: { currency: c.currency ?? 'VND', language: 'vi-vn', discountOnly: false, occupancy, ...city },
      checkInDate: x.checkIn,
      checkOutDate: x.checkOut,
      ...(hotelIds?.length ? { hotelId: hotelIds } : { cityId }),
    },
  })
}

/** "4★ · 8,6/10 (1.234 đánh giá) · giá/đêm chưa gồm thuế, phí" — only the parts the row states. Pure. */
function subtitleOf(r: Record<string, unknown>): string {
  const star = amount(r.starRating)
  const score = amount(r.reviewScore)
  const count = amount(r.reviewCount)
  const parts = [
    star !== null && star > 0 && star <= 5 ? `${star}★` : null,
    score !== null && score > 0 && score <= 10 ? `${score.toLocaleString('vi-VN')}/10${count !== null && count > 0 ? ` (${Math.round(count).toLocaleString('vi-VN')} đánh giá)` : ''}` : null,
    'giá/đêm chưa gồm thuế, phí',
  ]
  return parts.filter(Boolean).join(' · ')
}

export function mapLiteHotel(raw: unknown, c: SearchCriteria, now: Date): SearchResult | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = r.hotelId === undefined || r.hotelId === null ? null : String(r.hotelId)
  if (!id || !/^\d{1,12}$/.test(id)) return null
  const rate = amount(r.dailyRate)
  const currency = currencyOf(r.currency)
  // Only an https URL on Agoda's own hosts survives; a poisoned landing URL is dropped (and the user gets the deeplink fallback).
  const bookingUrl = ownedUrl('agoda', r.landingURL ?? r.landingUrl)
  return {
    provider: 'agoda',
    vertical: 'hotel',
    providerItemId: id,
    title: text(r.hotelName) ?? `Chỗ nghỉ #${id}`,
    subtitle: subtitleOf(r),
    price: rate !== null && rate > 0 && currency ? rate : null,
    currency: rate !== null && rate > 0 && currency ? currency : null,
    availability: null, // the Lite API states no room count
    // A row is an offer for these dates; a row without a rate is not evidence of a room.
    availabilityStatus: rate !== null && rate > 0 ? 'available' : 'unknown',
    lastCheckedAt: now.toISOString(),
    source: 'REALTIME_TAPPY',
    realtimeSource: SOURCE,
    bookingUrl,
    deepLinkUrl: null,
    context: c.context,
    contextMissingInUrl: missingInUrl(bookingUrl, c.context),
    rawReference: `agoda-lite:${id}`,
  }
}

async function run(c: SearchCriteria, hotelIds: number[] | null, cityId: number | null, deps: AdapterDeps): Promise<Outcome<SearchResult[]>> {
  const body = requestBody(c, hotelIds, cityId)
  if (!body.ok) return body
  const res = await post(deps, AGODA_LITE_URL, headers(deps.env), body.value)
  if (!res.ok) return res
  const root = asRecord(res.value)
  const err = asRecord(root?.error)
  if (err) return err.id === NO_RESULT ? ok([]) : fail('provider_error', `agoda_${typeof err.id === 'number' ? err.id : 'error'}`)
  if (!root || !Array.isArray(root.results)) return fail('malformed')
  const now = deps.now()
  const rows = asArray(root.results)
  const results = rows.map(x => mapLiteHotel(x, c, now)).filter((x): x is SearchResult => x !== null)
  if (rows.length > 0 && results.length === 0) return fail('malformed')
  return ok(results)
}

export const agodaLiteAdapter: RealtimeAdapter = {
  provider: 'agoda',
  verticals: ['hotel'],
  credentialEnv: [ENV.site, ENV.key],
  flagEnv: 'CCP_REALTIME_AGODA_LITE',

  async search(criteria, deps) {
    if (criteria.vertical !== 'hotel') return fail('unsupported', 'hotel only')
    const own = criteria.context.providerRefs?.agoda
    const ids = (own?.propertyRefs ?? []).filter(i => /^\d{1,12}$/.test(i)).map(Number).slice(0, 30)
    const city = own?.cityRef && /^\d{1,12}$/.test(own.cityRef) ? Number(own.cityRef) : null
    const r = await run(criteria, ids.length ? ids : null, ids.length ? null : city, deps)
    if (!r.ok) return r
    const list = r.value.slice(0, criteria.limit ?? 20)
    return list.length ? ok(list) : fail('empty')
  },

  async recheck(item, criteria, deps): Promise<Outcome<RecheckResult>> {
    const r = await run(criteria, [Number(item.providerItemId)], null, deps)
    if (!r.ok) return r
    const current = r.value.find(x => x.providerItemId === item.providerItemId) ?? null
    if (!current || current.price === null) return ok({ status: 'unavailable', previousPrice: item.price, currentPrice: null, result: null })
    const changed = item.price !== null && current.price !== item.price
    return ok({ status: changed ? 'price_changed' : 'ok', previousPrice: item.price, currentPrice: current.price, result: current })
  },
}
