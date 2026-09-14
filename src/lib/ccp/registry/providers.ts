import type { ProviderRegistryEntry } from './types'
import type { RightsFlags } from '../domain/types'

// ── Verified provider facts (13 Sep 2026) ────────────────────────────────────
// Every depth profile below is a transcription of the Transaction Depth Audit
// (claude.ai/code/artifact/5ce17dc6-1d40-454c-927e-fe3cf9291f7c) and the
// Commerce Capability Specification v0.1. Do not "improve" a number here
// without a new dated verification.

const AUDIT = 'https://claude.ai/code/artifact/5ce17dc6-1d40-454c-927e-fe3cf9291f7c'
const VERIFIED = '2026-09-13'
// Marketplace expansion (owner decision 14 Sep 2026): Shopee and TikTok Shop verified read-only in a
// browser on 14 Sep 2026 — evidence recorded in the Shopping Marketplace Expansion report.
const MARKETPLACE_VERIFIED = '2026-09-14'
// Evidence page: the Shopping Marketplace Expansion record (§ Marketplace) on the CCP progress page.
const MARKETPLACE_EVIDENCE = 'https://claude.ai/code/artifact/7a297ff7-7f09-46e3-a537-544325f066b1#marketplace'
// Provider Integration Completion Pass (owner directive 14 Sep 2026): the provider list is FROZEN
// (17 merchants) and every direct / search / detail path TappyAI can build on its own is built now,
// with affiliate approval affecting monetisation only. Read-only grammar checks of 14 Sep 2026 are
// recorded on the Completion Pass record of the CCP progress page.
const COMPLETION_VERIFIED = '2026-09-14'
const COMPLETION_EVIDENCE = 'https://claude.ai/code/artifact/7a297ff7-7f09-46e3-a537-544325f066b1#completion'

// Owner decision D7: no ACCESSTRADE feed field is displayed until the written
// data-rights confirmation arrives. Rights are therefore OFF for every feed
// merchant; link-only operation is the MVP behaviour. Flip in ONE place when
// the confirmation is on file.
const FEED_RIGHTS_WCR: RightsFlags = { displayOk: false, priceOk: false, imageOk: false, comparisonOk: true, couponOk: false }
// Merchants whose pages the user opens directly: nothing of theirs is stored or
// displayed by TappyAI beyond the identity the user asked for.
const LINK_ONLY_RIGHTS: RightsFlags = { displayOk: true, priceOk: false, imageOk: false, comparisonOk: true, couponOk: false }

const DAY = 86_400_000

export const PROVIDER_REGISTRY: readonly ProviderRegistryEntry[] = [
  {
    providerId: 'dmx',
    merchantId: 'dienmayxanh',
    merchantName: 'Điện Máy Xanh',
    domains: ['shopping'],
    intents: ['buy_product'],
    allowedHosts: ['www.dienmayxanh.com', 'dienmayxanh.com'],
    capabilities: ['search', 'details', 'pricing', 'configure', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    // Verified: product page → "Mua ngay" → /cart without login (L5 guest). Discovery/detail via feed or search hit.
    commerce: ['product_discovery', 'product_detail', 'product_purchase', 'commerce_handoff'],
    depth: {
      buy_product: {
        guestDepth: 5,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'at_order',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: '/cart là trang thanh toán đầy đủ (giao/nhận, địa chỉ, COD/chuyển khoản); OTP SMS chỉ khi bấm "Đặt hàng".',
      },
    },
    linkStrategy: { buy_product: ['tracked', 'detail'] },
    freshness: {
      identity: { freshnessType: 'near_realtime', ttlMs: DAY, note: 'daily CSV feed, regenerated ~00:08 UTC' },
      price: { freshnessType: 'near_realtime', ttlMs: DAY, note: 'feed price; content changes day to day' },
      availability: { freshnessType: 'unknown', ttlMs: null, note: 'feed carries no stock; merchant page is the check' },
    },
    rights: FEED_RIGHTS_WCR,
    tracking: { network: 'accesstrade', campaignId: '5751981382510607935', approval: 'pending', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_ADAPTER_DMX',
    tier: 'mvp',
    segment: 'retail',
    notes: ['Affiliate approval only affects tracking, not depth.', 'Variant and quantity are page-only.'],
    discovery: { site: 'dienmayxanh.com', subjectKind: 'product' },
  },

  // ── Shopping marketplaces (owner decision 14 Sep 2026: Shopee + TikTok Shop mandatory) ──
  {
    providerId: 'shopee',
    merchantId: 'shopee',
    merchantName: 'Shopee',
    domains: ['shopping'],
    intents: ['buy_product'],
    allowedHosts: ['shopee.vn', 'www.shopee.vn'],
    capabilities: ['search', 'details', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    // NOT ShopeeFood: this is the marketplace (shopee.vn); food delivery is the separate
    // 'shopeefood' entry (shopeefood.vn) and the two never share a capability.
    commerce: ['product_discovery', 'product_detail', 'product_purchase', 'commerce_handoff'],
    depth: {
      buy_product: {
        // Verified 14 Sep 2026 in an UNAUTHENTICATED browser: shopee.vn/search?keyword=… AND the
        // product page …-i.<shopId>.<itemId> both show "Login Required" to a guest on the web.
        // The URL carries the product identity; a guest sees the login wall before the detail.
        // Authenticated view (owner session, read-only): variants, quantity, Add to Cart, Buy Now.
        guestDepth: 2,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_selection',
        verifiedOn: MARKETPLACE_VERIFIED,
        evidence: MARKETPLACE_EVIDENCE,
        reason: 'Web Shopee VN hiện "Login Required" cho khách chưa đăng nhập ở cả trang tìm kiếm lẫn trang sản phẩm; sau đăng nhập có chọn phân loại, số lượng, Mua ngay.',
      },
    },
    linkStrategy: { buy_product: ['tracked', 'detail', 'search'] },
    freshness: {
      identity: { freshnessType: 'static', ttlMs: null, note: 'product URL is stable; listing may be sold out (page-only)' },
      price: { freshnessType: 'unknown', ttlMs: null, note: 'price read on the merchant page; no feed display (D7)' },
      availability: { freshnessType: 'unknown', ttlMs: null, note: 'sold-out state is behind the login wall; not verified server-side' },
    },
    rights: FEED_RIGHTS_WCR,
    tracking: { network: 'accesstrade', campaignId: '4751584435713464237', approval: 'pending', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_ADAPTER_SHOPEE',
    tier: 'mvp',
    segment: 'marketplace',
    notes: ['Shopee marketplace ≠ ShopeeFood.', 'Product grammar: /<slug>-i.<shopId>.<itemId>; search grammar: /search?keyword=<q> (login-walled for web guests).', 'Affiliate (Shopee Smartlink) pending → direct links.'],
    discovery: { site: 'shopee.vn', subjectKind: 'product' },
  },
  {
    providerId: 'tiktokshop',
    merchantId: 'tiktokshop',
    merchantName: 'TikTok Shop',
    domains: ['shopping'],
    intents: ['buy_product'],
    // Product pages live on both hosts; the adapter accepts only product/keyword paths, never a
    // video or profile URL, so the TikTok video host being listed here grants nothing else.
    allowedHosts: ['shop.tiktok.com', 'www.tiktok.com'],
    capabilities: ['search', 'details', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    commerce: ['product_discovery', 'product_detail', 'product_purchase', 'commerce_handoff'],
    depth: {
      buy_product: {
        // Verified 14 Sep 2026: shop.tiktok.com/vn/pdp/<slug>/<id> renders the product (title,
        // seller, price, colour variants, quantity, "Buy now") in an authenticated browser; the
        // guest browser profile met TikTok's CAPTCHA, so the guest view is index-verified only
        // (the page is public and indexed with its og data). TikTok Shop web checkout needs a
        // TikTok account — guest depth is the detail page.
        guestDepth: 3,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_checkout',
        verifiedOn: MARKETPLACE_VERIFIED,
        evidence: MARKETPLACE_EVIDENCE,
        reason: 'Trang sản phẩm TikTok Shop VN hiện phân loại, số lượng và "Buy now"; thanh toán cần tài khoản TikTok. Khách chưa đăng nhập: chưa xác minh được trên trình duyệt (CAPTCHA), chỉ xác minh qua chỉ mục tìm kiếm.',
      },
    },
    linkStrategy: { buy_product: ['tracked', 'detail'] },
    freshness: {
      identity: { freshnessType: 'static', ttlMs: null, note: 'product id is stable; listing may end (page-only)' },
      price: { freshnessType: 'unknown', ttlMs: null, note: 'price read on the merchant page; feed display off (D7)' },
    },
    rights: FEED_RIGHTS_WCR,
    // ACCESSTRADE TikTok Shop CPS is APPROVED (11 Sep 2026). Affiliate = monetisation layer only:
    // the provider works on direct links; the wrapper is applied by the existing tracking module.
    tracking: { network: 'accesstrade', campaignId: '6648523843406889655', approval: 'approved', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_ADAPTER_TIKTOKSHOP',
    tier: 'mvp',
    segment: 'marketplace',
    notes: ['Product grammar: shop.tiktok.com/vn/pdp/<slug>/<id> · www.tiktok.com/shop/vn/pdp/<id> · www.tiktok.com/view/product/<id>.', 'Keyword pages shop.tiktok.com/vn/k/<slug> are real listing pages but only when discovered — never composed (an arbitrary slug 404s; /shop/s/<q> is an empty app shell).', 'No feed data used (data rights pending).'],
    discovery: { site: 'shop.tiktok.com/vn', subjectKind: 'product' },
  },
  {
    providerId: 'lazada',
    merchantId: 'lazada',
    merchantName: 'Lazada',
    domains: ['shopping'],
    intents: ['buy_product'],
    allowedHosts: ['www.lazada.vn', 'lazada.vn'],
    capabilities: ['search', 'details', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    commerce: ['product_discovery', 'product_detail', 'product_purchase', 'commerce_handoff'],
    depth: {
      buy_product: {
        // Verified 14 Sep 2026: /products/<slug>-i<id>.html renders to a guest (title, variants)
        // behind a bot-check overlay in the automation profile; checkout needs a Lazada account.
        guestDepth: 3,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_checkout',
        verifiedOn: MARKETPLACE_VERIFIED,
        evidence: MARKETPLACE_EVIDENCE,
        reason: 'Trang sản phẩm Lazada hiện cho khách; thanh toán cần đăng nhập.',
      },
    },
    linkStrategy: { buy_product: ['tracked', 'detail', 'search'] },
    freshness: {
      identity: { freshnessType: 'static', ttlMs: null, note: 'product URL is stable' },
      price: { freshnessType: 'unknown', ttlMs: null, note: 'price read on the merchant page' },
    },
    rights: FEED_RIGHTS_WCR,
    tracking: { network: 'accesstrade', campaignId: '5087153089503673507', approval: 'pending', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_ADAPTER_LAZADA',
    tier: 'mvp',
    segment: 'marketplace',
    notes: ['Desired, subject to integration conditions (affiliate pending → direct links).', 'Product grammar: /products/<slug>-i<id>.html; search grammar: /catalog/?q=<q>.'],
    discovery: { site: 'lazada.vn/products', subjectKind: 'product' },
  },
  {
    providerId: 'tripcom',
    merchantId: 'tripcom',
    merchantName: 'Trip.com',
    domains: ['travel'],
    intents: ['book_hotel', 'book_flight'],
    allowedHosts: ['vn.trip.com', 'www.trip.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    // Verified: hotel detail with stay → room "Đặt" → guest form (L5 guest).
    // Flights (Completion Pass): the dated fare search is a first-class capability at its verified
    // boundary — results (L2); select → passenger form was never executed (audit 13 Sep), so
    // nothing deeper is claimed.
    commerce: ['hotel_discovery', 'hotel_detail', 'hotel_booking', 'flight_booking', 'commerce_handoff'],
    depth: {
      book_hotel: {
        guestDepth: 5,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Trang khách sạn → "Đặt" → form khách (tên/email/SĐT) → thanh toán, không cần đăng nhập.',
      },
      book_flight: {
        // Verified 14 Sep 2026 (read-only browser): /flights/showfarefirst?dcity=sgn&acity=han&ddate=…
        // (+ rdate/flighttype=rt, quantity) lands on the dated fare list with route, date and
        // passenger count applied (the site rewrites it to /m/flights/<o>-to-<d>/…). The audit of
        // 13 Sep recorded the same page as L2 tracked; select → passenger form was not executed.
        guestDepth: 2,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Trang kết quả chuyến bay theo ngày (L2) mở đúng chặng, ngày, số khách; bước chọn chuyến → form hành khách chưa được thực thi trong kiểm tra.',
      },
    },
    linkStrategy: { book_hotel: ['tracked', 'direct', 'detail'], book_flight: ['tracked', 'configured_search'] },
    freshness: {
      identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'hotelId/cityId are stable identifiers' },
      price: { freshnessType: 'realtime', ttlMs: 0, note: 'rates are read on the merchant page at click; CCP holds none' },
      availability: { freshnessType: 'realtime', ttlMs: 0, note: 'room availability on page at click' },
    },
    rights: LINK_ONLY_RIGHTS,
    tracking: {
      network: 'accesstrade',
      campaignId: '6455552313033835511',
      approval: 'approved',
      safeWrapper: 'deep_link',
      // Verified 13 Sep 2026: the Product Link tool replaces any Trip.com URL
      // with the preset vn.trip.com/?locale=vi-vn — it destroys the deep link.
      unsafeWrappers: ['product_link'],
    },
    enabledFlag: 'CCP_ADAPTER_TRIPCOM',
    tier: 'mvp',
    notes: ['Deep Link tool / API only (owner decision D4).', 'Flights: dated search grammar verified 14 Sep 2026; the fare list is the handoff (L2); no booking URL is composed.'],
    discovery: { site: 'vn.trip.com/hotels', subjectKind: 'hotel' },
  },
  // PasGo (table_reservation) was REMOVED from active scope by owner decision on 14 Sep 2026: the
  // reservation flow was too complex and operationally unreliable for the current product stage.
  // table_reservation stays in the capability vocabulary as NOT_REQUIRED / FUTURE; no provider
  // declares it, so no request can select one. Historical evidence: Transaction Depth Audit,
  // Phase 8 Remediation report.
  {
    providerId: 'cgv',
    merchantId: 'cgv',
    merchantName: 'CGV',
    domains: ['entertainment'],
    intents: ['buy_ticket'],
    allowedHosts: ['www.cgv.vn', 'cgv.vn'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary'],
    // Completion Pass: film DETAIL is what the public flow supports (film page → "Mua vé" picker);
    // showtime_discovery is declared by nobody — CGV's showtime picker has no public source.
    commerce: ['film_discovery', 'film_detail', 'cinema_ticket', 'commerce_handoff'],
    depth: {
      buy_ticket: {
        guestDepth: 4,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_selection',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Chọn suất chiếu → CGV chuyển sang trang đăng nhập (email/SĐT + mật khẩu + CAPTCHA) trước sơ đồ ghế.',
      },
    },
    linkStrategy: { buy_ticket: ['configured_search', 'detail'] },
    freshness: {
      identity: { freshnessType: 'near_realtime', ttlMs: DAY, note: 'film slugs; showtimes read on page at click' },
      availability: { freshnessType: 'realtime', ttlMs: 0, note: 'showtimes and seats live on the merchant page' },
    },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_ADAPTER_CGV',
    tier: 'mvp',
    notes: [
      'Session URL grammar (site/<code>/seq/<session>/dy/<yyyymmdd>) was observed once as a login referer — generated only when the caller already holds a session id; never fabricated.',
      'Film pages (/default/<film-slug>.html) are discovered by film title when the user names one; a cinema VENUE row never becomes a film link.',
    ],
    discovery: { site: 'cgv.vn/default', subjectKind: 'film' },
  },
  {
    providerId: 'klook',
    merchantId: 'klook',
    merchantName: 'Klook',
    domains: ['entertainment', 'spa'],
    intents: ['book_activity', 'buy_spa_voucher'],
    allowedHosts: ['www.klook.com', 'klook.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    commerce: ['activity_booking', 'spa_voucher', 'commerce_handoff'],
    depth: {
      book_activity: {
        guestDepth: 4,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_checkout',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Gói + ngày + số lượng chọn trên trang; "Đặt ngay" mở "Đăng nhập hoặc Đăng ký".',
      },
      buy_spa_voucher: {
        guestDepth: 4,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_checkout',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Cùng kiến trúc checkout với hoạt động; voucher mở (14 ngày), đặt lịch với spa sau khi mua.',
      },
    },
    linkStrategy: { book_activity: ['tracked', 'detail'], buy_spa_voucher: ['tracked', 'detail'] },
    freshness: {
      identity: { freshnessType: 'near_realtime', ttlMs: 7 * DAY, note: 'activity ids are stable; packages/prices on page' },
      price: { freshnessType: 'near_realtime', ttlMs: 0, note: 'package prices are read on the merchant page' },
    },
    rights: LINK_ONLY_RIGHTS,
    tracking: { network: 'accesstrade', campaignId: '4704521809526929067', approval: 'approved', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_ADAPTER_KLOOK',
    tier: 'mvp',
    notes: ['One adapter serves Entertainment (attractions) and Spa (Spa category).', 'Package, date and quantity are page-only.'],
    discovery: { site: 'klook.com/vi/activity', subjectKind: 'activity' },
  },

  // ── Handoff-only entries (owner decision D10) ─────────────────────────────
  {
    providerId: 'cellphones',
    merchantId: 'cellphones',
    merchantName: 'CellphoneS',
    domains: ['shopping'],
    intents: ['buy_product'],
    allowedHosts: ['cellphones.com.vn', 'www.cellphones.com.vn'],
    capabilities: ['transactionBoundary', 'tracking'],
    commerce: ['product_discovery', 'product_detail', 'product_purchase', 'commerce_handoff'],
    depth: {
      buy_product: {
        guestDepth: 4,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_checkout',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: '"Mua ngay" và "Thêm vào giỏ" đều mở modal Smember; không có guest checkout (xác minh 2 lần).',
      },
    },
    linkStrategy: { buy_product: ['tracked', 'handoff'] },
    freshness: { identity: { freshnessType: 'near_realtime', ttlMs: DAY, note: 'daily CSV feed' } },
    rights: FEED_RIGHTS_WCR,
    tracking: { network: 'accesstrade', campaignId: '6259155740535091857', approval: 'approved', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_HANDOFF_ONLY',
    tier: 'handoff_only',
    segment: 'retail',
    notes: ['Not an MVP adapter (D10); active retailer via passthrough handoff (14 Sep 2026): a discovered product page is emitted at the verified depth.'],
    handoffPassthrough: true,
    discovery: { site: 'cellphones.com.vn', subjectKind: 'product' },
  },
  {
    providerId: 'vexere',
    merchantId: 'vexere',
    merchantName: 'Vexere',
    domains: ['travel'],
    intents: ['book_transport'],
    allowedHosts: ['vexere.com', 'www.vexere.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    commerce: ['transport_booking', 'commerce_handoff'],
    depth: {
      book_transport: {
        // Audit 13 Sep 2026: route page + ?date= → trip → seat map → pick-up/drop-off (L4, no login);
        // the passenger form was not executed. Re-checked 14 Sep 2026 (read-only): the route page
        // with ?date=DD-MM-YYYY returns 200 with the date applied; the legacy
        // /ket-qua-tim-kiem-ve-xe-khach?fromLocationName= grammar returns 404 and is retired.
        guestDepth: 4,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Trang tuyến + ngày → chọn chuyến → sơ đồ ghế → điểm đón/trả không cần đăng nhập; bước thông tin hành khách chưa thực thi trong kiểm tra.',
      },
    },
    linkStrategy: { book_transport: ['tracked', 'direct', 'search'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'route slugs + ids' }, availability: { freshnessType: 'realtime', ttlMs: 0, note: 'seats live on the merchant page' } },
    rights: LINK_ONLY_RIGHTS,
    tracking: { network: 'accesstrade', campaignId: '5222734619328835827', approval: 'pending', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_ADAPTER_VEXERE',
    tier: 'mvp',
    notes: ['Route pages (/vi-VN/ve-xe-khach-tu-<from>-di-<to>-<ids>.html) are DISCOVERED — the ids are Vexere\'s; the adapter appends the date and checks the slug names both places.', 'No composable search grammar (verified 404); the landing page is the fallback.', 'Affiliate pending → direct links (monetisation only).'],
    discovery: { site: 'vexere.com/vi-VN', subjectKind: 'route' },
  },
  {
    providerId: 'booking',
    merchantId: 'booking',
    merchantName: 'Booking.com',
    domains: ['travel'],
    intents: ['book_hotel'],
    allowedHosts: ['www.booking.com', 'booking.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary'],
    commerce: ['hotel_discovery', 'hotel_detail', 'hotel_booking', 'commerce_handoff'],
    depth: {
      book_hotel: {
        // Audit 13 Sep 2026: property page with dates/occupancy → room rows → "Tôi sẽ đặt" (L4);
        // the reserve step was not executed. Re-verified 14 Sep 2026 (read-only browser): the
        // property URL with checkin/checkout/group_adults/no_rooms applies the stay; the
        // searchresults grammar applies destination, dates and guests (L2).
        guestDepth: 4,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Trang khách sạn với ngày và số khách áp dụng, bảng phòng, nút "Tôi sẽ đặt"; bước đặt chưa thực thi trong kiểm tra.',
      },
    },
    linkStrategy: { book_hotel: ['direct', 'detail', 'configured_search'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'property slugs' }, availability: { freshnessType: 'realtime', ttlMs: 0, note: 'rooms live on the merchant page' } },
    // Booking.com programme terms: no meta-comparison, no coupons.
    rights: { displayOk: true, priceOk: false, imageOk: false, comparisonOk: false, couponOk: false },
    enabledFlag: 'CCP_ADAPTER_BOOKING',
    tier: 'mvp',
    notes: ['Direct links; CJ affiliate not activated (monetisation only).', 'NO_PRICE_COMPARISON is contractual: never in a cross-merchant price table.', 'Property grammar /hotel/vn/<slug>.vi.html?checkin=&checkout=&group_adults=&no_rooms=; results grammar /searchresults.vi.html?ss=<q>.', 'Discovery: the hotel tool\'s own OTA search returns Booking.com property rows (no extra CCP scope).'],
  },
  // ── Completion Pass additions (14 Sep 2026) — travel search providers and events ──
  {
    providerId: 'agoda',
    merchantId: 'agoda',
    merchantName: 'Agoda',
    domains: ['travel'],
    intents: ['book_hotel'],
    allowedHosts: ['www.agoda.com', 'agoda.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary'],
    commerce: ['hotel_discovery', 'hotel_detail', 'hotel_booking', 'commerce_handoff'],
    depth: {
      book_hotel: {
        // Audit 13 Sep 2026: direct property URL with dates loads (L3, untracked); the room list did
        // not render in that session, so nothing deeper is claimed. 14 Sep 2026 (read-only browser):
        // the property page shows the occupancy from the URL; /vi-vn/search?q= and ?textToSearch=
        // both DROP the query and land on the homepage — Agoda has no composable search grammar.
        guestDepth: 3,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Trang khách sạn Agoda mở với ngày/số khách từ URL; bảng phòng và bước đặt chưa xác minh.',
      },
    },
    linkStrategy: { book_hotel: ['detail', 'handoff'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'property slugs' } },
    // Agoda programme terms: no price comparison, no coupons (same class as Booking.com).
    rights: { displayOk: true, priceOk: false, imageOk: false, comparisonOk: false, couponOk: false },
    enabledFlag: 'CCP_ADAPTER_AGODA',
    tier: 'mvp',
    notes: ['Direct property links only; the Agoda programme is pending and its tools issue search-result links only — never used for a property (monetisation only).', 'No composable search grammar (query dropped, verified 14 Sep 2026); the landing page is the fallback.', 'Discovery: the hotel tool\'s own OTA search returns Agoda property rows (no extra CCP scope).'],
  },
  {
    providerId: 'traveloka',
    merchantId: 'traveloka',
    merchantName: 'Traveloka',
    domains: ['travel'],
    intents: ['book_hotel', 'book_flight'],
    allowedHosts: ['www.traveloka.com', 'traveloka.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary'],
    commerce: ['hotel_discovery', 'hotel_detail', 'hotel_booking', 'flight_booking', 'commerce_handoff'],
    depth: {
      book_flight: {
        // Verified 14 Sep 2026 (read-only browser; curl is 403): /vi-VN/flight/fullsearch?ap=SGN.HAN
        // &dt=10-10-2026.null&ps=1.0.0&sc=ECONOMY → "Một chiều: SGN → HAN, 10 thg 10 2026" with live
        // fares (L2). Audit 13 Sep: "Chọn" did not advance in automation — select step unverified.
        guestDepth: 2,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Trang kết quả chuyến bay theo ngày với giá vé (L2); bước chọn chuyến → form đặt chưa xác minh.',
      },
      book_hotel: {
        // Hotel landing (/vi-vn/hotel) verified 14 Sep 2026; property pages are index-discovered
        // (spec 11–12 Sep: dated search + property pages, L3); no dated hotel search grammar is
        // composable without Traveloka's own geo id.
        guestDepth: 3,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Trang khách sạn Traveloka (L3, theo chỉ mục — trang không hiện trong trình duyệt tự động ngày 14 Sep) khi tìm thấy; trang tìm khách sạn theo ngày cần mã địa điểm riêng của Traveloka nên không tự ghép.',
      },
    },
    linkStrategy: { book_flight: ['configured_search'], book_hotel: ['detail', 'handoff'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'route codes; property slugs' }, price: { freshnessType: 'realtime', ttlMs: 0, note: 'fares live on the results page' } },
    rights: LINK_ONLY_RIGHTS,
    // AT → Partnerize programme approved per the audit; the wrapper for this merchant has not been
    // param-echo verified, so no tracking config is declared — direct links (monetisation only).
    enabledFlag: 'CCP_ADAPTER_TRAVELOKA',
    tier: 'mvp',
    notes: ['Flights: fullsearch grammar verified 14 Sep 2026 (one-way). A second date in dt= is IGNORED by the merchant (renders "Một chiều", live UAT 14 Sep) — the return leg is page-only.', 'Hotels: property pages the hotel tool\'s OTA search returns pass through; landing fallback.'],
  },
  {
    providerId: 'vietnamairlines',
    merchantId: 'vietnamairlines',
    merchantName: 'Vietnam Airlines',
    domains: ['travel'],
    intents: ['book_flight'],
    allowedHosts: ['www.vietnamairlines.com', 'vietnamairlines.com'],
    capabilities: ['search', 'resolveDeepLink', 'transactionBoundary'],
    commerce: ['flight_booking', 'commerce_handoff'],
    depth: {
      book_flight: {
        // Audit 13 Sep 2026: no dated deep link exists (L1). Verified 14 Sep 2026 (read-only):
        // /vn/vi/buy-tickets-other-products/booking-and-manage-bookings/book-tickets → "Đặt vé máy
        // bay trực tuyến | Vietnam Airlines" (200). Route, date and passengers are entered on site.
        guestDepth: 1,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Chỉ có trang đặt vé chung (L1); Vietnam Airlines không có URL mang chặng/ngày.',
      },
    },
    linkStrategy: { book_flight: ['handoff'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: null, note: 'landing page' } },
    rights: LINK_ONLY_RIGHTS,
    // ACCESSTRADE approved with forced UTM per the audit; not param-echo verified → no wrapper.
    enabledFlag: 'CCP_ADAPTER_VIETNAMAIRLINES',
    tier: 'mvp',
    notes: ['Direct merchant handoff at L1; nothing deeper is composed.'],
  },
  {
    providerId: 'vietjet',
    merchantId: 'vietjet',
    merchantName: 'Vietjet',
    domains: ['travel'],
    intents: ['book_flight'],
    allowedHosts: ['www.vietjetair.com', 'vietjetair.com'],
    capabilities: ['search', 'resolveDeepLink', 'transactionBoundary'],
    commerce: ['flight_booking', 'commerce_handoff'],
    depth: {
      book_flight: {
        // Audit 13 Sep 2026: route landing only, no dated URL, no programme. Verified 14 Sep 2026
        // (read-only browser): https://www.vietjetair.com/vi renders the booking widget (L0/L1).
        guestDepth: 1,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Chỉ có trang chủ với ô đặt vé (L1); Vietjet không có URL mang chặng/ngày và không có chương trình tiếp thị.',
      },
    },
    linkStrategy: { book_flight: ['handoff'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: null, note: 'landing page' } },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_ADAPTER_VIETJET',
    tier: 'mvp',
    notes: ['Untracked direct handoff (no affiliate programme).'],
  },
  {
    providerId: 'ticketbox',
    merchantId: 'ticketbox',
    merchantName: 'Ticketbox',
    domains: ['entertainment'],
    intents: ['buy_event_ticket'],
    allowedHosts: ['ticketbox.vn', 'www.ticketbox.vn'],
    capabilities: ['search', 'details', 'resolveDeepLink', 'transactionBoundary'],
    commerce: ['event_discovery', 'event_detail', 'event_ticket', 'commerce_handoff'],
    depth: {
      buy_event_ticket: {
        // Audit 13 Sep 2026: event page /<slug>-<id> → date → ticket tiers with prices (L4);
        // "Mua vé ngay" opens the login modal (Cloudflare check) before ticket selection.
        // 14 Sep 2026 (read-only): /search?q=<q> returns 200 with the query preserved (L2).
        guestDepth: 4,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'before_selection',
        verifiedOn: COMPLETION_VERIFIED,
        evidence: COMPLETION_EVIDENCE,
        reason: 'Trang sự kiện hiện ngày và hạng vé; "Mua vé ngay" yêu cầu đăng nhập trước khi chọn số lượng vé.',
      },
    },
    linkStrategy: { buy_event_ticket: ['detail', 'search'] },
    freshness: { identity: { freshnessType: 'near_realtime', ttlMs: 7 * DAY, note: 'event pages expire with the event' }, availability: { freshnessType: 'realtime', ttlMs: 0, note: 'tiers and sold-out state live on the page' } },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_ADAPTER_TICKETBOX',
    tier: 'mvp',
    notes: ['Event pages are DISCOVERED (index); the search page is the composable fallback.', 'No affiliate programme; direct links.'],
    discovery: { site: 'ticketbox.vn', subjectKind: 'event' },
  },
  // ── Food delivery platforms — handoff-only FACTS (owner correction 13 Sep 2026) ──
  // GrabFood and ShopeeFood are the food_order / food_delivery providers. They are
  // NOT CCP adapters (owner decision D10: exactly five) and generate no Commerce
  // Link; the legacy order links (src/lib/platformLinks/food.ts, L2 search pages)
  // keep serving them. They are in the registry so the capability model can say
  // what the audit verified: delivery in Vietnam has NO guest checkout — L3
  // restaurant page, then a login (GrabFood) or the app (ShopeeFood).
  {
    providerId: 'grabfood',
    merchantId: 'grabfood',
    merchantName: 'GrabFood',
    domains: ['food_drink'],
    intents: ['order_delivery'],
    allowedHosts: ['food.grab.com'],
    capabilities: ['transactionBoundary'],
    // The restaurant page IS the menu page (web shows the menu; the order is taken in the app / after login).
    commerce: ['restaurant_discovery', 'restaurant_detail', 'menu', 'food_order', 'food_delivery', 'commerce_handoff'],
    depth: {
      order_delivery: {
        guestDepth: 3,
        authenticatedDepth: null,
        bestPossibleDepth: 3,
        authRequiredAt: 'before_checkout',
        verifiedOn: '2026-09-11',
        evidence: AUDIT,
        reason: 'Trang tìm kiếm (L2) và trang nhà hàng (L3, 11 Sep) mở được; giỏ hàng web có nhưng thanh toán yêu cầu đăng nhập Grab (OTP điện thoại); luồng đặt món thiên về ứng dụng. Không có guest checkout.',
      },
    },
    linkStrategy: { order_delivery: ['handoff'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'restaurant page URLs' } },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_HANDOFF_ONLY',
    tier: 'handoff_only',
    notes: ['Legacy order link = search page (L2); no adapter (D10).', 'Depth is for food_delivery only — never a statement about Food & Drink as a domain.', 'Phase 8: restaurant pages (food.grab.com/vn/vi/restaurant/…) pass through as DETAIL_HANDOFF when discovered; landing not re-verified (host blocked in the verification browser).'],
    handoffPassthrough: true,
    discovery: { site: 'food.grab.com/vn', subjectKind: 'restaurant' },
  },
  {
    providerId: 'shopeefood',
    merchantId: 'shopeefood',
    merchantName: 'ShopeeFood',
    domains: ['food_drink'],
    intents: ['order_delivery'],
    allowedHosts: ['shopeefood.vn', 'www.shopeefood.vn'],
    capabilities: ['transactionBoundary'],
    // The restaurant page IS the menu page (web shows the menu; the order is taken in the app / after login).
    commerce: ['restaurant_discovery', 'restaurant_detail', 'menu', 'food_order', 'food_delivery', 'commerce_handoff'],
    depth: {
      order_delivery: {
        guestDepth: 3,
        authenticatedDepth: null,
        bestPossibleDepth: 3,
        authRequiredAt: 'app_only',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Trang nhà hàng shopeefood.vn/<city>/<restaurant> (L3) mở được; đặt món chuyển sang ứng dụng Shopee và yêu cầu đăng nhập (xác minh 13 Sep).',
      },
    },
    linkStrategy: { order_delivery: ['handoff'] },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'restaurant page URLs' } },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_HANDOFF_ONLY',
    tier: 'handoff_only',
    notes: ['Legacy order link = search page (L2); no adapter (D10).', 'Depth is for food_delivery only — never a statement about Food & Drink as a domain.', 'Phase 8 (verified 13 Sep, read-only): shopeefood.vn has NO URL search grammar — /tim-kiem?q= lands on the city listing with the query dropped; the search is client-side. The deepest link is the restaurant page shopeefood.vn/<city>/<slug> (L3), which passes through when discovered.'],
    handoffPassthrough: true,
    discovery: { site: 'shopeefood.vn', subjectKind: 'restaurant' },
  },
]
