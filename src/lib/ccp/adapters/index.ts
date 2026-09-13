import { CCP_ADAPTERS } from '@/lib/config/product'
import type { ProviderAdapter } from './types'
import { dmxAdapter } from './dmx'
import { tripcomAdapter } from './tripcom'
import { pasgoAdapter } from './pasgo'
import { cgvAdapter } from './cgv'
import { klookAdapter } from './klook'
import { PASSTHROUGH_ADAPTERS } from './handoff'
import { INTENT_CAPABILITY, type CommerceRequest } from '../domain/types'

export type { ProviderAdapter, DirectLinkBuild, DiscoveryHint } from './types'

// Exactly the five MVP adapters (owner decision D10). Adding one is a reviewed
// change here AND a registry entry with a dated depth profile; the adapter
// test asserts both lists agree.
export const MVP_ADAPTERS: readonly ProviderAdapter[] = [dmxAdapter, tripcomAdapter, pasgoAdapter, cgvAdapter, klookAdapter]

/** Adapters whose product flag is on and that can serve the request. */
export type AdapterFlags = Record<keyof typeof CCP_ADAPTERS, boolean>

export function adaptersFor(request: CommerceRequest, flags: AdapterFlags = CCP_ADAPTERS): ProviderAdapter[] {
  // Capability-aware (owner correction): an adapter is a candidate only when its registry entry
  // declares the capability the request asks for. `supports` (domain + intent) is kept as the
  // adapter's own, narrower check; the registry declaration is the one ranking is allowed to compare.
  const capability = request.capability ?? INTENT_CAPABILITY[request.intentType]
  // Phase 8: handoff-only providers flagged `handoffPassthrough` join as passthrough adapters (no
  // grammar; a discovered page on their host, at their verified depth). Still exactly five MVP adapters.
  return [...MVP_ADAPTERS, ...PASSTHROUGH_ADAPTERS].filter(a => flags[a.entry.enabledFlag] === true && a.entry.commerce.includes(capability) && a.supports(request))
}

export function adapterById(providerId: string): ProviderAdapter | null {
  return MVP_ADAPTERS.find(a => a.providerId === providerId) ?? null
}
