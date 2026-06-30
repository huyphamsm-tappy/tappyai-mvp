// Deterministic link generators for e-commerce platforms.
// No API calls. No DB access. No UI logic.

export type PlatformLink = { name: string; url: string }

export function buildShoppingLinks(productName: string): PlatformLink[] {
  const q = encodeURIComponent(productName)
  return [
    { name: 'Shopee',      url: `https://shopee.vn/search?keyword=${q}` },
    { name: 'Tiki',        url: `https://tiki.vn/search?q=${q}` },
    { name: 'Lazada',      url: `https://www.lazada.vn/catalog/?q=${q}` },
    { name: 'TikTok Shop', url: `https://www.tiktok.com/search?q=${q}` },
  ]
}
