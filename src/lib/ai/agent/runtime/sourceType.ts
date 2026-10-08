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
/**
 * Phase 8 WS2 — the source CLASS shown to Luna, the trace and the link contract (owner taxonomy). Evidence METADATA, never a score: no
 * class wins by itself (an official page is not an automatic winner, a review is not an automatic loser). Derived deterministically from
 * the internal type above (which keeps the reliability matrix) plus what the page states about itself.
 */
export type SourceClass = 'OFFICIAL_GOVERNMENT' | 'OFFICIAL_MANUFACTURER' | 'OFFICIAL_MERCHANT' | 'OFFICIAL_HOTEL' | 'OFFICIAL_RESTAURANT' | 'BOOKING_PLATFORM' | 'PRODUCT_RETAILER' | 'MAPS_BUSINESS' | 'NEWS' | 'REVIEW' | 'SOCIAL' | 'AGGREGATOR' | 'OTHER'

const MANUFACTURERS = ['apple.com', 'samsung.com', 'sony.com', 'sony.com.vn', 'dell.com', 'hp.com', 'lenovo.com', 'asus.com', 'acer.com', 'msi.com', 'xiaomi.com', 'mi.com', 'oppo.com', 'vivo.com', 'realme.com', 'lg.com', 'panasonic.com', 'philips.com', 'bose.com', 'jbl.com', 'sennheiser.com', 'anker.com', 'logitech.com', 'microsoft.com', 'store.google.com', 'garmin.com', 'nintendo.com', 'playstation.com', 'dji.com', 'canon.com', 'nikon.com', 'fujifilm.com', 'honda.com.vn', 'yamaha-motor.com.vn', 'toyota.com.vn', 'vinfast.vn', 'daikin.com', 'electrolux.com', 'dyson.com', 'huawei.com', 'nokia.com', 'motorola.com', 'oneplus.com']
const MERCHANTS = ['thegioididong.com', 'cellphones.com.vn', 'fptshop.com.vn', 'hoanghamobile.com', 'didongviet.vn', 'phongvu.vn', 'gearvn.com', 'anphatpc.com.vn', 'nguyenkim.com', 'mediamart.vn', 'bachlongmobile.com', 'topzone.vn', 'shopdunk.com', 'clickbuy.com.vn', 'hacom.vn', 'bhx.vn', 'bachhoaxanh.com', 'winmart.vn', 'coopmart.vn']
const MARKETPLACES = ['shopee.vn', 'lazada.vn', 'tiki.vn', 'sendo.vn', 'chotot.com', 'nhattao.com', 'muaban.net', 'ebay.com', 'amazon.com', 'aliexpress.com', 'tiktok.com/shop']
const TRAVEL = ['booking.com', 'agoda.com', 'traveloka.com', 'trip.com', 'vexere.com', 'mytour.vn', 'ivivu.com', 'expedia.com', 'airbnb.com']
const NEWS = ['vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'dantri.com.vn', 'vietnamnet.vn', 'znews.vn', 'zingnews.vn', 'laodong.vn', 'nld.com.vn', 'vtv.vn', 'vov.vn', 'cafef.vn', 'cafebiz.vn', 'genk.vn', 'vnreview.vn', 'baomoi.com', 'kenh14.vn', 'tienphong.vn', 'nhandan.vn', 'theverge.com', 'reuters.com', 'bbc.com', 'cnn.com', 'nytimes.com', 'engadget.com', 'macrumors.com', '9to5mac.com', 'techradar.com']
const REFERENCE = ['wikipedia.org', 'britannica.com', 'gsmarena.com', 'notebookcheck.net', 'rtings.com', 'everymac.com', 'ifixit.com']
const SOCIAL = ['tiktok.com', 'youtube.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'foody.vn', 'tripadvisor.com', 'tripadvisor.com.vn', 'lozi.vn', 'threads.net']
/** Review sites inside SOCIAL (user reviews of a venue / product), as opposed to social networks. */
const REVIEW_SITES = ['foody.vn', 'tripadvisor.com', 'tripadvisor.com.vn', 'lozi.vn']
/** A Maps listing (Google Maps place page / short link): the business's map listing, not its own site. */
const isMapsHost = (host: string, path: string) => /^maps\.google\.[a-z.]+$/.test(host) || host === 'maps.app.goo.gl' || (host === 'goo.gl' && path.startsWith('/maps')) || (/^google\.[a-z.]+$/.test(host) && path.startsWith('/maps'))
/**
 * Government domains, generically (no per-agency list): .gov / .gov.xx / .mil, Vietnam's .gov.vn and chinhphu.vn, and the official second
 * levels other countries use (.go.jp / .go.th / .go.kr / .go.id, .gob.xx, .gouv.xx, .govt.nz, .gc.ca, .europa.eu). By the FETCHED host only.
 */
export function isGovernmentHost(host: string): boolean {
  return /(^|\.)(gov|mil)(\.[a-z]{2})?$/.test(host) || /(^|\.)(go|gob|gouv|govt)\.[a-z]{2}$/.test(host) || /(^|\.)gc\.ca$/.test(host) || host === 'chinhphu.vn' || host.endsWith('.chinhphu.vn') || host.endsWith('.europa.eu')
}
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

const BUSINESS_TYPES = /LocalBusiness|Restaurant|Hotel|Store|TouristAttraction|LodgingBusiness|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery|Resort|Hostel|Motel|DaySpa|HealthAndBeautyBusiness|MovieTheater|AmusementPark|Museum/i
const pathOf = (url: string) => { try { return new URL(url).pathname.toLowerCase() } catch { return '' } }
const matches = (host: string, list: readonly string[]) => list.some(d => !d.includes('/') && (host === d || host.endsWith(`.${d}`)))

export function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** The source type of a page (host first, then the page's own structured data). */
export function classifySource(url: string, doc?: Pick<PageDoc, 'structured' | 'canonicalUrl'> | null): { type: SourceType; basis: string } {
  const host = hostOf(url)
  if (!host) return { type: 'other', basis: 'no_host' }
  if (isGovernmentHost(host)) return { type: 'government', basis: 'government_domain' }
  if (isMapsHost(host, pathOf(url))) return { type: 'reference', basis: 'maps_listing' }
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
  // Generic signals from the page itself. A BUSINESS describing itself (restaurant, hotel, shop, attraction) is that business's own site.
  // A bare `Organization` is not: every blog, news site and tour seller declares one (measured WS2 audit: a tour-selling blog typed
  // `official` for the Hội An government ticket fee, a private legal database typed `official` for the law).
  const s = doc?.structured ?? []
  if (s.some(f => BUSINESS_TYPES.test(f.type))) return { type: 'official', basis: 'self_described_business' }
  if (s.some(f => /Product|Offer/i.test(f.type) && !!f.price)) return { type: 'merchant', basis: 'product_offer_markup' }
  return { type: 'other', basis: 'unclassified' }
}

/** Seller / platform identities (the first label of every retailer, marketplace, booking and commerce-registry host): "shopee", "tiki",
 *  "thegioididong", "cellphones", "fptshop"… Retrieval vocabulary, never a judgement. */
function sellerLabels(): Set<string> {
  const hosts = [...MERCHANTS, ...MARKETPLACES, ...TRAVEL, ...PROVIDER_REGISTRY.flatMap(e => e.allowedHosts.map(h => h.toLowerCase().replace(/^\*\./, '')))]
  return new Set(hosts.map(h => h.replace(/^www\./, '').split(/[./]/)[0]).filter(l => l.length >= 3))
}
const SELLER_LABELS = sellerLabels()
const foldName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()

/**
 * WS2: a product search query with the store / platform names taken out ("AirPods Pro 2 chính hãng Shopee Tiki" → "AirPods Pro 2 chính
 * hãng"; "… ở Thế Giới Di Động" → "…"). Where to buy is not part of WHAT the product is: a seller name read as a product word made every
 * listing an "unrelated product" for the money guard (measured WS-K1: three supported seller prices deleted). Multi-word names are
 * matched by their joined letters ("the gioi di dong" = "thegioididong"). Pure.
 */
export function stripSellerNames(query: string): string {
  const words = query.split(/\s+/).filter(Boolean)
  const key = (w: string) => foldName(w).replace(/[^a-z0-9]/g, '')
  const drop = new Set<number>()
  for (let i = 0; i < words.length; i++) {
    for (let n = 4; n >= 1; n--) {
      if (i + n > words.length) continue
      const joined = words.slice(i, i + n).map(key).join('')
      if (joined.length >= 3 && SELLER_LABELS.has(joined)) { for (let k = i; k < i + n; k++) drop.add(k); break }
    }
  }
  const out = words.filter((_, i) => !drop.has(i)).join(' ').replace(/\s+(?:ở|o|tại|tai|trên|tren|và|va|hoặc|hoac|,)\s*$/iu, '').trim()
  return out || query
}

/** The owner taxonomy class of a classified source (see SourceClass). Pure; the internal type keeps the reliability matrix. */
export function sourceClassOf(c: { type: SourceType; basis: string }, url: string, doc?: Pick<PageDoc, 'structured'> | null): SourceClass {
  const host = hostOf(url)
  switch (c.type) {
    case 'government': return 'OFFICIAL_GOVERNMENT'
    case 'official': {
      if (c.basis === 'manufacturer_site') return 'OFFICIAL_MANUFACTURER'
      const t = (doc?.structured ?? []).map(f => f.type).join(',')
      if (/Hotel|LodgingBusiness|Resort|Hostel|Motel/i.test(t)) return 'OFFICIAL_HOTEL'
      if (/Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery/i.test(t)) return 'OFFICIAL_RESTAURANT'
      return 'OFFICIAL_MERCHANT'
    }
    case 'merchant': return c.basis === 'commerce_registry' && !isShoppingHost(host) ? 'OFFICIAL_MERCHANT' : 'PRODUCT_RETAILER'
    case 'marketplace': return 'AGGREGATOR'
    case 'travel_platform': return 'BOOKING_PLATFORM'
    case 'news': return 'NEWS'
    case 'reference': return c.basis === 'maps_listing' ? 'MAPS_BUSINESS' : 'AGGREGATOR'
    case 'review_social': return matches(host, REVIEW_SITES) ? 'REVIEW' : 'SOCIAL'
    case 'forum': return 'SOCIAL'
    default: return 'OTHER'
  }
}
/** A commerce-registry merchant that sells products (retail), as opposed to a venue / ticketing merchant. */
function isShoppingHost(host: string): boolean {
  for (const e of PROVIDER_REGISTRY) {
    const owns = e.allowedHosts.some(h => { const x = h.toLowerCase().replace(/^www\./, ''); return x.startsWith('*.') ? host === x.slice(2) || host.endsWith(x.slice(1)) : host === x })
    if (owns) return (e.domains as readonly string[]).includes('shopping')
  }
  return false
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
