import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import type { ProviderRegistryEntry } from '../registry/types'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'

// ── Shopping marketplaces — Shopee · TikTok Shop · Lazada (owner decision 14 Sep 2026) ─
//
// Three marketplaces, one shape: a PRODUCT page identified by a merchant id in
// the path, and — where the merchant publishes one — a SEARCH page keyed by the
// user's words. The product page is the deep link (L3 landing; the registry's
// depth profile says how far a guest gets from there). The search page is the
// honest fallback when no product page for the subject was discovered: it is
// emitted as a SEARCH_HANDOFF (L2), carries no product identity, and ranks
// below every detail link because `productRef` is recorded as dropped.
//
// 🔑 IDENTITY IS NEVER INVENTED. An adapter turns a discovered URL into an
// offer only when the URL matches the merchant's product grammar; the id in the
// offer is the id in the URL. Whether the page is the product the user asked
// for is the tool layer's check (productIdentity), made before the hint
// reaches CCP; the adapter cannot know and does not guess.
//
// Grammars (read-only, 14 Sep 2026; see the registry notes for the evidence):
//   Shopee       https://shopee.vn/<slug>-i.<shopId>.<itemId>             product
//                https://shopee.vn/search?keyword=<q>                     search (login-walled for web guests)
//   TikTok Shop  https://shop.tiktok.com/vn/pdp/<slug>/<id>               product
//                https://www.tiktok.com/shop/vn/pdp/<id>                  product
//                https://www.tiktok.com/view/product/<id>                 product (global form)
//                https://shop.tiktok.com/vn/k/<slug>                      keyword listing — DISCOVERED ONLY
//   Lazada       https://www.lazada.vn/products/<slug>-i<id>.html         product
//                https://www.lazada.vn/catalog/?q=<q>                     search
//
// Feed data (ACCESSTRADE CSV / TikTok product feed API) is NOT read here: the
// written data-rights confirmation is pending (D7), and a marketplace does not
// need it to be a provider — the link is the product.

interface MarketplaceGrammar {
  /** Product page → { id, canonical } or null. */
  product(u: URL): { id: string; canonical: string } | null
  /** Search URL for a query, or null when the merchant publishes no composable search grammar. */
  search(query: string): string | null
  /** A discovered listing page that is not a product (TikTok keyword pages) → canonical, or null. */
  listing?(u: URL): string | null
  /** Page-only fields the merchant asks for. */
  pageOnly: string[]
  productLimitation: string
}

const SHOPEE_PRODUCT = /^\/(?:[^/]+-)?i\.(\d{1,12})\.(\d{1,15})\/?$/
const TIKTOK_PDP = /^\/vn\/pdp\/(?:[^/]+\/)?(\d{15,25})\/?$/
const TIKTOK_SHOP_PDP = /^\/shop\/vn\/pdp\/(?:[^/]+\/)?(\d{15,25})\/?$/
const TIKTOK_VIEW = /^\/view\/product\/(\d{15,25})\/?$/
const TIKTOK_KEYWORD = /^\/vn\/k\/([a-z0-9-]{2,120})\/?$/
const LAZADA_PRODUCT = /^\/products\/(?:[^/]+-)?i(\d{1,15})\.html$/

const q = (s: string) => encodeURIComponent(s.replace(/\s+/g, ' ').trim()).replace(/%20/g, '+')

const GRAMMARS: Record<'shopee' | 'tiktokshop' | 'lazada', MarketplaceGrammar> = {
  shopee: {
    product(u) {
      if (u.hostname !== 'shopee.vn' && u.hostname !== 'www.shopee.vn') return null
      const m = u.pathname.match(SHOPEE_PRODUCT)
      // The canonical keeps the merchant's own slug (decoded titles are part of the URL).
      return m ? { id: `${m[1]}.${m[2]}`, canonical: `https://shopee.vn${u.pathname.replace(/\/$/, '')}` } : null
    },
    search: query => `https://shopee.vn/search?keyword=${q(query)}`,
    pageOnly: ['variant', 'quantity'],
    productLimitation: 'Chọn phân loại và số lượng trên trang sản phẩm rồi bấm "Mua ngay".',
  },
  tiktokshop: {
    product(u) {
      const host = u.hostname
      if (host === 'shop.tiktok.com') {
        const m = u.pathname.match(TIKTOK_PDP)
        return m ? { id: m[1], canonical: `https://shop.tiktok.com${u.pathname.replace(/\/$/, '')}` } : null
      }
      if (host === 'www.tiktok.com') {
        const m = u.pathname.match(TIKTOK_SHOP_PDP) ?? u.pathname.match(TIKTOK_VIEW)
        return m ? { id: m[1], canonical: `https://www.tiktok.com${u.pathname.replace(/\/$/, '')}` } : null
      }
      return null
    },
    // /shop/s/<q> renders an empty app shell and an arbitrary /vn/k/<slug> 404s (verified 14 Sep
    // 2026): TikTok Shop has no composable web search grammar. Keyword pages are used only when
    // discovery found them.
    search: () => null,
    listing(u) {
      if (u.hostname !== 'shop.tiktok.com') return null
      const m = u.pathname.match(TIKTOK_KEYWORD)
      return m ? `https://shop.tiktok.com/vn/k/${m[1]}` : null
    },
    pageOnly: ['variant', 'quantity'],
    productLimitation: 'Chọn phân loại và số lượng trên trang sản phẩm rồi bấm "Buy now".',
  },
  lazada: {
    product(u) {
      if (u.hostname !== 'www.lazada.vn' && u.hostname !== 'lazada.vn') return null
      const m = u.pathname.match(LAZADA_PRODUCT)
      return m ? { id: m[1], canonical: `https://www.lazada.vn${u.pathname}` } : null
    },
    search: query => `https://www.lazada.vn/catalog/?q=${q(query)}`,
    pageOnly: ['variant', 'quantity'],
    productLimitation: 'Chọn phân loại và số lượng trên trang sản phẩm rồi bấm "Mua ngay".',
  },
}

/** Offers built from a search / listing page carry this ref prefix so the link builder knows they are not products. */
const SEARCH_REF = 'search:'

function marketplaceAdapter(entry: ProviderRegistryEntry, grammar: MarketplaceGrammar): MarketplaceAdapter {
  return {
    providerId: entry.providerId,
    entry,
    supports(request: CommerceRequest) {
      return request.domain === 'shopping' && request.intentType === 'buy_product'
    },
    toOffer(request, hint: DiscoveryHint, now = new Date()) {
      const u = ownedUrl(entry, hint)
      if (!u) return null
      const product = grammar.product(u)
      if (product) return baseOffer(entry, request, product.id, product.canonical, hint.title ?? request.subject, now)
      const listing = grammar.listing?.(u)
      if (listing) return baseOffer(entry, request, `${SEARCH_REF}${u.pathname}`, listing, hint.title ?? request.subject, now)
      return null
    },
    searchOffer(request, now = new Date()) {
      const url = grammar.search(request.subject)
      if (!url) return null
      return baseOffer(entry, request, `${SEARCH_REF}${request.subject.slice(0, 120)}`, url, request.subject, now)
    },
    buildDirectLink(offer: Offer, configuration: Configuration | undefined): DirectLinkBuild | null {
      if (configuration && configuration.kind !== 'shopping') return null
      const auth = authLimitation(offer.depthProfile, offer.merchantName)
      if (offer.subjectRef.startsWith(SEARCH_REF)) {
        return {
          url: offer.canonicalUrl,
          depth: 2,
          paramsPreserved: [],
          paramsPageOnly: [...grammar.pageOnly],
          // No product identity: the page is a list for the user's words, and ranking must know.
          paramsDropped: ['productRef'],
          expiresAt: null,
          grammar: 'verified',
          limitations: [`Trang tìm kiếm trên ${offer.merchantName} — bạn chọn đúng sản phẩm trên trang.`, ...(auth ? [auth] : [])],
        }
      }
      return {
        url: offer.canonicalUrl,
        depth: 3,
        paramsPreserved: ['productRef'],
        paramsPageOnly: [...grammar.pageOnly],
        paramsDropped: [],
        expiresAt: null,
        grammar: 'verified',
        limitations: [grammar.productLimitation, ...(auth ? [auth] : [])],
      }
    },
  }
}

/** A marketplace adapter can also offer its search page for the request's subject (L2, honest fallback). */
export interface MarketplaceAdapter extends ProviderAdapter {
  searchOffer(request: CommerceRequest, now?: Date): Offer | null
}

export const shopeeAdapter = marketplaceAdapter(getProvider('shopee')!, GRAMMARS.shopee)
export const tiktokshopAdapter = marketplaceAdapter(getProvider('tiktokshop')!, GRAMMARS.tiktokshop)
export const lazadaAdapter = marketplaceAdapter(getProvider('lazada')!, GRAMMARS.lazada)

export const MARKETPLACE_ADAPTERS: readonly MarketplaceAdapter[] = [shopeeAdapter, tiktokshopAdapter, lazadaAdapter]

export function isMarketplaceAdapter(a: ProviderAdapter): a is MarketplaceAdapter {
  return typeof (a as MarketplaceAdapter).searchOffer === 'function'
}

/**
 * The composable SEARCH grammars, for the legacy search builders and the prompt's CTA
 * templates (`{q}` is the placeholder). This is the ONLY place outside an adapter that may
 * hand a marketplace host to the legacy layer: the list is registry data, and a merchant
 * without a composable search page (TikTok Shop) is simply absent.
 */
export function marketplaceSearchTemplates(): Array<{ providerId: string; name: string; template: string }> {
  const out: Array<{ providerId: string; name: string; template: string }> = []
  for (const a of MARKETPLACE_ADAPTERS) {
    const url = GRAMMARS[a.providerId as keyof typeof GRAMMARS].search('{q}')
    if (url) out.push({ providerId: a.providerId, name: a.entry.merchantName, template: url.replace('%7Bq%7D', '{q}') })
  }
  return out
}
