import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { authLimitation, baseOffer, ownedUrl } from './shared'

// ── Klook — Entertainment (attractions) AND Spa · verified L4 guest ──────────
// ONE adapter, two intents (owner decision: reuse the common Klook checkout
// architecture). Activity page:
//   https://www.klook.com/vi/activity/<id>-<slug>/
// Package, date and quantity are chosen on the page (no URL parameters exist
// for them in the observed UI); "Đặt ngay" opens "Đăng nhập hoặc Đăng ký".
// Spa listings are the same activity template ("Spa • Thành phố Hồ Chí Minh")
// with open-dated vouchers ("Mua trước, đặt lịch sau", valid 14 days).

const entry = getProvider('klook')!
const ACTIVITY_PATH = /^\/(?:vi|en-US|en)\/activity\/(\d{1,10})(?:-([a-z0-9-]+))?\/?$/

export const klookAdapter: ProviderAdapter = {
  providerId: 'klook',
  entry,
  supports(request: CommerceRequest) {
    return (
      (request.domain === 'entertainment' && request.intentType === 'book_activity') ||
      (request.domain === 'spa' && request.intentType === 'buy_spa_voucher')
    )
  },
  toOffer(request, hint: DiscoveryHint, now = new Date()) {
    let id = hint.subjectRef ?? null
    let slug: string | null = null
    const u = ownedUrl(entry, hint)
    if (u) {
      const m = u.pathname.match(ACTIVITY_PATH)
      if (m) { id = id ?? m[1]; slug = m[2] ?? null }
    }
    if (!id || !/^\d{1,10}$/.test(id)) return null
    const canonical = `https://www.klook.com/vi/activity/${id}${slug ? `-${slug}` : ''}/`
    return baseOffer(entry, request, id, canonical, hint.title ?? request.subject, now)
  },
  buildDirectLink(offer: Offer, configuration: Configuration | undefined): DirectLinkBuild | null {
    const auth = authLimitation(offer.depthProfile, offer.merchantName)
    const spa = configuration?.kind === 'spa' || offer.domain === 'spa'
    const pageOnly = spa ? ['packageRef', 'quantity', 'preferredDate', 'preferredTime'] : ['packageRef', 'date', 'quantity']
    return {
      url: offer.canonicalUrl,
      depth: 3,
      paramsPreserved: ['activityRef'],
      paramsPageOnly: pageOnly,
      paramsDropped: [],
      expiresAt: null,
      grammar: 'verified',
      limitations: [
        spa
          ? 'Chọn gói dịch vụ và số lượng trên trang; voucher mở, đặt lịch với spa sau khi mua (hiệu lực 14 ngày).'
          : 'Chọn gói, ngày và số lượng trên trang hoạt động.',
        ...(auth ? [auth] : []),
      ],
    }
  },
}
