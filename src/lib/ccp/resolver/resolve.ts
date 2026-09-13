import { createHash } from 'node:crypto'
import { CCP_AFFILIATE_WRAPPING_ENABLED } from '@/lib/config/product'
import type { CommerceLink, CommerceRequest, Configuration, LinkKind, Offer, TrackingInfo, ValidationStatus } from '../domain/types'
import { decayConfidence, makeFreshness } from '../domain/freshness'
import type { ProviderAdapter } from '../adapters/types'
import { checkCommerceUrl } from '../validation/url'
import { wrapWithAccesstrade } from '../tracking/accesstrade'

// ── Deep Link Resolver (Plan §6) ─────────────────────────────────────────────
// 1. build the deepest verified DIRECT URL for the configuration (adapter)
// 2. validate it (host allow-list, scheme, injection) — an unsafe direct URL
//    ends the resolution: nothing downstream may "fix" it
// 3. optionally wrap affiliate tracking (owner decision D4)
// 4. prove the wrapper preserves the destination (param echo) — else direct
// 5. determine the actual link kind from what the URL reaches + how it tracks
// 6. return depth / auth / freshness metadata on the CommerceLink
//
// Nothing here fetches anything. Link generation is not a click.

export interface ResolveOptions {
  now?: Date
  allowTracking?: boolean
  actorHash?: string
  utmContent?: string
  wrappingEnabled?: boolean
}

export type ResolveOutcome =
  | { ok: true; link: CommerceLink; wrapper: 'applied' | 'rejected' | 'unavailable' | 'disabled'; wrapperDetail?: string }
  | { ok: false; reason: 'no_grammar' | 'unsafe_direct_url'; detail: string }

function linkId(url: string, actorHash?: string): string {
  return createHash('sha256').update(`${url}|${actorHash ?? ''}`).digest('hex').slice(0, 24)
}

/** Kind from the tracking axis first, then from the landing depth. */
export function deriveKind(depth: number, tracking: TrackingInfo, carriesConfiguration: boolean): LinkKind {
  if (tracking.mode === 'affiliate') return 'AFFILIATE_DEEP_LINK'
  if (tracking.mode === 'first_party') return 'TRACKED_DEEP_LINK'
  if (depth >= 5) return 'CHECKOUT_HANDOFF'
  if (carriesConfiguration) return 'DIRECT_DEEP_LINK'
  if (depth === 4) return 'CONFIGURED_HANDOFF'
  if (depth === 3) return 'DETAIL_HANDOFF'
  return 'SEARCH_HANDOFF'
}

export function resolveDeepLink(
  adapter: ProviderAdapter,
  request: CommerceRequest,
  offer: Offer,
  configuration: Configuration | undefined,
  opts: ResolveOptions = {},
): ResolveOutcome {
  const now = opts.now ?? new Date()
  const entry = adapter.entry

  // 1 · direct URL
  const build = adapter.buildDirectLink(offer, configuration, now)
  if (!build) return { ok: false, reason: 'no_grammar', detail: `${adapter.providerId} cannot build a link for this configuration` }

  // 2 · validate the direct URL — the only URL that may ever reach the user
  const safety = checkCommerceUrl(build.url, entry)
  if (!safety.ok) return { ok: false, reason: 'unsafe_direct_url', detail: safety.reason }

  // 3–4 · optional wrapper with mandatory param echo
  let url = build.url
  let tracking: TrackingInfo = { mode: 'none' }
  let validation: ValidationStatus = build.grammar === 'verified' ? 'grammar_ok' : 'grammar_unverified'
  let wrapper: 'applied' | 'rejected' | 'unavailable' | 'disabled' = 'unavailable'
  let wrapperDetail: string | undefined
  const wrappingEnabled = opts.wrappingEnabled ?? CCP_AFFILIATE_WRAPPING_ENABLED
  const allowTracking = opts.allowTracking ?? request.context?.allowTracking ?? true
  if (!wrappingEnabled || !allowTracking) {
    wrapper = 'disabled'
  } else if (entry.tracking && entry.capabilities.includes('tracking')) {
    const w = wrapWithAccesstrade({ directUrl: build.url, tracking: entry.tracking, actorHash: opts.actorHash ?? request.context?.actorHash, utmContent: opts.utmContent })
    if (w.ok) {
      url = w.url
      tracking = w.tracking
      validation = 'param_echo_ok'
      wrapper = 'applied'
    } else {
      wrapper = w.reason === 'not_configured' || w.reason === 'campaign_not_approved' ? 'unavailable' : 'rejected'
      wrapperDetail = `${w.reason}${w.detail ? `: ${w.detail}` : ''}`
    }
  }

  // 5 · kind
  const carriesConfiguration = build.paramsPreserved.some(p => !/Ref$/.test(p))
  const kind = deriveKind(build.depth, tracking, carriesConfiguration)

  // 6 · metadata
  const profileConfidence = decayConfidence(build.grammar === 'verified' ? 1 : 0.6, offer.depthProfile.verifiedOn, now)
  const confidence = Math.min(profileConfidence, offer.freshness.confidence)
  const freshness = makeFreshness(offer.freshness.source, { freshnessType: offer.freshness.freshnessType, ttlMs: offer.freshness.expiresAt ? Math.max(0, new Date(offer.freshness.expiresAt).getTime() - now.getTime()) : null }, { now, confidence })

  const link: CommerceLink = {
    linkId: linkId(url, opts.actorHash ?? request.context?.actorHash),
    url,
    directUrl: build.url,
    kind,
    providerId: adapter.providerId,
    merchantId: offer.merchantId,
    merchantName: offer.merchantName,
    domain: offer.domain,
    depth: build.depth,
    depthProfile: offer.depthProfile,
    paramsPreserved: build.paramsPreserved,
    paramsPageOnly: build.paramsPageOnly,
    paramsDropped: build.paramsDropped,
    tracking,
    authRequiredAt: offer.depthProfile.authRequiredAt,
    expiresAt: build.expiresAt,
    freshness,
    confidence,
    limitations: build.limitations,
    validation: { status: validation, method: tracking.mode === 'affiliate' ? 'decode' : 'static', checkedAt: now.toISOString(), detail: wrapperDetail },
  }
  return { ok: true, link, wrapper, wrapperDetail }
}
