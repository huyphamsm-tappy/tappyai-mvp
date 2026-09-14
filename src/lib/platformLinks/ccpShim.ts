import { providerOwning, PROVIDER_REGISTRY, isCommerceLinkRow, type CommerceLinkRow } from '@/lib/ccp'
import { searchTemplates } from '@/lib/ccp/adapters'

// ── Legacy platform links ↔ CCP (Phase 6 compatibility shim) ────────────────
//
// src/lib/platformLinks/* are L0–L2 SEARCH builders (Shopee/Tiki/Lazada,
// ShopeeFood/GrabFood/BeFood, Booking.com/Agoda, Maps/website). They keep their
// names and their output — iOS reimplements them in Swift and
// crossClientParity.test.ts holds the two lists equal — and they are NOT how a
// merchant TappyAI transacts with is reached any more. That is the Commerce
// Capability Platform's job (src/lib/ccp): a verified Commerce Link on the row
// (`commerce_links`), rendered by the canonical action layer.
//
// This shim is the seam between the two, and the rule it enforces is the one
// that keeps them from becoming two independent commerce architectures:
//
//   🔑 A MERCHANT THE PLATFORM OWNS IS NEVER LINKED BY A LEGACY BUILDER.
//
// If a legacy list ever carried a URL whose host is in a CCP MVP provider's
// allow-list, the same merchant would be reachable by two authorities with two
// contracts (no depth, no freshness, no param echo on the legacy side).
// `withoutCommerceOwnedLinks` removes such an entry; the parity test asserts
// the builders never produce one in the first place.

export type PlatformLink = { name: string; url: string }

/** Hosts a CCP MVP adapter owns — registry data, read at call time so a registry change is a test change. */
export function commerceOwnedHosts(): string[] {
  return PROVIDER_REGISTRY.filter(e => e.tier === 'mvp').flatMap(e => [...e.allowedHosts])
}

/**
 * Every adapter-declared SEARCH / landing grammar, as URL prefixes (everything before the query
 * value; a front door is its own prefix). Marketplaces (14 Sep 2026) and the Completion Pass
 * travel / event grammars alike.
 */
export function registrySearchPrefixes(): string[] {
  return searchTemplates().map(t => { const i = t.template.indexOf('{q}'); return i < 0 ? t.template : t.template.slice(0, i) })
}
/** @deprecated use registrySearchPrefixes. */
export const marketplaceSearchPrefixes = registrySearchPrefixes

/**
 * A legacy link that IS a registry search grammar instance (Shopee "/search?keyword=…",
 * Booking.com "/searchresults.vi.html?ss=…", Agoda's front door) is the platform's own L0–L2
 * SEARCH_HANDOFF projected for the flag-off path — one authority, one grammar (owner decision
 * 14 Sep 2026). Anything else on a CCP host is a second authority and is removed.
 */
export function isRegistrySearchLink(url: string): boolean {
  return registrySearchPrefixes().some(p => url.startsWith(p))
}
/** @deprecated use isRegistrySearchLink. */
export const isMarketplaceSearchLink = isRegistrySearchLink

/** True when a CCP adapter-backed provider owns this URL's host and the URL is not its declared search grammar. */
export function isCommerceOwnedLink(url: string): boolean {
  const provider = providerOwning(url)
  if (!provider) return false
  if (isRegistrySearchLink(url)) return false
  return PROVIDER_REGISTRY.some(e => e.providerId === provider && e.tier === 'mvp')
}

/** Legacy links minus any the platform owns. Order preserved. */
export function withoutCommerceOwnedLinks<T extends PlatformLink>(links: readonly T[]): T[] {
  return links.filter(l => !isCommerceOwnedLink(l.url))
}

/**
 * CCP row attachment → the legacy `{name,url}` shape, for the code paths that
 * still consume PlatformLink (the text-injection channel natives read). Not
 * wired in Phase 6 — the web card reads Actions — but this is the migration
 * path, and it is the only place the projection may be written.
 */
export function commercePlatformLinks(rows: readonly unknown[] | undefined): PlatformLink[] {
  if (!Array.isArray(rows)) return []
  return rows.filter(isCommerceLinkRow).map((r: CommerceLinkRow) => ({ name: r.merchantName, url: r.url }))
}
