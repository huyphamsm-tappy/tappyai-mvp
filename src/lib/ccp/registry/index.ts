import { PROVIDER_REGISTRY } from './providers'
import { effectiveTracking } from './runtime'
import type { LinkStrategyStep, MonetizationStatus, ProviderRegistryEntry, ProviderStatus } from './types'
import { INTENT_CAPABILITY, type CommerceCapability, type CommerceDomain, type IntentType, type TransactionDepthProfile } from '../domain/types'

export type { ProviderRegistryEntry, ProviderCapability, TrackingConfig, ProviderStatus, MonetizationStatus, LinkStrategyStep, DiscoverySubjectKind } from './types'
export { PROVIDER_REGISTRY } from './providers'
export { setProviderConfigSource, refreshProviderConfig, providerOverride, isProviderActive, providerTier, effectiveTracking, overrideFromRow, PROVIDER_CONFIG_TTL_MS, __resetProviderConfig, type ProviderOverride, type ProviderConfigSource, type ProviderTier } from './runtime'

// ── REMOVED PROVIDERS — the ones the owner took out and forbade reintroducing ──
//
// PasGo / Tiki / TGDD / California Fitness were in earlier scope and are gone. They have no
// `PROVIDER_REGISTRY` entry, so the registry-driven CTA/link rules never see them — yet the model
// still writes "📦 Tiki" buttons and "chưa kết nối" prose from its own training. This is the one
// place their hosts and names are spelled, inside the CCP layer, so the clients and the AI layer can
// ask "is this a removed merchant?" without spelling a merchant host themselves (architecture rule
// no-commerce-merchant-hosts-outside-ccp).
export const REMOVED_MERCHANT_HOSTS: ReadonlySet<string> = new Set([
  'tiki.vn', 'pasgo.vn', 'thegioididong.com', 'dienthoai.thegioididong.com', 'sendo.vn', 'californiafitness.com.vn', 'cthesports.com',
])
const REMOVED_MERCHANT_NAME_RE = /(?<![\p{L}\p{N}])(tiki|pasgo|th[eế] gi[oớ]i di đ[oộ]ng|tgdd|sendo|california fitness)(?![\p{L}\p{N}])/iu

/** A label or a host that names / points at a removed provider — never reintroduced through the model. */
export function isRemovedMerchant(label: string, host: string): boolean {
  return REMOVED_MERCHANT_HOSTS.has(host.replace(/^www\./, '')) || REMOVED_MERCHANT_NAME_RE.test(label)
}

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

/** Does this provider declare the capability (verified, not inferred from its domain)? */
export function supportsCapability(entry: ProviderRegistryEntry, capability: CommerceCapability): boolean {
  return entry.commerce.includes(capability)
}

/** Providers declaring a capability within a domain — MVP adapters and handoff-only facts alike. */
export function providersForCapability(domain: CommerceDomain, capability: CommerceCapability): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter(p => p.domains.includes(domain) && p.commerce.includes(capability))
}

/**
 * Depth for a (provider, capability) pair. Depth is stored per intent and every
 * transactional capability maps to exactly one intent, so this is a lookup,
 * never an aggregate over the domain — "Food & Drink = L5" cannot be expressed.
 */
export function depthProfileForCapability(entry: ProviderRegistryEntry, capability: CommerceCapability): TransactionDepthProfile | null {
  const intent = (Object.keys(INTENT_CAPABILITY) as IntentType[]).find(i => INTENT_CAPABILITY[i] === capability && entry.intents.includes(i))
  return intent ? entry.depth[intent] ?? null : null
}

// ── Provider state, derived (Completion Pass, owner §7) ─────────────────────
// Reachability and monetisation are separate axes read off the same entry, so
// "affiliate pending" can never be mistaken for "provider unavailable".

/** Whether the merchant earns for TappyAI today — a monetisation fact only. Reads the runtime overlay first (A3.1). */
export function monetizationStatus(entry: ProviderRegistryEntry): MonetizationStatus {
  const eff = effectiveTracking(entry)
  if (eff?.approval === 'approved') return 'APPROVED'
  if (!eff && !entry.tracking) return 'NOT_APPLICABLE'
  // A row that switched the deeplink off leaves the code's pending/approved fact behind: nothing earns.
  if (!eff) return 'NOT_APPLICABLE'
  return 'PENDING'
}

/**
 * How the user reaches the merchant. An adapter-backed provider is ACTIVE (tracked) or
 * ACTIVE_DIRECT (direct links while tracking is pending / absent); a passthrough entry is
 * HANDOFF_ONLY; BLOCKED_EXTERNAL is reserved for a capability that needs something no one can
 * supply from our side (none today — every frozen provider has a direct path).
 */
export function providerStatus(entry: ProviderRegistryEntry): ProviderStatus {
  if (entry.tier === 'handoff_only') return 'HANDOFF_ONLY'
  return monetizationStatus(entry) === 'APPROVED' ? 'ACTIVE' : 'ACTIVE_DIRECT'
}

/** The declared link ladder for a (provider, intent), best first. */
export function linkStrategyFor(entry: ProviderRegistryEntry, intent: IntentType): readonly LinkStrategyStep[] {
  return entry.linkStrategy[intent] ?? []
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
      const strategy = e.linkStrategy?.[intent]
      if (!strategy || strategy.length === 0) problems.push(`${e.providerId}/${intent}: no link strategy declared`)
      // A tracked step needs a tracking config; a provider with an approved wrapper must declare it first.
      if (strategy?.includes('tracked') && !e.tracking) problems.push(`${e.providerId}/${intent}: 'tracked' strategy without tracking config`)
      if (e.tracking && e.capabilities.includes('tracking') && strategy && !strategy.includes('tracked')) problems.push(`${e.providerId}/${intent}: tracking configured but not in the link strategy`)
      if (d.guestDepth > d.bestPossibleDepth) problems.push(`${e.providerId}/${intent}: guestDepth > bestPossibleDepth`)
      if (d.authenticatedDepth !== null && d.authenticatedDepth < d.guestDepth) problems.push(`${e.providerId}/${intent}: authenticatedDepth < guestDepth`)
      if (d.guestDepth === 5 && !['none', 'at_order'].includes(d.authRequiredAt)) problems.push(`${e.providerId}/${intent}: L5 guest depth contradicts authRequiredAt=${d.authRequiredAt}`)
      if (Number.isNaN(Date.parse(d.verifiedOn))) problems.push(`${e.providerId}/${intent}: verifiedOn not a date`)
      if (!/^https:\/\//.test(d.evidence)) problems.push(`${e.providerId}/${intent}: evidence must be an https URL`)
    }
    if (e.tier === 'mvp' && !e.capabilities.includes('resolveDeepLink')) problems.push(`${e.providerId}: mvp tier must resolve deep links`)
    // Capability model: every intent the provider serves must be backed by the declared capability,
    // and a provider that hands users to a merchant flow declares commerce_handoff.
    if (!Array.isArray(e.commerce) || e.commerce.length === 0) problems.push(`${e.providerId}: no commerce capabilities declared`)
    for (const intent of e.intents) {
      const cap = INTENT_CAPABILITY[intent]
      if (!e.commerce.includes(cap)) problems.push(`${e.providerId}: serves ${intent} but does not declare ${cap}`)
    }
    if (!e.commerce.includes('commerce_handoff')) problems.push(`${e.providerId}: a registry provider hands off to a merchant and must declare commerce_handoff`)
    if (e.tracking) {
      if (e.tracking.network !== 'accesstrade') problems.push(`${e.providerId}: the code registry declares only accesstrade tracking (templates are runtime rows)`)
      if (!/^\d{10,25}$/.test(e.tracking.campaignId ?? '')) problems.push(`${e.providerId}: campaignId not numeric`)
      if (e.tracking.safeWrapper !== 'deep_link') problems.push(`${e.providerId}: only the deep_link wrapper is verified safe`)
      if (!e.capabilities.includes('tracking')) problems.push(`${e.providerId}: tracking config without tracking capability`)
    }
    if (!e.rights.comparisonOk && e.rights.couponOk) problems.push(`${e.providerId}: coupon allowed on a no-comparison merchant`)
  }
  return problems
}
