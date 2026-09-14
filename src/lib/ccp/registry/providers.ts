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
    intents: ['book_hotel'],
    allowedHosts: ['vn.trip.com', 'www.trip.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
    // Verified: hotel detail with stay → room "Đặt" → guest form (L5 guest).
    commerce: ['hotel_discovery', 'hotel_detail', 'hotel_booking', 'commerce_handoff'],
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
    },
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
    notes: ['Deep Link tool / API only (owner decision D4).'],
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
    commerce: ['cinema_ticket', 'commerce_handoff'],
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
    freshness: {
      identity: { freshnessType: 'near_realtime', ttlMs: DAY, note: 'film slugs; showtimes read on page at click' },
      availability: { freshnessType: 'realtime', ttlMs: 0, note: 'showtimes and seats live on the merchant page' },
    },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_ADAPTER_CGV',
    tier: 'mvp',
    notes: [
      'Session URL grammar (site/<code>/seq/<session>/dy/<yyyymmdd>) was observed once as a login referer — generated only when the caller already holds a session id; never fabricated.',
    ],
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
    capabilities: ['transactionBoundary', 'tracking'],
    commerce: ['transport_booking', 'commerce_handoff'],
    depth: {
      book_transport: {
        guestDepth: 4,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Chọn chuyến → ghế → điểm đón/trả xác minh; bước thông tin khách chưa thực thi trong audit.',
      },
    },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'route slugs + ids' } },
    rights: LINK_ONLY_RIGHTS,
    tracking: { network: 'accesstrade', campaignId: '5222734619328835827', approval: 'pending', safeWrapper: 'deep_link', unsafeWrappers: [] },
    enabledFlag: 'CCP_HANDOFF_ONLY',
    tier: 'handoff_only',
    notes: ['Handoff until approval; adapter decision later (D10).'],
  },
  {
    providerId: 'booking',
    merchantId: 'booking',
    merchantName: 'Booking.com',
    domains: ['travel'],
    intents: ['book_hotel'],
    allowedHosts: ['www.booking.com', 'booking.com'],
    capabilities: ['transactionBoundary'],
    commerce: ['hotel_discovery', 'hotel_detail', 'hotel_booking', 'commerce_handoff'],
    depth: {
      book_hotel: {
        guestDepth: 4,
        authenticatedDepth: null,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Trang khách sạn có ngày, bảng phòng, nút "Tôi sẽ đặt"; bước đặt chưa thực thi trong audit.',
      },
    },
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'property slugs' } },
    // Booking.com programme terms: no meta-comparison, no coupons.
    rights: { displayOk: true, priceOk: false, imageOk: false, comparisonOk: false, couponOk: false },
    enabledFlag: 'CCP_HANDOFF_ONLY',
    tier: 'handoff_only',
    notes: ['CJ affiliate path restricted and not activated; handoff only (D10).', 'NO_PRICE_COMPARISON is contractual.'],
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
    commerce: ['restaurant_discovery', 'restaurant_detail', 'food_order', 'food_delivery', 'commerce_handoff'],
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
    commerce: ['restaurant_discovery', 'restaurant_detail', 'food_order', 'food_delivery', 'commerce_handoff'],
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
    freshness: { identity: { freshnessType: 'static', ttlMs: 30 * DAY, note: 'restaurant page URLs' } },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_HANDOFF_ONLY',
    tier: 'handoff_only',
    notes: ['Legacy order link = search page (L2); no adapter (D10).', 'Depth is for food_delivery only — never a statement about Food & Drink as a domain.', 'Phase 8 (verified 13 Sep, read-only): shopeefood.vn has NO URL search grammar — /tim-kiem?q= lands on the city listing with the query dropped; the search is client-side. The deepest link is the restaurant page shopeefood.vn/<city>/<slug> (L3), which passes through when discovered.'],
    handoffPassthrough: true,
    discovery: { site: 'shopeefood.vn', subjectKind: 'restaurant' },
  },
]
