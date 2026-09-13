import { PROVIDER_REGISTRY } from './providers'
import type { ProviderRegistryEntry } from './types'
import type { CommerceDomain, IntentType, TransactionDepthProfile } from '../domain/types'

export type { ProviderRegistryEntry, ProviderCapability, TrackingConfig } from './types'
export { PROVIDER_REGISTRY } from './providers'

const BY_ID: ReadonlyMap<string, ProviderRegistryEntry> = new Map(PROVIDER_REGISTRY.map(p => [p.providerId, p]))

export function getProvider(providerId: string): ProviderRegistryEntry | null {
  return BY_ID.get(providerId) ?? null
}

export function providersFor(domain: CommerceDomain, intent: IntentType): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter(p => p.domains.includes(domain) && p.intents.includes(intent))
}

export function depthProfileFor(entry: ProviderRegistryEntry, intent: IntentType): TransactionDepthProfile | null {
  return entry.depth[intent] ?? null
}

/** Exact-match host allow-list. No wildcard: a resolved URL may only point at a host the audit saw. */
export function isAllowedHost(entry: ProviderRegistryEntry, host: string): boolean {
  const h = host.toLowerCase()
  return entry.allowedHosts.some(a => h === a.toLowerCase())
}

/**
 * Structural validation of the registry, run by a unit test so a malformed
 * entry fails CI rather than a request. Returns human-readable problems.
 */
export function validateRegistry(entries: readonly ProviderRegistryEntry[] = PROVIDER_REGISTRY): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const e of entries) {
    if (ids.has(e.providerId)) problems.push(`${e.providerId}: duplicate providerId`)
    ids.add(e.providerId)
    if (e.allowedHosts.length === 0) problems.push(`${e.providerId}: allowedHosts empty`)
    for (const h of e.allowedHosts) if (!/^[a-z0-9.-]+$/.test(h)) problems.push(`${e.providerId}: bad host ${h}`)
    for (const intent of e.intents) {
      const d = e.depth[intent]
      if (!d) { problems.push(`${e.providerId}: no depth profile for ${intent}`); continue }
      if (d.guestDepth > d.bestPossibleDepth) problems.push(`${e.providerId}/${intent}: guestDepth > bestPossibleDepth`)
      if (d.authenticatedDepth !== null && d.authenticatedDepth < d.guestDepth) problems.push(`${e.providerId}/${intent}: authenticatedDepth < guestDepth`)
      if (d.guestDepth === 5 && !['none', 'at_order'].includes(d.authRequiredAt)) problems.push(`${e.providerId}/${intent}: L5 guest depth contradicts authRequiredAt=${d.authRequiredAt}`)
      if (Number.isNaN(Date.parse(d.verifiedOn))) problems.push(`${e.providerId}/${intent}: verifiedOn not a date`)
      if (!/^https:\/\//.test(d.evidence)) problems.push(`${e.providerId}/${intent}: evidence must be an https URL`)
    }
    if (e.tier === 'mvp' && !e.capabilities.includes('resolveDeepLink')) problems.push(`${e.providerId}: mvp tier must resolve deep links`)
    if (e.tracking) {
      if (!/^\d{10,25}$/.test(e.tracking.campaignId)) problems.push(`${e.providerId}: campaignId not numeric`)
      if (e.tracking.safeWrapper !== 'deep_link') problems.push(`${e.providerId}: only the deep_link wrapper is verified safe`)
      if (!e.capabilities.includes('tracking')) problems.push(`${e.providerId}: tracking config without tracking capability`)
    }
    if (!e.rights.comparisonOk && e.rights.couponOk) problems.push(`${e.providerId}: coupon allowed on a no-comparison merchant`)
  }
  return problems
}
