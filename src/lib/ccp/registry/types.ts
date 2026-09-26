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
  /** `accesstrade` = the code wrapper (tracking/accesstrade.ts); `template` = a runtime-configured generic wrapper (A3.1). */
  network: 'accesstrade' | 'template'
  /** ACCESSTRADE campaign id (public; appears in every generated link). Required for `accesstrade`. */
  campaignId?: string
  /** `template` network only: an https template with `{url}` where the encoded destination goes. */
  template?: string
  /** Approval state as last verified in the publisher portal. */
  approval: 'approved' | 'pending' | 'rejected' | 'parked'
  /** The ONLY wrapper endpoint verified to preserve this merchant's deep links. */
  safeWrapper: 'deep_link'
  /** Wrappers verified to DESTROY deep links for this merchant (never used). */
  unsafeWrappers: readonly string[]
}

export type AdapterFlagName =
  | 'CCP_ADAPTER_DMX' | 'CCP_ADAPTER_TRIPCOM' | 'CCP_ADAPTER_CGV' | 'CCP_ADAPTER_KLOOK'
  | 'CCP_ADAPTER_SHOPEE' | 'CCP_ADAPTER_TIKTOKSHOP' | 'CCP_ADAPTER_LAZADA'
  // Completion Pass (14 Sep 2026): travel search providers and events.
  | 'CCP_ADAPTER_BOOKING' | 'CCP_ADAPTER_AGODA' | 'CCP_ADAPTER_TRAVELOKA' | 'CCP_ADAPTER_VEXERE'
  | 'CCP_ADAPTER_VIETNAMAIRLINES' | 'CCP_ADAPTER_VIETJET' | 'CCP_ADAPTER_TICKETBOX'
  | 'CCP_HANDOFF_ONLY'

// ── Provider state (Completion Pass, 14 Sep 2026 — owner §7) ─────────────────
// Four axes that must never collapse into one another: whether the provider is
// reachable (status), whether it earns (monetisation), how deep a link lands
// (depth profile) and which link the resolver prefers (strategy). "Affiliate
// pending" is a MONETISATION fact; it never makes a provider unavailable.
//
// The status is DERIVED from the entry (tier, adapter shape, tracking), not
// stored beside it — one truth, no second state system:
//   ACTIVE          adapter-backed, tracking approved and applied
//   ACTIVE_DIRECT   adapter-backed, direct links (tracking pending / none)
//   HANDOFF_ONLY    registry facts + passthrough of a discovered page, no grammar of its own
//   BLOCKED_EXTERNAL the capability needs something no one can supply from our side
export type ProviderStatus = 'ACTIVE' | 'ACTIVE_DIRECT' | 'HANDOFF_ONLY' | 'BLOCKED_EXTERNAL'
export type MonetizationStatus = 'APPROVED' | 'PENDING' | 'NOT_APPLICABLE'

/**
 * The link ladder the resolver walks for one (provider, intent), best first.
 * Declared per entry so the audit matrix, the tests and the resolver read one
 * list; ranking still orders emitted links by validity and intent (§8), never
 * by this declaration and never by monetisation.
 */
export type LinkStrategyStep = 'tracked' | 'direct' | 'configured_search' | 'detail' | 'search' | 'handoff'

export type DiscoverySubjectKind = 'product' | 'hotel' | 'restaurant' | 'activity' | 'film' | 'event' | 'route'

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
  /** The link ladder per supported intent (see LinkStrategyStep). */
  linkStrategy: Partial<Record<IntentType, readonly LinkStrategyStep[]>>
  freshness: {
    identity: FreshnessPolicyEntry
    price?: FreshnessPolicyEntry
    availability?: FreshnessPolicyEntry
  }
  rights: RightsFlags
  tracking?: TrackingConfig
  /** Product-policy flag name in src/lib/config/product.ts gating this adapter. */
  enabledFlag: AdapterFlagName
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
  discovery?: { site: string; subjectKind: DiscoverySubjectKind }
  /**
   * Handoff-only providers with this flag get a generic PASSTHROUGH adapter: a
   * discovered page on an allow-listed host is emitted as a DETAIL_HANDOFF at
   * the registry's own depth profile, with no grammar of its own (Phase 8: the
   * food-delivery platforms' restaurant pages). Never for MVP adapters.
   */
  handoffPassthrough?: true
}
