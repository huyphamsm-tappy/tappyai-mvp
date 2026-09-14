import { CCP_ADAPTERS } from '@/lib/config/product'
import type { ProviderAdapter } from './types'
import { dmxAdapter } from './dmx'
import { tripcomAdapter } from './tripcom'
import { cgvAdapter } from './cgv'
import { klookAdapter } from './klook'
import { PASSTHROUGH_ADAPTERS } from './handoff'
import { MARKETPLACE_ADAPTERS, marketplaceSearchTemplates } from './marketplace'
import { GRAMMAR_ADAPTERS, grammarSearchTemplates } from './grammar'
import { INTENT_CAPABILITY, type CommerceRequest } from '../domain/types'

export type { ProviderAdapter, DirectLinkBuild, DiscoveryHint } from './types'
export { MARKETPLACE_ADAPTERS, isMarketplaceAdapter, isSearchCapableAdapter, marketplaceSearchTemplates, type MarketplaceAdapter, type SearchCapableAdapter } from './marketplace'
export { GRAMMAR_ADAPTERS, grammarSearchTemplates } from './grammar'

// The four bespoke MVP adapters (owner decision D10; PasGo removed 14 Sep 2026), the three
// shopping marketplaces (14 Sep 2026: Shopee and TikTok Shop mandatory, Lazada desired) and the
// Completion Pass grammar adapters (14 Sep 2026: Booking.com, Agoda, Traveloka, Vexere, Vietnam
// Airlines, Vietjet, Ticketbox). Adding one is a reviewed change here AND a registry entry with a
// dated depth profile; the adapter test asserts both lists agree. The provider list is FROZEN.
export const MVP_ADAPTERS: readonly ProviderAdapter[] = [dmxAdapter, tripcomAdapter, cgvAdapter, klookAdapter]
/** Every adapter-backed provider (registry entries with tier 'mvp'). */
export const ADAPTERS: readonly ProviderAdapter[] = [...MVP_ADAPTERS, ...MARKETPLACE_ADAPTERS, ...GRAMMAR_ADAPTERS]

/**
 * Every composable SEARCH grammar an adapter publishes, for the legacy builders and the prompt's
 * CTA templates (`{q}` placeholder). Registry-projected: a merchant without a composable search
 * page (TikTok Shop, Agoda, Vexere) is absent by fact.
 */
export function searchTemplates(): Array<{ providerId: string; name: string; template: string }> {
  return [...marketplaceSearchTemplates(), ...grammarSearchTemplates()]
}

/** Adapters whose product flag is on and that can serve the request. */
export type AdapterFlags = Record<keyof typeof CCP_ADAPTERS, boolean>

export function adaptersFor(request: CommerceRequest, flags: AdapterFlags = CCP_ADAPTERS): ProviderAdapter[] {
  // Capability-aware (owner correction): an adapter is a candidate only when its registry entry
  // declares the capability the request asks for. `supports` (domain + intent) is kept as the
  // adapter's own, narrower check; the registry declaration is the one ranking is allowed to compare.
  const capability = request.capability ?? INTENT_CAPABILITY[request.intentType]
  // Phase 8: handoff-only providers flagged `handoffPassthrough` join as passthrough adapters (no
  // grammar; a discovered page on their host, at their verified depth). Still exactly five MVP adapters.
  return [...ADAPTERS, ...PASSTHROUGH_ADAPTERS].filter(a => flags[a.entry.enabledFlag] === true && a.entry.commerce.includes(capability) && a.supports(request))
}

export function adapterById(providerId: string): ProviderAdapter | null {
  return ADAPTERS.find(a => a.providerId === providerId) ?? null
}
