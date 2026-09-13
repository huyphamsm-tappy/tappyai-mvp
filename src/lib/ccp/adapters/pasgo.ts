import type { CommerceRequest, Configuration, Offer } from '../domain/types'
import { getProvider } from '../registry'
import { isoToDmySlash, q } from '../validation/url'
import type { DirectLinkBuild, DiscoveryHint, ProviderAdapter } from './types'
import { baseOffer, ownedUrl } from './shared'

// ── PasGo — Food & Drink (dine-in reservation) · verified L5 guest ───────────
// Restaurant page: https://pasgo.vn/nha-hang/<slug>-<id>
// Reservation form (verified 13 Sep 2026):
//   https://pasgo.vn/dat-cho-ngay/<id>?sfAdult=<n>&sfChild=<n>&sfDateFrom=DD/MM/YYYY&sfTimeFrom=HH:MM
// The page pre-fills the booking summary and asks only for contact name,
// phone, e-mail and a note; the hold lasts 5 minutes ("Nhập thông tin chính
// xác trong 04:34"). No login. Unavailable time slots are rejected on the
// page, which is why availability is realtime-at-click, not held by CCP.

const entry = getProvider('pasgo')!
const RESTAURANT_PATH = /^\/nha-hang\/([a-z0-9-]+)-(\d{1,10})\/?$/
const RESERVATION_HOLD_MS = 5 * 60_000

export const pasgoAdapter: ProviderAdapter = {
  providerId: 'pasgo',
  entry,
  supports(request: CommerceRequest) {
    return request.domain === 'food_drink' && request.intentType === 'reserve_table'
  },
  toOffer(request, hint: DiscoveryHint, now = new Date()) {
    let id = hint.subjectRef ?? null
    let slug: string | null = null
    const u = ownedUrl(entry, hint)
    if (u) {
      const m = u.pathname.match(RESTAURANT_PATH)
      if (m) { slug = m[1]; id = id ?? m[2] }
    }
    if (!id || !/^\d{1,10}$/.test(id)) return null
    const canonical = slug ? `https://pasgo.vn/nha-hang/${slug}-${id}` : `https://pasgo.vn/dat-cho-ngay/${id}`
    return baseOffer(entry, request, id, canonical, hint.title ?? request.subject, now)
  },
  buildDirectLink(offer: Offer, configuration: Configuration | undefined, now = new Date()): DirectLinkBuild | null {
    if (!configuration || configuration.kind !== 'reservation') {
      return {
        url: offer.canonicalUrl,
        depth: 3,
        paramsPreserved: ['restaurantRef'],
        paramsPageOnly: ['date', 'time', 'adults', 'children'],
        paramsDropped: [],
        expiresAt: null,
        grammar: 'verified',
        limitations: ['Chọn số khách, ngày và giờ trên trang nhà hàng rồi bấm "Đặt chỗ ngay".'],
      }
    }
    const params = new URLSearchParams()
    params.set('sfAdult', String(configuration.adults))
    params.set('sfChild', String(configuration.children ?? 0))
    params.set('sfDateFrom', isoToDmySlash(configuration.date))
    params.set('sfTimeFrom', configuration.time)
    return {
      url: `https://pasgo.vn/dat-cho-ngay/${q(offer.subjectRef)}?${params.toString()}`,
      depth: 5,
      paramsPreserved: ['restaurantRef', 'adults', 'children', 'date', 'time'],
      paramsPageOnly: [],
      paramsDropped: [],
      expiresAt: new Date(now.getTime() + RESERVATION_HOLD_MS).toISOString(),
      grammar: 'verified',
      limitations: ['Form giữ chỗ 5 phút; chỉ cần tên, số điện thoại và email. Khung giờ không phục vụ sẽ được báo ngay trên trang.'],
    }
  },
}
