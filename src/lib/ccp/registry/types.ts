import type { CommerceDomain, FreshnessType, IntentType, RightsFlags, TransactionDepthProfile } from '../domain/types'

// The provider registry is DATA about providers: what they can do, how deep
// they go, how fresh their data is, what rights apply and which tracking
// wrapper is safe. It is versioned in the repository because every fact here
// was established by a dated verification (Transaction Depth Audit) and changes
// only by re-verification — code review is the right change control.
//
// It deliberately contains NO URL-building logic: grammars live in adapter
// code so a grammar change is a reviewed code change with a golden test.

export type ProviderCapability =
  | 'search'
  | 'details'
  | 'availability'
  | 'pricing'
  | 'configure'
  | 'resolveDeepLink'
  | 'transactionBoundary'
  | 'tracking'
  | 'conversions'

export interface FreshnessPolicyEntry {
  freshnessType: FreshnessType
  ttlMs: number | null
  note: string
}

export interface TrackingConfig {
  network: 'accesstrade'
  /** ACCESSTRADE campaign id (public; appears in every generated link). */
  campaignId: string
  /** Approval state as last verified in the publisher portal. */
  approval: 'approved' | 'pending' | 'rejected' | 'parked'
  /** The ONLY wrapper endpoint verified to preserve this merchant's deep links. */
  safeWrapper: 'deep_link'
  /** Wrappers verified to DESTROY deep links for this merchant (never used). */
  unsafeWrappers: readonly string[]
}

export interface ProviderRegistryEntry {
  providerId: string
  merchantId: string
  merchantName: string
  domains: readonly CommerceDomain[]
  intents: readonly IntentType[]
  /** Hosts a resolved URL for this provider may point at. Exact host or `*.` suffix. */
  allowedHosts: readonly string[]
  capabilities: readonly ProviderCapability[]
  /** One profile per supported intent. */
  depth: Partial<Record<IntentType, TransactionDepthProfile>>
  freshness: {
    identity: FreshnessPolicyEntry
    price?: FreshnessPolicyEntry
    availability?: FreshnessPolicyEntry
  }
  rights: RightsFlags
  tracking?: TrackingConfig
  /** Product-policy flag name in src/lib/config/product.ts gating this adapter. */
  enabledFlag: 'CCP_ADAPTER_DMX' | 'CCP_ADAPTER_TRIPCOM' | 'CCP_ADAPTER_PASGO' | 'CCP_ADAPTER_CGV' | 'CCP_ADAPTER_KLOOK' | 'CCP_HANDOFF_ONLY'
  /** MVP adapters implement the contract; handoff-only entries carry facts for the ladder but no adapter. */
  tier: 'mvp' | 'handoff_only'
  notes: readonly string[]
}
