// Deterministic link generators for food delivery platforms.
// No API calls. No DB access. No UI logic.
//
// Final local live UAT (14 Sep 2026): the delivery platforms are Commerce Capability Platform
// providers, and this builder PROJECTS their registry-declared search grammars (the same rule as
// shopping and travel). Verified read-only that day: GrabFood's legacy /vn/en/s?searchKeyword=
// returns 404 (the grammar is /vn/vi/restaurants?search=); ShopeeFood's /tim-kiem?q= drops the
// query and lands on the city listing, so ShopeeFood has NO search link here — its restaurant
// pages reach the user as Commerce Links. BeFood is not a CCP provider and keeps its front door.
import { searchTemplates } from '@/lib/ccp/adapters'

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
  const grab = searchTemplates().find(t => t.providerId === 'grabfood')?.template
  return [
    ...(grab ? [{ name: 'GrabFood', url: grab.replace('{q}', q) }] : []),
    { name: 'BeFood',     url: 'https://be.com.vn/' },
  ]
}
