import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import { makeFreshness, nextFeedRegeneration } from '../domain/freshness'
import type { DirectLinkBuild, DiscoveryHint } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'
import type { SearchCapableAdapter } from './marketplace'
import { q } from '../validation/url'

// ── Điện Máy Xanh — Shopping · verified L5 guest ─────────────────────────────
// Grammar: the canonical product URL from the feed / search hit, e.g.
//   https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb
// The user taps "Mua ngay" on that page and lands on /cart, which is the full
// checkout (delivery or pick-up, address, COD / bank transfer); the SMS OTP is
// requested only when "Đặt hàng" is pressed. Variant (colour) and quantity are
// chosen on the page — the URL does not carry them.
//
// Feed data (title, price) is attached ONLY when the caller passes a feed row
// AND display rights are on (product.ts CCP_FEED_DISPLAY_ENABLED, owner
// decision D7). Until then the Offer is link-only.

const entry = getProvider('dmx')!

const PRODUCT_PATH = /^\/[a-z0-9-]+\/[a-z0-9-]+\/?$/
// Search grammar verified read-only 14 Sep 2026: /tim-kiem?key=<q> → "Kết quả tìm kiếm <q> | DienmayXanh.com".
// The honest fallback when no product page for the subject was discovered (a user who names DMX
// always has a DMX path); recorded as a search — productRef dropped — so it ranks below any detail.
export const DMX_SEARCH_TEMPLATE = 'https://www.dienmayxanh.com/tim-kiem?key={q}'
const SEARCH_REF = 'search:'

export const dmxAdapter: SearchCapableAdapter = {
  providerId: 'dmx',
  entry,
  supports(request: CommerceRequest) {
    return request.domain === 'shopping' && request.intentType === 'buy_product'
  },
  searchOffer(request, now = new Date()) {
    const term = request.subject.replace(/\s+/g, ' ').trim()
    if (!term) return null
    return baseOffer(entry, request, `${SEARCH_REF}${term.slice(0, 120)}`, DMX_SEARCH_TEMPLATE.replace('{q}', q(term)), request.subject, now)
  },
  toOffer(request, hint: DiscoveryHint, now = new Date()) {
    const u = ownedUrl(entry, hint)
    if (!u || !PRODUCT_PATH.test(u.pathname)) return null
    const canonical = `https://www.dienmayxanh.com${u.pathname.replace(/\/$/, '')}`
    const subjectRef = hint.feedItem?.sku ?? u.pathname.split('/').filter(Boolean).pop()!
    const title = hint.feedDisplayEnabled && hint.feedItem ? hint.feedItem.name : (hint.title ?? request.subject)
    const offer: Offer = baseOffer(entry, request, subjectRef, canonical, title, now)
    if (hint.feedItem && hint.feedDisplayEnabled) {
      const fresh = makeFreshness(`feed:${hint.feedItem.feedFile}`, { freshnessType: 'near_realtime', ttlMs: nextFeedRegeneration(now).getTime() - now.getTime() }, { now, confidence: 0.9 })
      offer.price = { ...fresh, listPrice: hint.feedItem.price, salePrice: hint.feedItem.discount, currency: 'VND' }
      offer.availability = { ...fresh, freshnessType: 'unknown', state: 'UNKNOWN' }
    }
    return offer
  },
  buildDirectLink(offer: Offer, configuration: Configuration | undefined): DirectLinkBuild | null {
    if (configuration && configuration.kind !== 'shopping') return null
    const auth = authLimitation(offer.depthProfile, offer.merchantName)
    if (offer.subjectRef.startsWith(SEARCH_REF)) {
      return {
        url: offer.canonicalUrl,
        depth: 2,
        paramsPreserved: [],
        paramsPageOnly: ['variant', 'quantity'],
        paramsDropped: ['productRef'],
        expiresAt: null,
        grammar: 'verified',
        limitations: ['Trang tìm kiếm trên Điện Máy Xanh — bạn chọn đúng sản phẩm trên trang.', ...(auth ? [auth] : [])],
      }
    }
    const limitations: string[] = ['Chọn màu/phiên bản và số lượng trên trang sản phẩm; bấm "Mua ngay" để vào giỏ và đặt hàng.']
    if (auth) limitations.push(auth)
    return {
      url: offer.canonicalUrl,
      depth: 3, // the URL lands on the product page; L5 is one tap away and verified
      paramsPreserved: ['productRef'],
      paramsPageOnly: ['variant', 'quantity'],
      paramsDropped: [],
      expiresAt: null,
      grammar: 'verified',
      limitations,
    }
  },
}
