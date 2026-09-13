import { createHash, randomUUID } from 'node:crypto'
import { CCP_ENABLED } from '@/lib/config/product'
import type { CommerceLink, CommerceRequest, CommerceResult, Offer, ProviderFailure } from './domain/types'
import { parseCommerceRequest } from './domain/request'
import { adaptersFor, type DiscoveryHint, type ProviderAdapter } from './adapters'
import { resolveDeepLink } from './resolver/resolve'
import { rankLinks } from './ranking/score'
import { RANKING_VERSION } from './ranking/weights'
import { emitCommerceEvent } from './events/sink'
import { isExpired } from './domain/freshness'

export type * from './domain/types'
export { parseCommerceRequest, CommerceRequestSchema } from './domain/request'
export { PROVIDER_REGISTRY, getProvider, providersFor } from './registry'
export { resolveDeepLink } from './resolver/resolve'
export { rankLinks } from './ranking/score'
export { RANKING_WEIGHTS, RANKING_VERSION } from './ranking/weights'
export { projectToCta, type CommerceCta } from './cta/projection'
export { emitCommerceEvent, setCommerceEventWriter } from './events/sink'

// ── Orchestrator (Plan §2 core flow) ─────────────────────────────────────────
// AI intent → CommerceRequest → provider discovery → realtime/freshness →
// configuration → Deep Link Resolver → validation → ranking → CommerceLinks.
//
// Discovery inputs are HINTS the caller already holds (search hits, feed rows,
// ids resolved by the conversation); the orchestrator never fetches. That keeps
// it pure, testable and click-free, and lets the chat pipeline keep its own
// discovery (Serper, feeds) while CCP owns everything from the Offer onward.

export interface ResolveCommerceOptions {
  hints?: DiscoveryHint[]
  now?: Date
  /** Test seam: override the product flags. */
  enabled?: boolean
  adapters?: ProviderAdapter[]
}

function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

export function resolveCommerce(input: unknown, opts: ResolveCommerceOptions = {}): CommerceResult | { ok: false; issues: string[] } {
  const parsed = parseCommerceRequest(input)
  if (!parsed.ok) return parsed
  const request = parsed.request
  const now = opts.now ?? new Date()
  const requestId = randomUUID()
  const enabled = opts.enabled ?? CCP_ENABLED

  emitCommerceEvent(
    {
      type: 'commerce_request',
      requestId,
      domain: request.domain,
      intentType: request.intentType,
      configurationKeys: request.configuration ? Object.keys(request.configuration).filter(k => k !== 'kind') : [],
      actorHash: request.context?.actorHash,
      sessionHash: request.context?.sessionHash,
      platform: request.context?.platform,
    },
    now,
  )

  const empty: CommerceResult = { requestId, request, links: [], offers: [], providersQueried: [], providersFailed: [], rankingVersion: RANKING_VERSION, generatedAt: now.toISOString() }
  if (!enabled) return { ...empty, providersFailed: [{ providerId: '*', code: 'disabled', detail: 'CCP_ENABLED is false' }] }

  const adapters = opts.adapters ?? adaptersFor(request)
  const hints = opts.hints ?? []
  const offers: Offer[] = []
  const links: CommerceLink[] = []
  const failed: ProviderFailure[] = []
  const queried: string[] = []

  for (const adapter of adapters) {
    const started = Date.now()
    queried.push(adapter.providerId)
    if (request.constraints?.merchantAllowList && !request.constraints.merchantAllowList.includes(adapter.entry.merchantId)) {
      failed.push({ providerId: adapter.providerId, code: 'unsupported_intent', detail: 'merchant not in allow-list' })
      continue
    }
    const mine: Offer[] = []
    for (const hint of hints) {
      const offer = adapter.toOffer(request, hint, now)
      if (offer) mine.push(offer)
    }
    emitCommerceEvent({ type: 'provider_search', requestId, providerId: adapter.providerId, offersCount: mine.length, freshnessType: mine[0]?.freshness.freshnessType, latencyMs: Date.now() - started }, now)
    if (mine.length === 0) {
      failed.push({ providerId: adapter.providerId, code: 'no_offer' })
      continue
    }
    for (const offer of mine) {
      // Hard filters before any scoring (Plan §10).
      if (request.context?.requireGuestPath && offer.depthProfile.guestDepth < 5) continue
      const r = resolveDeepLink(adapter, request, offer, request.configuration, { now })
      if (!r.ok) {
        failed.push({ providerId: adapter.providerId, code: 'error', detail: `${r.reason}: ${r.detail}` })
        continue
      }
      if (isExpired(r.link.freshness, now)) continue
      offers.push(offer)
      links.push(r.link)
      emitCommerceEvent(
        {
          type: 'deep_link_resolved',
          requestId,
          linkId: r.link.linkId,
          providerId: r.link.providerId,
          merchantId: r.link.merchantId,
          domain: r.link.domain,
          kind: r.link.kind,
          depth: r.link.depth,
          guestDepth: r.link.depthProfile.guestDepth,
          authenticatedDepth: r.link.depthProfile.authenticatedDepth,
          authRequiredAt: r.link.authRequiredAt,
          paramsPreserved: r.link.paramsPreserved,
          paramsDropped: r.link.paramsDropped,
          trackingPresent: r.link.tracking.mode !== 'none',
          trackingNetwork: r.link.tracking.mode === 'affiliate' ? r.link.tracking.network : undefined,
          freshnessType: r.link.freshness.freshnessType,
          expiresAt: r.link.expiresAt,
          confidence: r.link.confidence,
          urlHash: urlHash(r.link.url),
        },
        now,
      )
      emitCommerceEvent({ type: 'deep_link_validated', linkId: r.link.linkId, status: r.link.validation.status, method: r.link.validation.method, ms: Date.now() - started, detail: r.wrapperDetail }, now)
    }
  }

  const ranked = rankLinks(request, links, now)
  if (ranked[0]) {
    emitCommerceEvent({ type: 'provider_selected', requestId, providerId: ranked[0].link.providerId, merchantId: ranked[0].link.merchantId, score: ranked[0].score, rankingVersion: RANKING_VERSION, features: ranked[0].features }, now)
  }
  return { ...empty, links: ranked.map(r => r.link), offers, providersQueried: queried, providersFailed: failed }
}
