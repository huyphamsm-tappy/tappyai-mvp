import type { ProviderRegistryEntry } from './types'
import type { RightsFlags } from '../domain/types'

// ── Verified provider facts (13 Sep 2026) ────────────────────────────────────
// Every depth profile below is a transcription of the Transaction Depth Audit
// (claude.ai/code/artifact/5ce17dc6-1d40-454c-927e-fe3cf9291f7c) and the
// Commerce Capability Specification v0.1. Do not "improve" a number here
// without a new dated verification.

const AUDIT = 'https://claude.ai/code/artifact/5ce17dc6-1d40-454c-927e-fe3cf9291f7c'
const VERIFIED = '2026-09-13'

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
    notes: ['Affiliate approval only affects tracking, not depth.', 'Variant and quantity are page-only.'],
    discovery: { site: 'dienmayxanh.com', subjectKind: 'product' },
  },
  {
    providerId: 'tripcom',
    merchantId: 'tripcom',
    merchantName: 'Trip.com',
    domains: ['travel'],
    intents: ['book_hotel'],
    allowedHosts: ['vn.trip.com', 'www.trip.com'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary', 'tracking'],
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
  {
    providerId: 'pasgo',
    merchantId: 'pasgo',
    merchantName: 'PasGo',
    domains: ['food_drink'],
    intents: ['reserve_table'],
    allowedHosts: ['pasgo.vn', 'www.pasgo.vn'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary'],
    depth: {
      reserve_table: {
        guestDepth: 5,
        authenticatedDepth: 5,
        bestPossibleDepth: 5,
        authRequiredAt: 'none',
        verifiedOn: VERIFIED,
        evidence: AUDIT,
        reason: 'Form đặt chỗ (tên/SĐT/email/ghi chú) mở trực tiếp, giữ chỗ 5 phút, không cần đăng nhập.',
      },
    },
    freshness: {
      identity: { freshnessType: 'near_realtime', ttlMs: 7 * DAY, note: 'restaurant pages; slot validity is checked on page' },
      availability: { freshnessType: 'realtime', ttlMs: 0, note: 'unavailable time slots are rejected on the merchant page' },
    },
    rights: LINK_ONLY_RIGHTS,
    enabledFlag: 'CCP_ADAPTER_PASGO',
    tier: 'mvp',
    notes: ['No affiliate programme in use; direct deep link (Plan §9: affiliate optional).', 'Reservation URL expires with the 5-minute hold.'],
    discovery: { site: 'pasgo.vn/nha-hang', subjectKind: 'restaurant' },
  },
  {
    providerId: 'cgv',
    merchantId: 'cgv',
    merchantName: 'CGV',
    domains: ['entertainment'],
    intents: ['buy_ticket'],
    allowedHosts: ['www.cgv.vn', 'cgv.vn'],
    capabilities: ['search', 'details', 'configure', 'resolveDeepLink', 'transactionBoundary'],
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
    notes: ['Not an MVP adapter (D10).'],
  },
  {
    providerId: 'vexere',
    merchantId: 'vexere',
    merchantName: 'Vexere',
    domains: ['travel'],
    intents: ['book_transport'],
    allowedHosts: ['vexere.com', 'www.vexere.com'],
    capabilities: ['transactionBoundary', 'tracking'],
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
]
