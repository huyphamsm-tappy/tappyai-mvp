import type { AuthRequiredAt, CommerceDomain, CommerceLink, FreshnessType, IntentType, LinkKind, TransactionDepth } from './domain/types'

// ── The row-level attachment (owner decision P6-B, 13 Sep 2026) ─────────────
// A resolved Commerce Link travels on the tool-result ROW under `commerce_links`,
// exactly the way `order_links` / `platform_links` do: carved away from the
// model by toolResultSplit, read by recommendation/actions.ts, rendered by the
// canonical action → liveView / cta / marker channels. No second pipeline.
//
// This is a PROJECTION of CommerceLink, not the link itself. It carries what a
// button, a label and a handoff event need and nothing that is internal to the
// resolver (validation detail, tracking sub-ids, the full depth profile).

export const COMMERCE_LINKS_KEY = 'commerce_links' as const

export interface CommerceLinkRow {
  linkId: string
  requestId: string
  /** What the user opens (wrapper when validated, else the direct URL). */
  url: string
  /** Where the handoff lands — used to dedupe against a row's own `link`. */
  destinationUrl: string
  kind: LinkKind
  providerId: string
  merchantName: string
  domain: CommerceDomain
  intentType: IntentType
  depth: TransactionDepth
  guestDepth: TransactionDepth
  authRequiredAt: AuthRequiredAt
  /** Session-bound URLs (PasGo hold, Trip.com stay) expire; null = stable. */
  expiresAt: string | null
  freshness: {
    source: string
    retrievedAt: string
    expiresAt: string | null
    freshnessType: FreshnessType
    confidence: number
  }
  /** Configuration fields the caller DEFAULTED rather than learned from the user (e.g. adults=2). */
  assumedParams: string[]
  /** User-facing limitation sentences from the adapter (vi). */
  limitations: string[]
  tracked: boolean
}

export function projectCommerceLinkRow(link: CommerceLink, requestId: string, intentType: IntentType, assumedParams: string[] = []): CommerceLinkRow {
  return {
    linkId: link.linkId,
    requestId,
    url: link.url,
    destinationUrl: link.directUrl,
    kind: link.kind,
    providerId: link.providerId,
    merchantName: link.merchantName,
    domain: link.domain,
    intentType,
    depth: link.depth,
    guestDepth: link.depthProfile.guestDepth,
    authRequiredAt: link.authRequiredAt,
    expiresAt: link.expiresAt,
    freshness: {
      source: link.freshness.source,
      retrievedAt: link.freshness.retrievedAt,
      expiresAt: link.freshness.expiresAt,
      freshnessType: link.freshness.freshnessType,
      confidence: link.freshness.confidence,
    },
    assumedParams: [...assumedParams],
    limitations: [...link.limitations],
    tracked: link.tracking.mode !== 'none',
  }
}

/** Structural check for a row attachment that came back from JSON (a persisted or cached result). */
export function isCommerceLinkRow(v: unknown): v is CommerceLinkRow {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.linkId === 'string' && typeof r.url === 'string' && typeof r.destinationUrl === 'string'
    && typeof r.providerId === 'string' && typeof r.intentType === 'string' && typeof r.kind === 'string'
    && typeof r.depth === 'number' && typeof r.authRequiredAt === 'string'
    && !!r.freshness && typeof (r.freshness as Record<string, unknown>).freshnessType === 'string'
}

/** Does the user meet a merchant login BEFORE the step the link lands on can be completed? */
export function requiresMerchantLogin(authRequiredAt: AuthRequiredAt): boolean {
  return authRequiredAt === 'before_configuration' || authRequiredAt === 'before_selection' || authRequiredAt === 'before_checkout'
}
