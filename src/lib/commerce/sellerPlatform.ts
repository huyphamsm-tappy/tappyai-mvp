// Maps a free-text merchant / seller string (Serper `source`, e.g. "Shopee",
// "TikTok Shop", "CellphoneS") to a SMALL FIXED enum for analytics.
//
// 🔒 The raw seller string is NEVER emitted to analytics — only this low-cardinality
// bucket is. It backs the `platform` param of `shopping_search_click`, so a demand
// signal can be sliced by marketplace without leaking the merchant name, the product
// or the URL.

export type ShoppingPlatform = 'shopee' | 'lazada' | 'tiki' | 'tiktok' | 'other'

export function sellerPlatform(seller: string | null | undefined): ShoppingPlatform {
  const s = (seller ?? '').toLowerCase()
  if (s.includes('shopee')) return 'shopee'
  if (s.includes('lazada')) return 'lazada'
  if (s.includes('tiktok')) return 'tiktok' // before 'tiki' so "TikTok" is not mis-bucketed
  if (s.includes('tiki')) return 'tiki'
  return 'other'
}
