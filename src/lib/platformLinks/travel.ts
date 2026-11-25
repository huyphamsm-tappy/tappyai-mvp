// Deterministic link generators for travel & accommodation platforms.
// No API calls. No DB access. No UI logic.
//
// Provider Integration Completion Pass (14 Sep 2026): the OTAs, the airlines
// and the coach platform are Commerce Capability Platform providers. This
// legacy builder no longer decides which merchants exist or spells their
// grammars — it PROJECTS the search / landing grammars the CCP adapters
// declare, so the list and the hosts are registry data (the same rule the
// shopping builder follows). Verified read-only on 14 Sep 2026:
//   · Booking.com results page keeps the destination (searchresults.vi.html?ss=);
//   · Agoda's /vi-vn/search?q= DROPS the query and lands on the homepage, so the
//     honest Agoda link is its front door;
//   · Vexere's /ket-qua-tim-kiem-ve-xe-khach?fromLocationName= returns 404, so
//     the honest coach link is its front door (the dated route page is a CCP link).
import { searchTemplates } from '@/lib/ccp/adapters'
import { tripcomFlightSearchUrl } from '@/lib/ccp/adapters/tripcom'
import { GRAMMARS } from '@/lib/ccp/adapters/grammar'
import { withVexereDirectParams } from '@/lib/ccp/tracking/vexereDirect'
import { vexereDirectAffiliateOn, VEXERE_FLIGHT_LANDING } from '@/lib/config/vexereDirect'

export type PlatformLink = { name: string; url: string }

function template(providerId: string): string | null {
  return searchTemplates().find(t => t.providerId === providerId)?.template ?? null
}

export function buildTravelLinks(
  hotelName: string,
  city?: string
): PlatformLink[] {
  const parts = [hotelName]
  if (city) parts.push(city)
  const q = encodeURIComponent(parts.join(' '))
  const booking = template('booking')
  const agoda = template('agoda')
  return [
    ...(booking ? [{ name: 'Booking.com', url: booking.replace('{q}', q) }] : []),
    ...(agoda ? [{ name: 'Agoda', url: agoda }] : []),
    { name: 'Grab',        url: 'https://www.grab.com/vn/transport/car/' },
    { name: 'Xanh SM',    url: 'https://xanhsm.com/' },
  ]
}

// Flight-search links on platforms Vietnamese users recognize. `departISO` is
// YYYY-MM-DD (the cheapest fare's departure day, the user's date, or a default);
// when absent, the dated grammars are skipped and Traveloka's flight landing is
// used so the link never errors. Google Flights stays as the non-merchant
// fallback (it parses the route from a plain query).
export function buildFlightLinks(
  originCode: string,
  destCode: string,
  departISO?: string,
): PlatformLink[] {
  const o = originCode.toUpperCase()
  const d = destCode.toUpperCase()
  const gfQuery = `Flights from ${o} to ${d}` + (departISO ? ` on ${departISO}` : '')
  const google = `https://www.google.com/travel/flights?q=${encodeURIComponent(gfQuery)}`
  const configuration = departISO ? { kind: 'transport' as const, originRef: o, destinationRef: d, departDate: departISO, mode: 'flight' as const } : null
  const tripcom = configuration ? tripcomFlightSearchUrl(configuration)?.url ?? null : null
  const traveloka = configuration
    ? GRAMMARS.traveloka.search?.({ domain: 'travel', intentType: 'book_flight', subject: `${o} ${d}`, configuration })?.url ?? 'https://www.traveloka.com/vi-VN/flight'
    : 'https://www.traveloka.com/vi-VN/flight'
  // Vexere sells flights too (owner, 12/11/2026). Its flight route pages need Vexere's own area ids and no query grammar for the date was
  // verified (public pages opened 12/11/2026), so only the flight landing page is offered, labelled as such. Only while the direct programme is ON.
  const vexereFlights = vexereDirectAffiliateOn() ? vexereOutbound(VEXERE_FLIGHT_LANDING) : null
  return [
    ...(tripcom ? [{ name: 'Trip.com', url: tripcom }] : []),
    { name: 'Traveloka', url: traveloka },
    ...(vexereFlights ? [{ name: 'Vexere (trang vé máy bay)', url: vexereFlights }] : []),
    { name: 'Google Flights', url: google },
  ]
}

/**
 * The hotel tool's destination-level links: Booking.com results for the place (+ stay when the
 * user gave dates) and Agoda's front door (its search URL drops the query — verified 14 Sep 2026).
 */
export function buildHotelSearchLinks(location: string, checkIn?: string, checkOut?: string): { bookingUrl: string; agodaUrl: string } {
  const booking = template('booking') ?? 'https://www.booking.com/searchresults.vi.html?ss={q}'
  const stay = checkIn && checkOut ? `&checkin=${encodeURIComponent(checkIn)}&checkout=${encodeURIComponent(checkOut)}` : ''
  return {
    bookingUrl: booking.replace('{q}', encodeURIComponent(location)) + stay,
    agodaUrl: template('agoda') ?? 'https://www.agoda.com/vi-vn/',
  }
}

/** Vexere's front door — the only composable coach link (the route search grammar is 404). */
export function buildCoachLandingLink(): string {
  return vexereOutbound(template('vexere') ?? 'https://vexere.com/vi-VN')
}

/** Vexere's flight landing page with the direct programme's parameters, or null while the programme is OFF (an unaffiliated Vexere flights button is not offered). */
export function buildVexereFlightLink(): string | null {
  return vexereDirectAffiliateOn() ? vexereOutbound(VEXERE_FLIGHT_LANDING) : null
}

/** Vexere's train landing page (public, opened 17/11/2026: HTTP 200; the bare /vn/ve-tau-hoa is 404). The dated train list needs Vexere's own area ids, so only this page is linked here. */
export const VEXERE_TRAIN_LANDING = 'https://vexere.com/vn/ve-tau-hoa.vi'

export function buildVexereTrainLandingLink(): string {
  return vexereOutbound(VEXERE_TRAIN_LANDING)
}

/**
 * Other platforms' PUBLIC landing pages, offered beside the affiliate platform for fairness (owner decision 17/11/2026). Every host answered HTTP 200 on
 * 17/11/2026. No search grammar is claimed for any of them: the user types the route / destination on the site, and the label says so (`landing`).
 * Plain links: none of these platforms is in the affiliate programme.
 */
export const PLAIN_PLATFORM_LANDINGS = {
  tripcomHotels: { merchant: 'tripcom', name: 'Trip.com', url: 'https://vn.trip.com/hotels/' },
  futabus: { merchant: 'futabus', name: 'FUTA Bus Lines', url: 'https://futabus.vn/' },
  baolau: { merchant: 'baolau', name: 'Baolau', url: 'https://www.baolau.com/vi/' },
  dsvn: { merchant: 'dsvn', name: 'Đường sắt Việt Nam', url: 'https://dsvn.vn/' },
} as const

/** The outward Vexere URL: with VEXERE_DIRECT_AFFILIATE ON the direct programme's parameters, otherwise the URL untouched. Never the Accesstrade wrapper (no aid collision). */
function vexereOutbound(url: string): string {
  if (!vexereDirectAffiliateOn()) return url
  const r = withVexereDirectParams(url)
  return r.ok ? r.url : url
}
