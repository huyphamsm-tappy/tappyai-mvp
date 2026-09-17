import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { INTENT_CAPABILITY } from '../domain/types'
import { PROVIDER_REGISTRY } from '../registry'
import type { ProviderRegistryEntry } from '../registry/types'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'
import type { SearchCapableAdapter } from './marketplace'
import { q } from '../validation/url'

// ── Composable SEARCH grammars of passthrough providers (Final local live UAT, 14 Sep 2026) ──
// Verified read-only on 14 Sep 2026 (200, query in the page title):
//   GrabFood    https://food.grab.com/vn/vi/restaurants?search=<q>   (the legacy /vn/en/s?searchKeyword= is 404)
//   CellphoneS  https://cellphones.com.vn/catalogsearch/result?q=<q>
// ShopeeFood has none: /tim-kiem?q= drops the query and lands on the city listing (verified in a
// browser) — its restaurant pages are discovered, never searched. A user who names a merchant
// with a grammar always has that merchant's path, even when no subject page was discovered.
const PASSTHROUGH_SEARCH: Record<string, { template: string; depth: 2; limitation: string; pageOnly: string[]; dropped: string[] }> = {
  grabfood: { template: 'https://food.grab.com/vn/vi/restaurants?search={q}', depth: 2, limitation: 'Trang tìm kiếm GrabFood cho quán này — chọn đúng quán trên trang; đặt món cần đăng nhập Grab.', pageOnly: ['items', 'quantity', 'address'], dropped: ['restaurantRef'] },
  cellphones: { template: 'https://cellphones.com.vn/catalogsearch/result?q={q}', depth: 2, limitation: 'Trang tìm kiếm trên CellphoneS — bạn chọn đúng sản phẩm trên trang.', pageOnly: ['variant', 'quantity'], dropped: ['productRef'] },
}
const SEARCH_REF = 'search:'
const searchBuilds = new WeakMap<Offer, string>()

/** The passthrough providers' composable search templates (`{q}`), for the legacy builders and the prompt. */
export function passthroughSearchTemplates(): Array<{ providerId: string; name: string; template: string }> {
  return PROVIDER_REGISTRY.filter(e => PASSTHROUGH_SEARCH[e.providerId]).map(e => ({ providerId: e.providerId, name: e.merchantName, template: PASSTHROUGH_SEARCH[e.providerId].template }))
}

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

export function passthroughAdapterFor(entry: ProviderRegistryEntry): ProviderAdapter | SearchCapableAdapter {
  const search = PASSTHROUGH_SEARCH[entry.providerId]
  return {
    providerId: entry.providerId,
    entry,
    ...(search ? {
      searchOffer(request: CommerceRequest, now: Date = new Date()): Offer | null {
        const term = request.subject.replace(/\s+/g, ' ').trim()
        if (!term) return null
        const url = search.template.replace('{q}', q(term))
        const offer = baseOffer(entry, request, `${SEARCH_REF}${term.slice(0, 120)}`, url, request.subject, now)
        searchBuilds.set(offer, url)
        return offer
      },
    } : {}),
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
      if (search && offer.subjectRef.startsWith(SEARCH_REF)) {
        return {
          url: searchBuilds.get(offer) ?? offer.canonicalUrl,
          depth: search.depth,
          paramsPreserved: [],
          paramsPageOnly: [...search.pageOnly],
          paramsDropped: [...search.dropped],
          expiresAt: null,
          grammar: 'verified',
          limitations: [search.limitation, ...(auth ? [auth] : [])],
        }
      }
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
