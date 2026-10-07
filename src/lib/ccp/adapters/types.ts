import type { CommerceRequest, Configuration, Offer, TransactionDepth } from '../domain/types'
import type { ProviderRegistryEntry } from '../registry/types'
import type { FeedItem } from '../feeds/accesstradeCsv'

// ── Provider adapter contract (Plan §5) ──────────────────────────────────────
// Every method is optional in the sense that a provider may not implement it;
// the registry's `capabilities` list says which ones exist, and the resolver
// degrades (fallback ladder) rather than failing when one is missing.
//
// Adapters are PURE with respect to the network in MVP: they build URLs and
// annotate them; no adapter fetches a merchant page. Discovery inputs (feed
// rows, search hits) are handed in by the caller.

export interface DirectLinkBuild {
  /** The deepest verified direct URL for the configuration. */
  url: string
  /** Depth this URL lands at for a guest. */
  depth: TransactionDepth
  /** Configuration fields the URL carries verbatim. */
  paramsPreserved: string[]
  /** Fields the merchant page asks for instead (not a loss — a boundary). */
  paramsPageOnly: string[]
  /** Fields the grammar cannot carry at all (a loss; lowers deep-link precision). */
  paramsDropped: string[]
  /** ISO expiry for session-bound URLs, else null. */
  expiresAt: string | null
  /** Whether this exact grammar was verified in the audit ('verified') or is
   * derived from an observed-once URL ('observed') — never 'guessed'. */
  grammar: 'verified' | 'observed'
  /** User-facing limitations, in Vietnamese, from the merchant's own behaviour. */
  limitations: string[]
}

export interface DiscoveryHint {
  /** A canonical merchant URL the caller already has (search hit, feed row). */
  url?: string
  /** Provider-side id when known. */
  subjectRef?: string
  title?: string
  /** A parsed feed row for feed-backed merchants (DMX, CellphoneS). */
  feedItem?: FeedItem
  /** D7 gate: only when the written data-rights confirmation is on file. */
  feedDisplayEnabled?: boolean
  /**
   * What a READ-ONLY look at the merchant page established (Phase 8, owner-like
   * UAT R1 P1-1). Performed by the tool layer (safeGetText, allow-listed host),
   * never by CCP. `bookable: false` means the merchant itself says this subject
   * cannot be booked through it right now ("đã dừng đặt chỗ", "Chưa hỗ trợ đặt
   * bàn") — the adapter must then emit NO transactional link. `null` = unknown
   * (fetch failed or the page carries no signal): only the detail page may be
   * emitted, never the hold/checkout grammar.
   */
  verified?: { bookable: boolean | null; checkedAt: string; source: 'merchant_page' }
}

export interface ProviderAdapter {
  readonly providerId: string
  readonly entry: ProviderRegistryEntry
  /** Can this adapter serve the request at all (domain + intent + configuration kind)? */
  supports(request: CommerceRequest): boolean
  /**
   * Turn a discovery hint into an Offer, or null when the hint is not this
   * merchant's (wrong host) or not a recognisable subject.
   */
  toOffer(request: CommerceRequest, hint: DiscoveryHint, now?: Date): Offer | null
  /** Build the deepest direct URL for the offer + configuration. */
  buildDirectLink(offer: Offer, configuration: Configuration | undefined, now?: Date): DirectLinkBuild | null
}
