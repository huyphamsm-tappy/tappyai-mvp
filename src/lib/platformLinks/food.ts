// Deterministic link generators for food delivery platforms.
// No API calls. No DB access. No UI logic.

export type PlatformLink = { name: string; url: string }

/**
 * Build per-restaurant search URLs for food delivery platforms.
 * Combines name + city for more accurate results than name alone.
 * Falls back to address when city is not available.
 */
export function buildFoodOrderLinks(
  placeName: string,
  address?: string,
  city?: string
): PlatformLink[] {
  const parts = [placeName]
  if (city) parts.push(city)
  else if (address) parts.push(address)
  const q = encodeURIComponent(parts.join(' '))
  return [
    { name: 'ShopeeFood', url: `https://shopeefood.vn/tim-kiem?q=${q}` },
    { name: 'GrabFood',   url: `https://food.grab.com/vn/en/s?searchKeyword=${q}` },
    { name: 'BeFood',     url: 'https://be.com.vn/' },
  ]
}
