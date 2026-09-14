import type { CommerceCapability, CommerceDomain, FreshnessType, IntentType, RightsFlags, TransactionDepthProfile } from '../domain/types'

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
  /** TECHNICAL capabilities the adapter implements (search, resolveDeepLink, tracking…). */
  capabilities: readonly ProviderCapability[]
  /**
   * COMMERCE capabilities the merchant actually offers a user, as verified.
   * Owner correction 13 Sep 2026: this is what routing and ranking match on —
   * a provider is a candidate for a request only when it declares the
   * request's capability. Not to be inferred from the domain.
   */
  commerce: readonly CommerceCapability[]
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
  enabledFlag: 'CCP_ADAPTER_DMX' | 'CCP_ADAPTER_TRIPCOM' | 'CCP_ADAPTER_CGV' | 'CCP_ADAPTER_KLOOK' | 'CCP_ADAPTER_SHOPEE' | 'CCP_ADAPTER_TIKTOKSHOP' | 'CCP_ADAPTER_LAZADA' | 'CCP_HANDOFF_ONLY'
  /** MVP adapters implement the contract; handoff-only entries carry facts for the ladder but no adapter. */
  tier: 'mvp' | 'handoff_only'
  /**
   * Shopping segment (owner decision 14 Sep 2026): a MARKETPLACE lists many sellers' listings
   * (Shopee, TikTok Shop, Lazada); a RETAILER sells its own catalogue (Điện Máy Xanh,
   * CellphoneS). Presentation may group by it; routing and ranking never read it.
   */
  segment?: 'marketplace' | 'retail'
  notes: readonly string[]
  /**
   * How the tool layer may LOOK FOR this merchant's pages when a tool result carries no
   * owned URL: a "site:" scope for a web search plus the kind of subject the scope is
   * about. Registry DATA, so the query is composed outside CCP without spelling a host.
   * Absent = no discovery (handoff-only providers; CGV film pages have no film tool yet).
   */
  discovery?: { site: string; subjectKind: 'product' | 'hotel' | 'restaurant' | 'activity' | 'film' }
  /**
   * Handoff-only providers with this flag get a generic PASSTHROUGH adapter: a
   * discovered page on an allow-listed host is emitted as a DETAIL_HANDOFF at
   * the registry's own depth profile, with no grammar of its own (Phase 8: the
   * food-delivery platforms' restaurant pages). Never for MVP adapters.
   */
  handoffPassthrough?: true
}
