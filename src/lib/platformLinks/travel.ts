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
  return [
    ...(tripcom ? [{ name: 'Trip.com', url: tripcom }] : []),
    { name: 'Traveloka', url: traveloka },
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
  return template('vexere') ?? 'https://vexere.com/vi-VN'
}
