import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import { makeFreshness, nextFeedRegeneration } from '../domain/freshness'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'

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

export const dmxAdapter: ProviderAdapter = {
  providerId: 'dmx',
  entry,
  supports(request: CommerceRequest) {
    return request.domain === 'shopping' && request.intentType === 'buy_product'
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
    const limitations: string[] = ['Chọn màu/phiên bản và số lượng trên trang sản phẩm; bấm "Mua ngay" để vào giỏ và đặt hàng.']
    const auth = authLimitation(offer.depthProfile, offer.merchantName)
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
