import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import { q } from '../validation/url'
import type { DirectLinkBuild, DiscoveryHint } from './types'
import { baseOffer, ownedUrl } from './shared'
import type { SearchCapableAdapter } from './marketplace'

// ── Trip.com hotels — Travel · verified L5 guest ─────────────────────────────
// Grammar (verified 13 Sep 2026, direct and through the ACCESSTRADE Deep Link
// wrapper):
//   https://vn.trip.com/hotels/detail/?cityId=<id>&hotelId=<id>&checkIn=YYYY-MM-DD
//     &checkOut=YYYY-MM-DD&adult=<n>&children=<n>&crn=<rooms>&curr=VND&locale=vi-VN
// Landing: hotel detail with the dates applied; "Đặt" on a room opens
// /hotels/booknew — a guest form (name, e-mail, phone) followed by payment.
// The Product Link tool must never wrap this URL (registry: unsafeWrappers).
//
// Flights (Completion Pass, 14 Sep 2026 — verified read-only in a browser):
//   https://vn.trip.com/flights/showfarefirst?dcity=<iata>&acity=<iata>&ddate=YYYY-MM-DD
//     [&rdate=YYYY-MM-DD]&flighttype=ow|rt&class=y|c|f&quantity=<adults>&locale=vi-VN&curr=VND
// Lands on the dated fare list for the route (Trip.com rewrites it to
// /m/flights/<o>-to-<d>/… keeping dcitycode/acitycode/ddate/adate/adult). That
// list is L2; the fare "select → passenger form" step was never executed, so
// no deeper URL exists here and none is composed.

const entry = getProvider('tripcom')!
const IATA = /^[A-Z]{3}$/
const FLIGHT_CLASS: Record<string, string> = { economy: 'y', premium_economy: 'y', business: 'c', first: 'f' }
const FLIGHT_SEARCH_REF = 'search:flight:'
const isoDay = (iso: string) => new Date(`${iso}T00:00:00+07:00`).toISOString()

/** The dated fare-search URL for a flight configuration, or null when the codes are not IATA. */
export function tripcomFlightSearchUrl(c: Extract<Configuration, { kind: 'transport' }>): { url: string; preserved: string[]; pageOnly: string[] } | null {
  const o = c.originRef.toUpperCase(), d = c.destinationRef.toUpperCase()
  if (!IATA.test(o) || !IATA.test(d)) return null
  const p = new URLSearchParams()
  p.set('dcity', o.toLowerCase())
  p.set('acity', d.toLowerCase())
  p.set('ddate', c.departDate)
  if (c.returnDate) p.set('rdate', c.returnDate)
  p.set('flighttype', c.returnDate ? 'rt' : 'ow')
  p.set('class', c.cabin ? FLIGHT_CLASS[c.cabin] : 'y')
  p.set('quantity', String(c.passengers ?? 1))
  p.set('locale', 'vi-VN')
  p.set('curr', 'VND')
  const preserved = ['originRef', 'destinationRef', 'departDate', ...(c.returnDate ? ['returnDate'] : []), ...(c.passengers ? ['passengers'] : []), ...(c.cabin && c.cabin !== 'premium_economy' ? ['cabin'] : [])]
  return { url: `https://vn.trip.com/flights/showfarefirst?${p.toString()}`, preserved, pageOnly: c.cabin === 'premium_economy' ? ['cabin'] : [] }
}

export const tripcomAdapter: SearchCapableAdapter = {
  providerId: 'tripcom',
  entry,
  supports(request: CommerceRequest) {
    return request.domain === 'travel' && (request.intentType === 'book_hotel' || request.intentType === 'book_flight')
  },
  searchOffer(request, now = new Date()) {
    // Flights only: a hotel request never falls back to a Trip.com list page (city ids are not composable).
    const c = request.configuration
    if (request.intentType !== 'book_flight' || c?.kind !== 'transport' || c.mode !== 'flight') return null
    const built = tripcomFlightSearchUrl(c)
    if (!built) return null
    return baseOffer(entry, request, `${FLIGHT_SEARCH_REF}${c.originRef}-${c.destinationRef}-${c.departDate}`, built.url, request.subject, now)
  },
  toOffer(request, hint: DiscoveryHint, now = new Date()) {
    if (request.intentType !== 'book_hotel') return null
    // Accept either an explicit hotelId or a detail URL that carries one.
    let hotelId = hint.subjectRef ?? null
    let cityId: string | null = null
    const u = ownedUrl(entry, hint)
    if (u && /\/hotels\/detail\/?$/.test(u.pathname)) {
      hotelId = hotelId ?? u.searchParams.get('hotelId')
      cityId = u.searchParams.get('cityId')
    } else if (u) {
      // Search engines index Trip.com's SEO path ("/hotels/<city>-hotel-detail-<id>/<slug>/"),
      // which is what a discovery query returns. Only the numeric id is taken from it — the
      // emitted link is always rebuilt on the VERIFIED "/hotels/detail/?hotelId=" grammar, so an
      // unexpected SEO shape can only fail to match, never produce a different destination.
      const m = u.pathname.match(/-hotel-detail-(\d{1,12})(?:\/|$)/)
      if (m) hotelId = hotelId ?? m[1]
    }
    if (!hotelId || !/^\d{1,12}$/.test(hotelId)) return null
    if (hint.verified?.bookable === false) return null
    const canonical = `https://vn.trip.com/hotels/detail/?hotelId=${q(hotelId)}${cityId && /^\d{1,12}$/.test(cityId) ? `&cityId=${q(cityId)}` : ''}&locale=vi-VN`
    return baseOffer(entry, request, hotelId, canonical, hint.title ?? request.subject, now)
  },
  buildDirectLink(offer: Offer, configuration: Configuration | undefined): DirectLinkBuild | null {
    if (offer.subjectRef.startsWith(FLIGHT_SEARCH_REF)) {
      if (configuration?.kind !== 'transport') return null
      const built = tripcomFlightSearchUrl(configuration)
      if (!built) return null
      return {
        url: built.url,
        depth: 2,
        paramsPreserved: built.preserved,
        paramsPageOnly: built.pageOnly,
        paramsDropped: [],
        expiresAt: isoDay(configuration.departDate),
        // One-way and round-trip with adults verified 14 Sep 2026; the class codes are Trip.com's documented values.
        grammar: configuration.cabin && configuration.cabin !== 'economy' ? 'observed' : 'verified',
        limitations: ['Trang kết quả chuyến bay theo ngày trên Trip.com; chọn chuyến rồi nhập thông tin hành khách trên trang.'],
      }
    }
    const canonical = new URL(offer.canonicalUrl)
    const hotelId = canonical.searchParams.get('hotelId')!
    const cityId = canonical.searchParams.get('cityId')
    if (!configuration || configuration.kind !== 'hotel') {
      // No dates → detail page without a stay; the user picks dates on page.
      return {
        url: offer.canonicalUrl,
        depth: 3,
        paramsPreserved: ['propertyRef'],
        paramsPageOnly: ['checkIn', 'checkOut', 'adults', 'children', 'rooms'],
        paramsDropped: [],
        expiresAt: null,
        grammar: 'verified',
        limitations: ['Chọn ngày nhận/trả phòng và số khách trên trang khách sạn.'],
      }
    }
    const params = new URLSearchParams()
    const city = configuration.cityRef ?? cityId
    if (city && /^\d{1,12}$/.test(city)) params.set('cityId', city)
    params.set('hotelId', hotelId)
    params.set('checkIn', configuration.checkIn)
    params.set('checkOut', configuration.checkOut)
    params.set('adult', String(configuration.adults))
    params.set('children', String(configuration.children ?? 0))
    params.set('crn', String(configuration.rooms ?? 1))
    params.set('curr', 'VND')
    params.set('locale', 'vi-VN')
    const preserved = ['propertyRef', 'checkIn', 'checkOut', 'adults', 'children', 'rooms']
    if (city) preserved.unshift('cityRef')
    return {
      url: `https://vn.trip.com/hotels/detail/?${params.toString()}`,
      depth: 4, // detail page WITH the stay applied; room "Đặt" → guest form (L5) is verified
      paramsPreserved: preserved,
      paramsPageOnly: [],
      paramsDropped: [],
      // A dated stay link is meaningful until check-in day.
      expiresAt: new Date(`${configuration.checkIn}T00:00:00+07:00`).toISOString(),
      grammar: 'verified',
      limitations: ['Chọn phòng trên trang; form đặt phòng chỉ cần tên, email và số điện thoại.'],
    }
  },
}
