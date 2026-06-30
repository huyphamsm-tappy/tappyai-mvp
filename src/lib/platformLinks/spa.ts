// Deterministic link generators for spa & wellness platforms.
// No API calls. No DB access. No UI logic.

export type PlatformLink = { name: string; url: string }

export function buildSpaLinks(
  spaName: string,
  websiteUri?: string,
  mapsLink?: string
): PlatformLink[] {
  const links: PlatformLink[] = []
  if (websiteUri) links.push({ name: 'Official Website', url: websiteUri })
  links.push({ name: 'Google Maps', url: mapsLink || `https://www.google.com/maps/search/${encodeURIComponent(spaName)}` })
  return links
}
