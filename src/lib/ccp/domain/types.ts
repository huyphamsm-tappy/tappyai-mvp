// ─────────────────────────────────────────────────────────────────────────────
// CCP — Commerce Capability Platform · domain model
//
// Provider-NEUTRAL types. Nothing in this file knows a merchant, a URL grammar,
// an affiliate network or a feed format. Adapters translate to and from these;
// the AI layer only ever sees a CommerceRequest going in and a CommerceLink /
// CommerceResult coming out (CCP Architecture Plan v1 §3).
//
// The five domains and the intent vocabulary are closed on purpose: a new
// intent is a product decision, not a string a caller can invent.
// ─────────────────────────────────────────────────────────────────────────────

export const COMMERCE_DOMAINS = ['food_drink', 'shopping', 'entertainment', 'travel', 'spa'] as const
export type CommerceDomain = (typeof COMMERCE_DOMAINS)[number]

export const INTENT_TYPES = [
  'buy_product',
  'book_hotel',
  'book_flight',
  'book_transport',
  'reserve_table',
  'order_delivery',
  'buy_ticket',
  'book_activity',
  'buy_spa_voucher',
] as const
export type IntentType = (typeof INTENT_TYPES)[number]

/** Which intents belong to which domain — the request validator enforces it. */
export const DOMAIN_INTENTS: Record<CommerceDomain, readonly IntentType[]> = {
  shopping: ['buy_product'],
  travel: ['book_hotel', 'book_flight', 'book_transport'],
  food_drink: ['reserve_table', 'order_delivery'],
  entertainment: ['buy_ticket', 'book_activity'],
  spa: ['buy_spa_voucher'],
}

// ── Capabilities (owner correction, 13 Sep 2026) ─────────────────────────────
// DOMAIN ≠ PROVIDER ≠ TRANSACTION TYPE. A domain contains several commerce
// capabilities; a provider declares the ones it actually supports; an intent
// asks for exactly one transactional capability; transaction depth belongs to
// the (provider, capability) pair. Food & Drink is the case that made this
// explicit: PasGo serves table_reservation at guest L5, GrabFood/ShopeeFood
// serve food_order/food_delivery at guest L3 (+ app/login boundary), and
// neither is a substitute for the other.
export const COMMERCE_CAPABILITIES = [
  // food & drink
  'restaurant_discovery',
  'restaurant_detail',
  'menu',
  'availability',
  'food_order',
  'food_delivery',
  'table_reservation',
  // shopping
  'product_discovery',
  'product_detail',
  'product_purchase',
  // travel
  'hotel_discovery',
  'hotel_detail',
  'hotel_booking',
  'flight_booking',
  'transport_booking',
  // entertainment
  'cinema_ticket',
  'activity_booking',
  // spa
  'spa_voucher',
  // cross-domain: the provider hands the user to a merchant flow
  'commerce_handoff',
] as const
export type CommerceCapability = (typeof COMMERCE_CAPABILITIES)[number]

/** The ONE transactional capability an intent asks for. Ranking compares only providers that declare it. */
export const INTENT_CAPABILITY: Record<IntentType, CommerceCapability> = {
  buy_product: 'product_purchase',
  book_hotel: 'hotel_booking',
  book_flight: 'flight_booking',
  book_transport: 'transport_booking',
  reserve_table: 'table_reservation',
  order_delivery: 'food_delivery',
  buy_ticket: 'cinema_ticket',
  book_activity: 'activity_booking',
  buy_spa_voucher: 'spa_voucher',
}

/** Which capabilities a domain contains (discovery/detail/menu included — not every one is transactional). */
export const DOMAIN_CAPABILITIES: Record<CommerceDomain, readonly CommerceCapability[]> = {
  food_drink: ['restaurant_discovery', 'restaurant_detail', 'menu', 'availability', 'food_order', 'food_delivery', 'table_reservation', 'commerce_handoff'],
  shopping: ['product_discovery', 'product_detail', 'product_purchase', 'commerce_handoff'],
  travel: ['hotel_discovery', 'hotel_detail', 'hotel_booking', 'flight_booking', 'transport_booking', 'commerce_handoff'],
  entertainment: ['cinema_ticket', 'activity_booking', 'commerce_handoff'],
  spa: ['spa_voucher', 'commerce_handoff'],
}

export function capabilityForIntent(intent: IntentType): CommerceCapability {
  return INTENT_CAPABILITY[intent]
}

// ── Transaction depth ────────────────────────────────────────────────────────
// L0 homepage · L1 landing · L2 search/results · L3 detail · L4 configured /
// selected · L5 final pre-payment / pre-confirmation step. L5 NEVER means
// TappyAI performs a payment: it is the deepest verified pre-payment boundary
// (Transaction Depth Audit, 13 Sep 2026).
export type TransactionDepth = 0 | 1 | 2 | 3 | 4 | 5

/** Where a merchant demands login. `none` = the guest reaches the pre-payment step. */
export type AuthRequiredAt =
  | 'none'
  | 'before_configuration'
  | 'before_selection' // e.g. CGV: login before the seat map; Ticketbox: before ticket quantity
  | 'before_checkout' // e.g. Klook "Đặt ngay"; CellphoneS Smember before cart
  | 'at_order' // e.g. DMX: SMS OTP only when "Đặt hàng" is pressed
  | 'app_only' // ordering exists only inside the merchant app

export interface TransactionDepthProfile {
  /** Deepest level verified for a user with no merchant account. */
  guestDepth: TransactionDepth
  /** Deepest level after the user logs in at the merchant (null = not verified). */
  authenticatedDepth: TransactionDepth | null
  /** What the merchant supports at all, regardless of verification. */
  bestPossibleDepth: TransactionDepth
  authRequiredAt: AuthRequiredAt
  /** ISO date of the last verification and where the evidence lives. */
  verifiedOn: string
  evidence: string
  /** Merchant-side reason in the audit's own words, shown to the user as a limitation. */
  reason: string
}

// ── Freshness ────────────────────────────────────────────────────────────────
export type FreshnessType = 'realtime' | 'near_realtime' | 'static' | 'unknown'

export interface FreshnessMetadata {
  /** feed:<file> · api:<endpoint> · page:<merchant> · registry (declared fact). */
  source: string
  /** ISO timestamp of the fetch that produced the value. */
  retrievedAt: string
  /** ISO timestamp after which the value must not be shown as current; null = unknown. */
  expiresAt: string | null
  freshnessType: FreshnessType
  /** 0–1. Verified today = high; verified once = medium; inferred = low. */
  confidence: number
}

// ── Configuration (user-selected parameters, provider-neutral) ───────────────
export interface ShoppingConfiguration {
  kind: 'shopping'
  /** Canonical merchant product URL or feed SKU — whichever the caller has. */
  productRef: string
  variant?: string
  quantity?: number
}
export interface HotelConfiguration {
  kind: 'hotel'
  /** Provider-side property id (Trip.com hotelId) or a merchant property URL. */
  propertyRef: string
  /** Provider-side city id where the grammar needs one. */
  cityRef?: string
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  adults: number
  children?: number
  rooms?: number
}
export interface TransportConfiguration {
  kind: 'transport'
  originRef: string
  destinationRef: string
  departDate: string // YYYY-MM-DD
  returnDate?: string
  passengers?: number
  mode: 'flight' | 'bus' | 'train'
}
export interface ReservationConfiguration {
  kind: 'reservation'
  restaurantRef: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  adults: number
  children?: number
}
export interface DeliveryConfiguration {
  kind: 'delivery'
  restaurantRef: string
  city?: string
}
export interface CinemaConfiguration {
  kind: 'cinema'
  filmRef: string
  city?: string
  cinemaRef?: string
  date?: string // YYYY-MM-DD
  showtime?: string // HH:MM
  /** Provider session id when the caller already has it (CGV `seq`). */
  sessionRef?: string
  format?: string
}
export interface ActivityConfiguration {
  kind: 'activity'
  activityRef: string
  packageRef?: string
  date?: string
  quantity?: number
}
export interface SpaConfiguration {
  kind: 'spa'
  activityRef: string
  packageRef?: string
  quantity?: number
  preferredDate?: string
  preferredTime?: string
}

export type Configuration =
  | ShoppingConfiguration
  | HotelConfiguration
  | TransportConfiguration
  | ReservationConfiguration
  | DeliveryConfiguration
  | CinemaConfiguration
  | ActivityConfiguration
  | SpaConfiguration

export type ConfigurationKind = Configuration['kind']

// ── Request ──────────────────────────────────────────────────────────────────
export interface CommerceContext {
  /** Pseudonymous actor id (HMAC of user/session) — never a raw user id or e-mail. */
  actorHash?: string
  sessionHash?: string
  platform?: 'web' | 'android' | 'ios'
  locale?: 'vi' | 'en'
  /** Owner policy: only offer links a guest can follow to their verified depth. */
  requireGuestPath?: boolean
  /** Allow affiliate wrapping when a validated wrapper exists (default true). */
  allowTracking?: boolean
}

export interface CommerceRequest {
  domain: CommerceDomain
  intentType: IntentType
  /**
   * The transactional capability requested. Optional for callers that predate
   * the capability model — the parser fills it from the intent; when present it
   * must agree with the intent (a request cannot ask PasGo for delivery).
   */
  capability?: CommerceCapability
  /** Free-text subject (product name, hotel name, dish, film title…). */
  subject: string
  configuration?: Configuration
  constraints?: {
    budgetMinVnd?: number
    budgetMaxVnd?: number
    city?: string
    merchantAllowList?: string[]
  }
  context?: CommerceContext
}

// ── Offer ────────────────────────────────────────────────────────────────────
export interface PriceObservation extends FreshnessMetadata {
  listPrice: number | null
  salePrice: number | null
  currency: 'VND'
}
export type AvailabilityState = 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN'
export interface AvailabilityObservation extends FreshnessMetadata {
  state: AvailabilityState
}

export interface RightsFlags {
  /** May feed title/description be displayed in the product? (WCR until written confirmation). */
  displayOk: boolean
  priceOk: boolean
  imageOk: boolean
  /** May this merchant appear in a cross-merchant price table? (Agoda/Booking.com: false). */
  comparisonOk: boolean
  couponOk: boolean
}

export interface Offer {
  /**
   * Phase 8: what the merchant page said about booking THIS subject when the tool layer looked
   * (read-only). true = booking widget present; false = merchant says no (such offers are not
   * created); null = not checked / no signal. Adapters must not emit a hold/checkout grammar
   * unless this is true.
   */
  bookable?: boolean | null
  providerId: string
  merchantId: string
  merchantName: string
  domain: CommerceDomain
  /** Provider-side identifier (SKU, hotelId, restaurant id, film slug, activity id). */
  subjectRef: string
  /** Canonical merchant URL for the subject, untracked. */
  canonicalUrl: string
  title: string
  price?: PriceObservation
  availability?: AvailabilityObservation
  depthProfile: TransactionDepthProfile
  rights: RightsFlags
  freshness: FreshnessMetadata
}

// ── Link ─────────────────────────────────────────────────────────────────────
export const LINK_KINDS = [
  'DIRECT_DEEP_LINK',
  'AFFILIATE_DEEP_LINK',
  'TRACKED_DEEP_LINK',
  'SEARCH_HANDOFF',
  'DETAIL_HANDOFF',
  'CONFIGURED_HANDOFF',
  'CHECKOUT_HANDOFF',
] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export type TrackingInfo =
  | { mode: 'none' }
  | { mode: 'first_party'; utm: Record<string, string> }
  | { mode: 'affiliate'; network: string; campaignId: string; subIds: Record<string, string>; utm: Record<string, string> }

export type ValidationStatus =
  | 'grammar_ok'
  | 'param_echo_ok'
  | 'target_ok'
  | 'wrapper_rejected'
  | 'unsafe_url'
  | 'grammar_unverified'
  | 'failed'

export interface LinkValidation {
  status: ValidationStatus
  /** static (grammar + host allow-list) · decode (wrapper param echo) · head (network, not used in MVP). */
  method: 'static' | 'decode' | 'head'
  checkedAt: string
  detail?: string
}

export interface CommerceLink {
  linkId: string
  /** The URL handed to the user — a tracking wrapper when one was validated, else the direct URL. */
  url: string
  /** The merchant URL the handoff lands on (what a wrapper must echo). Equals `url` when untracked. */
  directUrl: string
  kind: LinkKind
  providerId: string
  merchantId: string
  merchantName: string
  domain: CommerceDomain
  /** Depth this URL lands at for a guest. */
  depth: TransactionDepth
  depthProfile: TransactionDepthProfile
  /** Configuration fields the URL carries, and the ones the user sets on the merchant page. */
  paramsPreserved: string[]
  paramsPageOnly: string[]
  paramsDropped: string[]
  tracking: TrackingInfo
  authRequiredAt: AuthRequiredAt
  expiresAt: string | null
  freshness: FreshnessMetadata
  confidence: number
  /** Human-readable, user-facing; e.g. "CGV yêu cầu đăng nhập trước khi chọn ghế". */
  limitations: string[]
  validation: LinkValidation
}

// ── Result ───────────────────────────────────────────────────────────────────
export interface ProviderFailure {
  providerId: string
  code: 'disabled' | 'unsupported_intent' | 'no_offer' | 'error'
  detail?: string
}

export interface CommerceResult {
  requestId: string
  request: CommerceRequest
  /** Ranked best first. Empty is a valid result, not an error. */
  links: CommerceLink[]
  offers: Offer[]
  providersQueried: string[]
  providersFailed: ProviderFailure[]
  /** Ranking weight version that produced the order. */
  rankingVersion: string
  generatedAt: string
}
