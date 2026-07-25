// Deterministic link generators for travel & accommodation platforms.
// No API calls. No DB access. No UI logic.

export type PlatformLink = { name: string; url: string }

export function buildTravelLinks(
  hotelName: string,
  city?: string
): PlatformLink[] {
  const parts = [hotelName]
  if (city) parts.push(city)
  const q = encodeURIComponent(parts.join(' '))
  return [
    { name: 'Booking.com', url: `https://www.booking.com/search.html?ss=${q}` },
    { name: 'Agoda',       url: `https://www.agoda.com/vi-vn/search?q=${q}` },
    { name: 'Grab',        url: 'https://www.grab.com/vn/transport/car/' },
    { name: 'Xanh SM',    url: 'https://xanhsm.com/' },
  ]
}

// Flight-search links on platforms Vietnamese users recognize. Replaces Aviasales
// (2026-07-25): foreign brand, and its `/search/{ORIG}{DEST}` form has no date so
// it lands on an error page. Both destinations below were verified in a real
// browser to open the correct route:
//  - Traveloka (strong VN brand): one-way search; needs the date as DD-MM-YYYY.
//  - Google Flights (reliable fallback): parses the route from a plain query.
// `departISO` is YYYY-MM-DD (e.g. the cheapest fare's departure day, or a default);
// when absent, Traveloka falls back to its flight landing so the link never errors.
export function buildFlightLinks(
  originCode: string,
  destCode: string,
  departISO?: string,
): PlatformLink[] {
  const o = originCode.toUpperCase()
  const d = destCode.toUpperCase()
  const gfQuery = `Flights from ${o} to ${d}` + (departISO ? ` on ${departISO}` : '')
  const google = `https://www.google.com/travel/flights?q=${encodeURIComponent(gfQuery)}`
  const dt = departISO ? departISO.split('-').reverse().join('-') : '' // YYYY-MM-DD → DD-MM-YYYY
  const traveloka = dt
    ? `https://www.traveloka.com/vi-VN/flight/fullsearch?ap=${o}.${d}&dt=${dt}.null&ps=1.0.0&sc=ECONOMY`
    : 'https://www.traveloka.com/vi-VN/flight'
  return [
    { name: 'Traveloka', url: traveloka },
    { name: 'Google Flights', url: google },
  ]
}
