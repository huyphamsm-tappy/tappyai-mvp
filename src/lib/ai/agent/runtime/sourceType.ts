// ── Phase 8 M3 — what kind of source a page is, and how far to trust it FOR WHICH KIND OF CLAIM ───────────────────────────────
//
// Not one universal ranking: reliability is a function of (source type × claim kind). A manufacturer is authoritative for its own
// specifications and warranty, not for how a used unit was treated; a marketplace listing is evidence of what the SELLER says (price,
// stock), not of the item's real condition; a review / social post is good social proof, weak specification. Luna sees the type, the
// level and why, and reasons with it — the level never decides an answer by itself.
//
// Classification is deterministic and conservative: a short list of well-known hosts per type (Vietnam-first), generic signals
// (government TLDs, a page whose JSON-LD Organization is its own host, a Product with an Offer), else `other`. Unknown hosts are readable
// — this is a hint for evidence weighting, not an allow-list.

import type { PageDoc } from './pageExtract'
import { PROVIDER_REGISTRY } from '@/lib/ccp'

export type SourceType = 'official' | 'government' | 'merchant' | 'marketplace' | 'travel_platform' | 'news' | 'reference' | 'review_social' | 'forum' | 'other'
export type ClaimKind = 'spec' | 'price' | 'availability' | 'hours' | 'policy' | 'condition' | 'experience' | 'location' | 'other'
export type Reliability = 'high' | 'medium' | 'low'

const MANUFACTURERS = ['apple.com', 'samsung.com', 'sony.com', 'sony.com.vn', 'dell.com', 'hp.com', 'lenovo.com', 'asus.com', 'acer.com', 'msi.com', 'xiaomi.com', 'mi.com', 'oppo.com', 'vivo.com', 'realme.com', 'lg.com', 'panasonic.com', 'philips.com', 'bose.com', 'jbl.com', 'sennheiser.com', 'anker.com', 'logitech.com', 'microsoft.com', 'store.google.com', 'garmin.com', 'nintendo.com', 'playstation.com', 'dji.com', 'canon.com', 'nikon.com', 'fujifilm.com', 'honda.com.vn', 'yamaha-motor.com.vn', 'toyota.com.vn', 'vinfast.vn', 'daikin.com', 'electrolux.com', 'dyson.com', 'huawei.com', 'nokia.com', 'motorola.com', 'oneplus.com']
const MERCHANTS = ['thegioididong.com', 'cellphones.com.vn', 'fptshop.com.vn', 'hoanghamobile.com', 'didongviet.vn', 'phongvu.vn', 'gearvn.com', 'anphatpc.com.vn', 'nguyenkim.com', 'mediamart.vn', 'bachlongmobile.com', 'topzone.vn', 'shopdunk.com', 'clickbuy.com.vn', 'hacom.vn', 'bhx.vn', 'bachhoaxanh.com', 'winmart.vn', 'coopmart.vn']
const MARKETPLACES = ['shopee.vn', 'lazada.vn', 'tiki.vn', 'sendo.vn', 'chotot.com', 'nhattao.com', 'muaban.net', 'ebay.com', 'amazon.com', 'aliexpress.com', 'tiktok.com/shop']
const TRAVEL = ['booking.com', 'agoda.com', 'traveloka.com', 'trip.com', 'vexere.com', 'mytour.vn', 'ivivu.com', 'expedia.com', 'airbnb.com']
const NEWS = ['vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'dantri.com.vn', 'vietnamnet.vn', 'znews.vn', 'zingnews.vn', 'laodong.vn', 'nld.com.vn', 'vtv.vn', 'vov.vn', 'cafef.vn', 'cafebiz.vn', 'genk.vn', 'vnreview.vn', 'baomoi.com', 'kenh14.vn', 'tienphong.vn', 'nhandan.vn', 'theverge.com', 'reuters.com', 'bbc.com', 'cnn.com', 'nytimes.com', 'engadget.com', 'macrumors.com', '9to5mac.com', 'techradar.com']
const REFERENCE = ['wikipedia.org', 'britannica.com', 'gsmarena.com', 'notebookcheck.net', 'rtings.com', 'everymac.com', 'ifixit.com']
const SOCIAL = ['tiktok.com', 'youtube.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'foody.vn', 'tripadvisor.com', 'tripadvisor.com.vn', 'lozi.vn', 'threads.net']
const FORUMS = ['voz.vn', 'reddit.com', 'tinhte.vn', 'webtretho.com', 'otofun.net', 'quora.com', 'discussions.apple.com', 'stackexchange.com']

/**
 * Commerce merchants / platforms known to the Commerce Capability Platform: their hosts live in the CCP registry (architecture rule:
 * merchant hosts are spelled only inside src/lib/ccp). Travel-domain providers are booking platforms; the marketplace providers below
 * are named by provider id, never by host.
 */
const MARKETPLACE_PROVIDERS = new Set(['shopee', 'lazada', 'tiktokshop', 'tiki', 'sendo'])
function ccpSourceType(host: string): SourceType | null {
  for (const e of PROVIDER_REGISTRY) {
    const owns = e.allowedHosts.some(h => { const x = h.toLowerCase().replace(/^www\./, ''); return x.startsWith('*.') ? host === x.slice(2) || host.endsWith(x.slice(1)) : host === x })
    if (!owns) continue
    if (MARKETPLACE_PROVIDERS.has(e.providerId)) return 'marketplace'
    return (e.domains as readonly string[]).includes('travel') ? 'travel_platform' : 'merchant'
  }
  return null
}

const matches = (host: string, list: readonly string[]) => list.some(d => !d.includes('/') && (host === d || host.endsWith(`.${d}`)))

export function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** The source type of a page (host first, then the page's own structured data). */
export function classifySource(url: string, doc?: Pick<PageDoc, 'structured' | 'canonicalUrl'> | null): { type: SourceType; basis: string } {
  const host = hostOf(url)
  if (!host) return { type: 'other', basis: 'no_host' }
  if (/(^|\.)gov(\.[a-z]{2})?$/.test(host) || host.endsWith('.gov.vn') || host === 'chinhphu.vn' || host.endsWith('.chinhphu.vn') || host.endsWith('.europa.eu') || /(^|\.)mil(\.[a-z]{2})?$/.test(host)) return { type: 'government', basis: 'government_domain' }
  if (matches(host, MANUFACTURERS)) return { type: 'official', basis: 'manufacturer_site' }
  // An exact social host (a TikTok / YouTube / Facebook page) is social proof even when the commerce registry also knows that platform's shop.
  if (SOCIAL.includes(host)) return { type: 'review_social', basis: 'social_or_review_host' }
  const ccp = ccpSourceType(host)
  if (ccp) return { type: ccp, basis: 'commerce_registry' }
  if (matches(host, MARKETPLACES)) return { type: 'marketplace', basis: 'marketplace_host' }
  if (matches(host, MERCHANTS)) return { type: 'merchant', basis: 'retailer_host' }
  if (matches(host, TRAVEL)) return { type: 'travel_platform', basis: 'travel_platform_host' }
  if (matches(host, FORUMS)) return { type: 'forum', basis: 'forum_host' }
  if (matches(host, SOCIAL)) return { type: 'review_social', basis: 'social_or_review_host' }
  if (matches(host, NEWS)) return { type: 'news', basis: 'news_host' }
  if (matches(host, REFERENCE)) return { type: 'reference', basis: 'reference_host' }
  // Generic signals from the page itself.
  const s = doc?.structured ?? []
  if (s.some(f => /Organization|LocalBusiness|Restaurant|Hotel|Store|TouristAttraction|LodgingBusiness|FoodEstablishment/i.test(f.type))) return { type: 'official', basis: 'self_described_organization' }
  if (s.some(f => /Product|Offer/i.test(f.type) && !!f.price)) return { type: 'merchant', basis: 'product_offer_markup' }
  return { type: 'other', basis: 'unclassified' }
}

/** How far a source type can be trusted for a claim kind. A matrix, so a type is strong where it is the authority and weak elsewhere. */
const MATRIX: Record<SourceType, Partial<Record<ClaimKind, Reliability>> & { default: Reliability }> = {
  official: { spec: 'high', price: 'high', availability: 'high', hours: 'high', policy: 'high', location: 'high', condition: 'low', experience: 'low', default: 'medium' },
  government: { policy: 'high', price: 'high', hours: 'high', location: 'high', other: 'high', spec: 'medium', experience: 'low', condition: 'low', default: 'high' },
  merchant: { price: 'high', availability: 'high', spec: 'medium', policy: 'medium', hours: 'medium', location: 'medium', condition: 'medium', experience: 'low', default: 'medium' },
  marketplace: { price: 'medium', availability: 'medium', spec: 'low', condition: 'low', policy: 'low', experience: 'low', default: 'low' },
  travel_platform: { price: 'medium', availability: 'medium', location: 'high', hours: 'medium', experience: 'medium', spec: 'low', default: 'medium' },
  news: { policy: 'medium', price: 'medium', spec: 'medium', hours: 'medium', experience: 'medium', other: 'medium', condition: 'low', default: 'medium' },
  reference: { spec: 'medium', location: 'medium', other: 'medium', price: 'low', availability: 'low', experience: 'medium', default: 'medium' },
  review_social: { experience: 'medium', spec: 'low', price: 'low', availability: 'low', policy: 'low', condition: 'low', default: 'low' },
  forum: { experience: 'medium', spec: 'low', price: 'low', policy: 'low', condition: 'low', default: 'low' },
  other: { experience: 'low', spec: 'low', policy: 'low', condition: 'low', price: 'low', default: 'medium' },
}

export function reliabilityFor(type: SourceType, kind: ClaimKind): Reliability {
  const row = MATRIX[type] ?? MATRIX.other
  return row[kind] ?? row.default
}

/** One line for the model: what this source is authoritative for, and what not. */
export function reliabilityNote(type: SourceType, lang: string): string {
  const vi: Record<SourceType, string> = {
    official: 'trang chính thức: đáng tin cho thông số, giá niêm yết, giờ mở cửa, chính sách của chính họ; không nói về một món đồ cũ cụ thể',
    government: 'trang nhà nước: đáng tin cho quy định, thủ tục, lệ phí',
    merchant: 'cửa hàng: đáng tin cho giá / còn hàng của chính cửa hàng; thông số chỉ tham khảo',
    marketplace: 'sàn / tin rao: là lời người bán — giá rao, còn hàng; tình trạng máy, thông số chưa kiểm chứng',
    travel_platform: 'nền tảng đặt chỗ: giá / phòng trống tham khảo theo thời điểm, vị trí đáng tin',
    news: 'báo / tin tức: tham khảo chung, kiểm tra ngày đăng',
    reference: 'trang tra cứu: tham khảo thông số / kiến thức chung',
    review_social: 'đánh giá / mạng xã hội: trải nghiệm người dùng, không phải thông số chính thức',
    forum: 'diễn đàn: kinh nghiệm cá nhân, không phải nguồn chính thức',
    other: 'nguồn chưa phân loại: đối chiếu thêm khi quan trọng',
  }
  const en: Record<SourceType, string> = {
    official: 'official site: authoritative for its own specs, list prices, hours, policies; says nothing about a specific used unit',
    government: 'government site: authoritative for regulations, procedures, fees',
    merchant: "retailer: reliable for its own price / stock; specs indicative",
    marketplace: "marketplace / listing: the seller's word — asking price, stock; condition and specs unverified",
    travel_platform: 'booking platform: prices / availability indicative at that moment; location reliable',
    news: 'news: general reference, check the date',
    reference: 'reference site: specs / general knowledge reference',
    review_social: 'review / social: user experience, not official specs',
    forum: 'forum: personal experience, not an official source',
    other: 'unclassified source: cross-check when it matters',
  }
  return (lang === 'en' ? en : vi)[type]
}
