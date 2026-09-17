// Deterministic link generators for e-commerce platforms.
// No API calls. No DB access. No UI logic.
//
// Owner decision 14 Sep 2026: the marketplaces are Commerce Capability Platform
// providers (Shopee, TikTok Shop, Lazada). This legacy builder no longer decides
// which marketplaces exist — it projects the SEARCH grammars the CCP adapters
// declare (`marketplaceSearchTemplates`), so the list and the hosts are registry
// data. TikTok Shop has no composable web search page and is therefore absent
// here by fact, not by policy; its product pages reach the user as Commerce
// Links. Tiki is not a CCP provider and is not reintroduced.
import { marketplaceSearchTemplates } from '@/lib/ccp/adapters'

export type PlatformLink = { name: string; url: string }

export function buildShoppingLinks(productName: string): PlatformLink[] {
  const q = encodeURIComponent(productName)
  return marketplaceSearchTemplates().map(t => ({ name: t.name, url: t.template.replace('{q}', q) }))
}
