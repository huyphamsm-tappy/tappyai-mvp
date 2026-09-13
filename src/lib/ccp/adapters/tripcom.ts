import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import { q } from '../validation/url'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { baseOffer, ownedUrl } from './shared'

// ── Trip.com hotels — Travel · verified L5 guest ─────────────────────────────
// Grammar (verified 13 Sep 2026, direct and through the ACCESSTRADE Deep Link
// wrapper):
//   https://vn.trip.com/hotels/detail/?cityId=<id>&hotelId=<id>&checkIn=YYYY-MM-DD
//     &checkOut=YYYY-MM-DD&adult=<n>&children=<n>&crn=<rooms>&curr=VND&locale=vi-VN
// Landing: hotel detail with the dates applied; "Đặt" on a room opens
// /hotels/booknew — a guest form (name, e-mail, phone) followed by payment.
// The Product Link tool must never wrap this URL (registry: unsafeWrappers).

const entry = getProvider('tripcom')!

export const tripcomAdapter: ProviderAdapter = {
  providerId: 'tripcom',
  entry,
  supports(request: CommerceRequest) {
    return request.domain === 'travel' && request.intentType === 'book_hotel'
  },
  toOffer(request, hint: DiscoveryHint, now = new Date()) {
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
    const canonical = `https://vn.trip.com/hotels/detail/?hotelId=${q(hotelId)}${cityId && /^\d{1,12}$/.test(cityId) ? `&cityId=${q(cityId)}` : ''}&locale=vi-VN`
    return baseOffer(entry, request, hotelId, canonical, hint.title ?? request.subject, now)
  },
  buildDirectLink(offer: Offer, configuration: Configuration | undefined): DirectLinkBuild | null {
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
