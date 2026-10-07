// ── Realtime booking layer — normalized contract (2026-10-06) ────────────────────────────────────────────────────────────────────
//
// search(criteria) → SearchResult[] → (user picks) → recheck(item) → dynamic deeplink → the deepest booking step the provider allows.
// Affiliate tracking is NOT part of this contract: it is a separate monetisation dimension wrapped by src/lib/ccp, never a dependency.
//
// Two kinds of "live" are never conflated:
//   · REALTIME_TAPPY      — Tappy called the provider's API/feed and holds the answer (`realtimeSource` + `lastCheckedAt` are set);
//   · PROVIDER_LIVE_PAGE  — Tappy has no API: the provider's own page loads live data AFTER the click. Tappy states nothing about price.

export type Vertical = 'hotel' | 'flight' | 'bus' | 'cinema'
export type RealtimeKind = 'REALTIME_TAPPY' | 'PROVIDER_LIVE_PAGE'
export type AvailabilityStatus = 'available' | 'sold_out' | 'unknown'
export type RealtimeProviderId = 'agoda' | 'booking' | 'traveloka' | 'vexere'

/** The capability chain, best first. A provider answers at the highest level it can; it never skips down past a deeper URL it could build. */
export type CapabilityLevel = 'REALTIME_API' | 'DYNAMIC_DEEPLINK' | 'PROVIDER_PAGE'

/** Everything a search can carry. A provider keeps only the fields it supports — the rest are recorded as not preserved, never invented. */
export interface BookingContext {
  origin?: string
  destination?: string
  departureDate?: string // YYYY-MM-DD
  returnDate?: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  childrenAges?: number[]
  rooms?: number
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first'
  movie?: string
  cinema?: string
  showtime?: string
  route?: string
  trip?: string
  event?: string
  /**
   * Each provider's OWN numeric ids, when known (Booking city id ≠ Agoda city id ≠ Trip.com city id). Never shared across providers and never
   * guessed from a name: a provider with no ids of its own cannot be asked by destination.
   */
  providerRefs?: Partial<Record<RealtimeProviderId, { cityRef?: string; propertyRefs?: string[] }>>
}

export interface SearchCriteria {
  vertical: Vertical
  /** The user's words for the subject ("khách sạn Đà Lạt"); used only for labels and the deeplink fallback. */
  subject: string
  context: BookingContext
  currency?: 'VND' | 'USD'
  /** ISO country of the traveller — some providers price by it. */
  userCountry?: string
  limit?: number
}

export interface SearchResult {
  provider: RealtimeProviderId
  vertical: Vertical
  providerItemId: string
  title: string
  subtitle: string | null
  price: number | null
  currency: 'VND' | 'USD' | null
  /** Rooms / seats left when the provider says so; null otherwise. */
  availability: number | null
  availabilityStatus: AvailabilityStatus
  /** ISO time Tappy last asked the provider. Null for a PROVIDER_LIVE_PAGE result. */
  lastCheckedAt: string | null
  source: RealtimeKind
  /** Which API produced the data ("booking-demand/accommodations.search"); null for PROVIDER_LIVE_PAGE. */
  realtimeSource: string | null
  /** The provider's own https booking page on its registry hosts (validated), else null. */
  bookingUrl: string | null
  /** The provider's app URL when its contract gives one (validated https), else null. */
  deepLinkUrl: string | null
  /** The criteria this result answers, so a card can say exactly what was searched. */
  context: BookingContext
  /** Context fields the final URL does NOT visibly carry — shown to the user as "chọn lại trên trang". */
  contextMissingInUrl: string[]
  /** Opaque reference for the recheck (request/search id + item id); never a payload, never a credential. */
  rawReference: string
}

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: OutcomeReason; detail?: string }

export type OutcomeReason =
  | 'off' // feature flag OFF
  | 'credentials_missing' // BLOCKED — awaiting provider access
  | 'unsupported' // the provider cannot answer this criteria (or its schema is not public yet)
  | 'needs_location_id' // destination has no provider city id and no property ids
  | 'needs_children_ages'
  | 'timeout'
  | 'provider_error'
  | 'malformed'
  | 'empty'

export type RecheckStatus = 'ok' | 'price_changed' | 'unavailable'
export interface RecheckResult {
  status: RecheckStatus
  previousPrice: number | null
  currentPrice: number | null
  /** The refreshed result (only for 'ok' / 'price_changed'). */
  result: SearchResult | null
}

/** One bounded POST. Injectable so every test runs on fixtures; the default uses fetch with a hard timeout. */
export type HttpPost = (url: string, init: { headers: Record<string, string>; body: unknown; timeoutMs: number }) => Promise<{ status: number; json: unknown }>

export interface AdapterDeps {
  env: Record<string, string | undefined>
  http: HttpPost
  now: () => Date
  timeoutMs?: number
}

export interface RealtimeAdapter {
  provider: RealtimeProviderId
  verticals: readonly Vertical[]
  /** Server env NAMES this adapter reads — names only, never values. */
  credentialEnv: readonly string[]
  /** Feature-flag env name (default OFF). */
  flagEnv: string
  search(criteria: SearchCriteria, deps: AdapterDeps): Promise<Outcome<SearchResult[]>>
  /** Re-verify price / availability for the ONE item the user picked, immediately before the handoff. */
  recheck?(item: SearchResult, criteria: SearchCriteria, deps: AdapterDeps): Promise<Outcome<RecheckResult>>
}

export type AdapterState = 'OFF' | 'BLOCKED_CREDENTIALS' | 'READY'
