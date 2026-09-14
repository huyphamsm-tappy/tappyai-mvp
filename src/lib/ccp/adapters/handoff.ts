import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { INTENT_CAPABILITY } from '../domain/types'
import { PROVIDER_REGISTRY } from '../registry'
import type { ProviderRegistryEntry } from '../registry/types'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'

// ── Passthrough adapters for handoff-only providers (Phase 8) ────────────────
//
// Owner-like UAT R1 (P1-4): the food-delivery platforms have no URL search
// grammar — ShopeeFood's /tim-kiem?q= lands on the city listing with the query
// dropped — but they DO have restaurant pages (L3), which discovery can find.
// A handoff-only registry entry flagged `handoffPassthrough` therefore gets
// this generic adapter: it composes NO URL of its own; it takes a discovered
// page on the provider's allow-listed host, strips the query, and emits it as
// a DETAIL_HANDOFF at the registry's verified depth profile (guest L3, login /
// app boundary declared). Nothing is guessed: no page, no link.
//
// Root and category pages are refused — "shopeefood.vn/ho-chi-minh" is a
// listing, not a venue, and a handoff must land on the subject.

const MIN_PATH_SEGMENTS = 2

function isSubjectPage(u: URL, kind: ProviderRegistryEntry['discovery'] extends infer D ? (D extends { subjectKind: infer K } ? K : never) : never): boolean {
  const segments = u.pathname.split('/').filter(Boolean)
  // A retailer's product page is one segment ("/iphone-15.html"); a venue page is nested.
  if (segments.length < (kind === 'product' ? 1 : MIN_PATH_SEGMENTS)) return false
  // Search / listing routes seen on the platforms; never a venue.
  if (/^(tim-kiem|search|s|food|fresh|deals?|khuyen-mai)$/i.test(segments[segments.length - 1])) return false
  return true
}

export function passthroughAdapterFor(entry: ProviderRegistryEntry): ProviderAdapter {
  return {
    providerId: entry.providerId,
    entry,
    supports(request: CommerceRequest) {
      return entry.domains.includes(request.domain) && entry.intents.includes(request.intentType)
        && entry.commerce.includes(request.capability ?? INTENT_CAPABILITY[request.intentType])
    },
    toOffer(request, hint: DiscoveryHint, now = new Date()) {
      const u = ownedUrl(entry, hint)
      if (!u || !isSubjectPage(u, entry.discovery?.subjectKind ?? 'restaurant')) return null
      if (hint.verified?.bookable === false) return null
      const canonical = `${u.origin}${u.pathname.replace(/\/+$/, '')}`
      const subjectRef = u.pathname.split('/').filter(Boolean).pop()!
      const offer = baseOffer(entry, request, subjectRef, canonical, hint.title ?? request.subject, now)
      offer.bookable = hint.verified?.bookable ?? null
      return offer
    },
    buildDirectLink(offer: Offer, _configuration: Configuration | undefined): DirectLinkBuild | null {
      const auth = authLimitation(offer.depthProfile, offer.merchantName)
      const product = entry.discovery?.subjectKind === 'product'
      return {
        url: offer.canonicalUrl,
        depth: 3,
        paramsPreserved: [product ? 'productRef' : 'restaurantRef'],
        paramsPageOnly: product ? ['variant', 'quantity'] : ['items', 'quantity', 'address'],
        paramsDropped: [],
        expiresAt: null,
        // The page was discovered, not composed from a verified grammar.
        grammar: 'observed',
        limitations: [product ? 'Chọn phiên bản và số lượng trên trang sản phẩm.' : 'Chọn món và số lượng trên trang nhà hàng.', ...(auth ? [auth] : [])],
      }
    },
  }
}

/** The passthrough adapters the registry currently declares. */
export const PASSTHROUGH_ADAPTERS: readonly ProviderAdapter[] = PROVIDER_REGISTRY
  .filter(e => e.tier === 'handoff_only' && e.handoffPassthrough === true)
  .map(passthroughAdapterFor)
