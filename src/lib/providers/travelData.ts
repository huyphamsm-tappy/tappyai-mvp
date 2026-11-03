// ── Provider-neutral travel / cinema data contract (P0 data-source resolution, 2026-10-04) ───────────────────────────────────────
//
// WHY THIS EXISTS WITHOUT A LIVE PROVIDER. Audit (docs/audit/DATA-SOURCE-RESOLUTION.md):
//   · Traveloka — affiliate (Partnerize via ACCESSTRADE) APPROVED = tracked deep links only. Real data needs the Traveloka Partners
//     Network "Loka" API: partner registration → NDA → commercial agreement → docs + credentials (+ testing environment).
//   · Vexere — affiliate (ACCESSTRADE) APPROVED = tracked route/date links only. Real data needs "Tích hợp hệ thống - API"
//     (daily.vexere.com registration + commercial agreement; no public docs).
//   · Moveek / cinema chains — no official API, feed or affiliate programme; commercial contact only.
// No provider schema is public, so no provider-specific parser is written here (that would be a guess). This module is the part
// that is safe to build now: the normalized contract the agent's tools will expose, freshness semantics, strict validation, a
// booking-URL allow-list from the commerce registry, and a provider PORT whose default answer is UNAVAILABLE (access pending).
// When an agreement lands, only the provider → contract mapping is new; the agent architecture is untouched (FROZEN).
//
// Rules enforced here (owner P0 brief §6, §10):
//   · a dynamic field (fare, availability, seats, showtime, ticket price) may be stated as current ONLY when source_status is
//     VERIFIED — `claimableFare`, `claimableSeats`, `claimableShowtime`, `claimableTicketPrice`;
//   · VERIFIED decays to STALE by field-specific TTLs; nothing old is ever presented as current;
//   · provider content is untrusted: numbers, currencies, dates, IDs and URLs are validated; anything invalid is dropped, never
//     repaired by guessing; booking URLs must be https on the provider's own registry hosts;
//   · credentials are never part of a result (results carry no request, header or token fields).

import { PROVIDER_REGISTRY } from '@/lib/ccp/registry'

export type SourceStatus = 'VERIFIED' | 'UNVERIFIED' | 'STALE' | 'UNAVAILABLE'
export type TravelProviderId = 'traveloka' | 'vexere' | 'moveek'

/** Freshness windows for VERIFIED dynamic data (ms). Fares and seats move fast; a showtime schedule changes daily. */
export const FRESHNESS_TTL_MS = {
  fare: 15 * 60_000,
  availability: 5 * 60_000,
  showtime: 6 * 60 * 60_000,
  ticketPrice: 60 * 60_000,
} as const

export interface FlightResult {
  provider: TravelProviderId
  flight_id: string
  airline: string | null
  origin: string
  destination: string
  departure: string | null
  arrival: string | null
  duration_min: number | null
  fare: number | null
  currency: 'VND' | 'USD' | null
  availability: number | null
  booking_url: string | null
  verified_at: string | null
  source_status: SourceStatus
}

export interface BusResult {
  provider: TravelProviderId
  trip_id: string
  operator: string | null
  origin: string
  destination: string
  departure: string | null
  arrival: string | null
  duration_min: number | null
  vehicle_type: string | null
  fare: number | null
  currency: 'VND' | 'USD' | null
  available_seats: number | null
  pickup_points: string[]
  dropoff_points: string[]
  booking_url: string | null
  verified_at: string | null
  source_status: SourceStatus
}

export interface CinemaShowtimeResult {
  provider: TravelProviderId
  movie_id: string
  movie_title: string
  cinema_id: string | null
  cinema_name: string | null
  address: string | null
  showtime: string | null
  date: string | null
  format: string | null
  language: string | null
  ticket_price: number | null
  availability: number | null
  booking_url: string | null
  verified_at: string | null
  source_status: SourceStatus
}

// ── validation primitives (untrusted input) ───────────────────────────────────────────────────────────────────────────────────
const ID = /^[A-Za-z0-9._:-]{1,80}$/
const IATA_OR_CITY = /^[\p{L}\p{N} .,'-]{2,60}$/u
const str = (v: unknown, max = 120): string | null => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null
const id = (v: unknown): string | null => { const s = typeof v === 'number' ? String(v) : str(v, 80); return s && ID.test(s) ? s : null }
const iso = (v: unknown): string | null => { const s = str(v, 40); return s && !Number.isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null }
const money = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e10 ? v : null
const count = (v: unknown): number | null => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 10_000 ? v : null
const minutes = (v: unknown): number | null => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 48 * 60 ? v : null
const currency = (v: unknown): 'VND' | 'USD' | null => v === 'VND' || v === 'USD' ? v : null
const strList = (v: unknown): string[] => Array.isArray(v) ? v.map(x => str(x, 160)).filter((x): x is string => !!x).slice(0, 20) : []

/** A booking URL is kept only when it is https on the provider's OWN registry hosts (the commerce allow-list). */
export function allowedBookingUrl(provider: TravelProviderId, v: unknown): string | null {
  const s = str(v, 2000)
  if (!s) return null
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password) return null
  // Moveek has no registry entry (no programme) → no host is allowed for it.
  const hosts: readonly string[] = PROVIDER_REGISTRY.find(p => p.providerId === provider)?.allowedHosts ?? []
  return hosts.includes(u.hostname.toLowerCase()) ? u.toString() : null
}

/** The status a field may carry NOW: VERIFIED only within its TTL of `verified_at`; otherwise STALE; no timestamp → UNVERIFIED. */
export function freshness(status: SourceStatus, verifiedAt: string | null, ttlMs: number, now: Date): SourceStatus {
  if (status !== 'VERIFIED') return status
  const t = verifiedAt ? Date.parse(verifiedAt) : NaN
  if (!Number.isFinite(t)) return 'UNVERIFIED'
  const age = now.getTime() - t
  if (age < -60_000) return 'UNVERIFIED' // a timestamp from the future is not evidence
  return age <= ttlMs ? 'VERIFIED' : 'STALE'
}

/** What a provider said about its own record. Anything not explicitly 'VERIFIED' is UNVERIFIED (never upgraded). */
const declared = (v: unknown): SourceStatus => v === 'VERIFIED' ? 'VERIFIED' : v === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'UNVERIFIED'

// ── normalizers: provider records ALREADY MAPPED to contract field names → validated contract (null = record rejected) ───────
export function normalizeFlight(provider: TravelProviderId, raw: unknown, now = new Date()): FlightResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const flight_id = id(r.flight_id), origin = str(r.origin, 60), destination = str(r.destination, 60)
  if (!flight_id || !origin || !destination || !IATA_OR_CITY.test(origin) || !IATA_OR_CITY.test(destination)) return null
  const verified_at = iso(r.verified_at)
  const fare = money(r.fare), cur = currency(r.currency)
  return {
    provider, flight_id, airline: str(r.airline, 80), origin, destination,
    departure: iso(r.departure), arrival: iso(r.arrival), duration_min: minutes(r.duration_min),
    // a fare without a valid currency is not a fare
    fare: fare !== null && cur ? fare : null, currency: fare !== null && cur ? cur : null,
    availability: count(r.availability), booking_url: allowedBookingUrl(provider, r.booking_url),
    verified_at, source_status: freshness(declared(r.source_status), verified_at, FRESHNESS_TTL_MS.fare, now),
  }
}

export function normalizeBus(provider: TravelProviderId, raw: unknown, now = new Date()): BusResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const trip_id = id(r.trip_id), origin = str(r.origin, 60), destination = str(r.destination, 60)
  if (!trip_id || !origin || !destination) return null
  const verified_at = iso(r.verified_at)
  const fare = money(r.fare), cur = currency(r.currency)
  return {
    provider, trip_id, operator: str(r.operator, 80), origin, destination,
    departure: iso(r.departure), arrival: iso(r.arrival), duration_min: minutes(r.duration_min), vehicle_type: str(r.vehicle_type, 60),
    fare: fare !== null && cur ? fare : null, currency: fare !== null && cur ? cur : null,
    available_seats: count(r.available_seats), pickup_points: strList(r.pickup_points), dropoff_points: strList(r.dropoff_points),
    booking_url: allowedBookingUrl(provider, r.booking_url),
    verified_at, source_status: freshness(declared(r.source_status), verified_at, FRESHNESS_TTL_MS.fare, now),
  }
}

export function normalizeShowtime(provider: TravelProviderId, raw: unknown, now = new Date()): CinemaShowtimeResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const movie_id = id(r.movie_id), movie_title = str(r.movie_title, 160)
  if (!movie_id || !movie_title) return null
  const verified_at = iso(r.verified_at)
  return {
    provider, movie_id, movie_title, cinema_id: id(r.cinema_id), cinema_name: str(r.cinema_name, 120), address: str(r.address, 200),
    showtime: iso(r.showtime), date: iso(r.date), format: str(r.format, 20), language: str(r.language, 40),
    ticket_price: money(r.ticket_price), availability: count(r.availability), booking_url: allowedBookingUrl(provider, r.booking_url),
    verified_at, source_status: freshness(declared(r.source_status), verified_at, FRESHNESS_TTL_MS.showtime, now),
  }
}

// ── what the agent may state as CURRENT (everything else is "chưa xác minh") ───────────────────────────────────────────────────
export const claimableFare = (r: FlightResult | BusResult, now = new Date()): number | null =>
  r.fare !== null && freshness(r.source_status, r.verified_at, FRESHNESS_TTL_MS.fare, now) === 'VERIFIED' ? r.fare : null
export const claimableSeats = (r: FlightResult | BusResult, now = new Date()): number | null => {
  const n = 'available_seats' in r ? r.available_seats : r.availability
  return n !== null && freshness(r.source_status, r.verified_at, FRESHNESS_TTL_MS.availability, now) === 'VERIFIED' ? n : null
}
export const claimableShowtime = (r: CinemaShowtimeResult, now = new Date()): string | null =>
  r.showtime !== null && freshness(r.source_status, r.verified_at, FRESHNESS_TTL_MS.showtime, now) === 'VERIFIED' ? r.showtime : null
export const claimableTicketPrice = (r: CinemaShowtimeResult, now = new Date()): number | null =>
  r.ticket_price !== null && freshness(r.source_status, r.verified_at, FRESHNESS_TTL_MS.ticketPrice, now) === 'VERIFIED' ? r.ticket_price : null

// ── provider PORT: one bounded call per question; the default for every provider today is UNAVAILABLE (access pending) ──────────
export type ProviderOutcome<T> =
  | { status: 'OK'; results: T[] }
  | { status: 'UNAVAILABLE'; reason: 'access_pending' | 'timeout' | 'provider_error' | 'malformed'; detail?: string }

export interface ProviderAccess {
  provider: TravelProviderId
  /** The exact official channel that would unlock data. */
  officialChannel: string
  /** Server env names the adapter will read (names only — never values in code, logs or results). */
  credentialEnv: readonly string[]
}

export const PROVIDER_ACCESS: Record<TravelProviderId, ProviderAccess> = {
  traveloka: { provider: 'traveloka', officialChannel: 'Traveloka Partners Network (Loka API) — partner registration, NDA, commercial agreement', credentialEnv: ['TRAVELOKA_TPN_CLIENT_ID', 'TRAVELOKA_TPN_CLIENT_SECRET', 'TRAVELOKA_TPN_BASE_URL'] },
  vexere: { provider: 'vexere', officialChannel: 'Vexere "Tích hợp hệ thống - API" (daily.vexere.com registration + agreement)', credentialEnv: ['VEXERE_API_KEY', 'VEXERE_API_BASE_URL'] },
  moveek: { provider: 'moveek', officialChannel: 'none published — commercial contact with Moveek (CÔNG TY TNHH MONET) or each cinema chain', credentialEnv: [] },
}

/**
 * Bounded provider call (timeout, never throws). `fetchRecords` is the provider mapping that exists only once an agreement and
 * docs exist; until then every provider answers UNAVAILABLE/access_pending — the tools keep the honest "chưa xác minh" + links.
 */
export async function callProvider<T>(
  provider: TravelProviderId,
  normalize: (raw: unknown) => T | null,
  fetchRecords: ((signal: AbortSignal) => Promise<unknown[]>) | null,
  timeoutMs = 6_000,
): Promise<ProviderOutcome<T>> {
  if (!fetchRecords) return { status: 'UNAVAILABLE', reason: 'access_pending', detail: PROVIDER_ACCESS[provider].officialChannel }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const raw = await Promise.race([
      fetchRecords(ctl.signal),
      new Promise<never>((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('timeout')))),
    ])
    if (!Array.isArray(raw)) return { status: 'UNAVAILABLE', reason: 'malformed' }
    const results = raw.map(normalize).filter((x): x is T => x !== null).slice(0, 20)
    return raw.length > 0 && results.length === 0 ? { status: 'UNAVAILABLE', reason: 'malformed' } : { status: 'OK', results }
  } catch (e) {
    return { status: 'UNAVAILABLE', reason: e instanceof Error && e.message === 'timeout' ? 'timeout' : 'provider_error' }
  } finally {
    clearTimeout(timer)
  }
}

// ── §6 wording + §7 context reuse ─────────────────────────────────────────────────────────────────────────────────────────────
const vnd = (n: number, cur: 'VND' | 'USD') => cur === 'VND' ? `${Math.round(n).toLocaleString('vi-VN')}đ` : `${n} USD`

/** The only two fare sentences allowed: a VERIFIED fresh number, or the honest "chưa xác minh". */
export function fareSentence(r: FlightResult | BusResult, now = new Date()): string {
  const f = claimableFare(r, now)
  return f !== null && r.currency ? `Giá hiện tại là ${vnd(f, r.currency)}.` : 'Hiện Tappy chưa xác minh được giá realtime.'
}

/**
 * Follow-up turns ("giá bao nhiêu?", "chuyến sáng?") work on the results already carried in the conversation: if the carried
 * records are still fresh they are reused as-is (no call); if not, ONE bounded refresh of the SAME query is requested — never a
 * full plan rerun. `pick` selects the subset a follow-up refers to (e.g. morning departures) from the carried set.
 */
export function reuseCarried<T extends { source_status: SourceStatus; verified_at: string | null }>(
  carried: readonly T[],
  pick: (r: T) => boolean,
  ttlMs: number,
  now = new Date(),
): { action: 'reuse'; results: T[] } | { action: 'refresh_same_query' } | { action: 'none_matching' } {
  const subset = carried.filter(pick)
  if (subset.length === 0) return { action: 'none_matching' }
  const stale = subset.some(r => r.source_status === 'VERIFIED' && freshness(r.source_status, r.verified_at, ttlMs, now) !== 'VERIFIED')
  return stale ? { action: 'refresh_same_query' } : { action: 'reuse', results: subset }
}
