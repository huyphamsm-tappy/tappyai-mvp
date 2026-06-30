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
