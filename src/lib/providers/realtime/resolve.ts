import { resolveCommerce, type CommerceLink, type CommerceRequest, type DiscoveryHint } from '@/lib/ccp'
import { mergeRefs, verifiedRefsFor, type LocateFn } from './locations'
import { agodaAdapter } from './agoda'
import { bookingDemandAdapter } from './bookingDemand'
import { locateRefs } from './locate'
import { adapterState, claimableAvailability, claimablePrice, defaultHttp, logRealtime } from './common'
import { travelokaAdapter, vexereAdapter } from './skeletons'
import type { AdapterDeps, AdapterState, CapabilityLevel, HttpPost, OutcomeReason, RealtimeAdapter, RealtimeProviderId, RecheckResult, SearchCriteria, SearchResult, Vertical } from './types'

// ── The fallback chain (owner brief 06/10) ──────────────────────────────────────────────────────────────────────────────────────
//
//   REALTIME_API  → results Tappy holds (price, availability, lastCheckedAt) + the provider's own booking URL
//        ↓ flag OFF · credentials missing · timeout · malformed · empty · the criteria cannot be asked
//   DYNAMIC_DEEPLINK → the deepest CCP link that carries the search (route/date/guests/property) — the provider page loads live data after the click
//        ↓ only when no deeper URL can be composed
//   PROVIDER_PAGE → the best page the provider allows (never the homepage if something deeper exists)
//
// Affiliate wrapping is applied (or not) inside src/lib/ccp and is invisible here: it never changes which level a provider reaches.

export const REALTIME_ADAPTERS: readonly RealtimeAdapter[] = [bookingDemandAdapter, agodaAdapter, travelokaAdapter, vexereAdapter]

export interface ProviderStatus {
  provider: RealtimeProviderId
  state: AdapterState
  /** Credential env NAMES that are missing (BLOCKED — awaiting provider access). Names only. */
  missing: string[]
  /** Why the realtime layer did not answer for this search (when it was asked). */
  reason: OutcomeReason | null
}

export interface FallbackLink {
  provider: string
  merchantName: string
  level: CapabilityLevel
  depth: number
  /** The URL handed to the user (tracking wrapper if CCP validated one, else direct). */
  url: string
  directUrl: string
  paramsPreserved: string[]
  paramsPageOnly: string[]
  paramsDropped: string[]
  limitations: string[]
}

export interface BookingResolution {
  vertical: Vertical
  /** The best level reached across providers. */
  level: CapabilityLevel
  realtime: SearchResult[]
  links: FallbackLink[]
  statuses: ProviderStatus[]
}

export interface ResolveDeps {
  env?: AdapterDeps['env']
  http?: HttpPost
  now?: () => Date
  timeoutMs?: number
  adapters?: readonly RealtimeAdapter[]
  /** Pages the conversation already discovered (a Vexere route page, a hotel page) — handed to the CCP exactly as in chat. */
  hints?: DiscoveryHint[]
  /** Test seam for the CCP call. */
  commerce?: typeof resolveCommerce
  /** false = realtime only: the caller (chat) already attaches the dynamic deeplinks, so the CCP fallback is skipped. Default true. */
  fallbackLinks?: boolean
  /** Destination → provider ids lookup (an API call), used only for READY providers with no verified id. Absent until access is granted. */
  locate?: LocateFn
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

/** The CCP request that corresponds to the search (the same shapes chat already sends). Null = the CCP has no path for it. */
export function toCommerceRequest(c: SearchCriteria): CommerceRequest | null {
  const x = c.context
  if (c.vertical === 'hotel' && x.checkIn && x.checkOut && x.adults) {
    const ref = x.destination ? slug(x.destination) : slug(c.subject)
    if (!ref) return null
    // Each provider's own ids travel in constraints.providerRefs (only Agoda's grammar reads them today); the shared hotel `cityRef` is Trip.com's and is never set from here.
    const agoda = x.providerRefs?.agoda
    const providerRefs = agoda?.cityRef ? { agoda: { cityRef: agoda.cityRef, ...(agoda.propertyRefs?.[0] ? { propertyRef: agoda.propertyRefs[0] } : {}) } } : undefined
    return { domain: 'travel', intentType: 'book_hotel', subject: c.subject, constraints: { ...(x.destination ? { city: x.destination } : {}), ...(providerRefs ? { providerRefs } : {}) }, configuration: { kind: 'hotel', propertyRef: ref, checkIn: x.checkIn, checkOut: x.checkOut, adults: x.adults, ...(x.children !== undefined ? { children: x.children } : {}), ...(x.rooms !== undefined ? { rooms: x.rooms } : {}) } }
  }
  if ((c.vertical === 'flight' || c.vertical === 'bus') && x.origin && x.destination && x.departureDate) {
    const mode = c.vertical === 'flight' ? 'flight' : 'bus'
    const origin = mode === 'flight' ? x.origin.toUpperCase() : slug(x.origin)
    const destination = mode === 'flight' ? x.destination.toUpperCase() : slug(x.destination)
    if (!origin || !destination) return null
    return { domain: 'travel', intentType: mode === 'flight' ? 'book_flight' : 'book_transport', subject: c.subject, configuration: { kind: 'transport', originRef: origin, destinationRef: destination, departDate: x.departureDate, ...(x.returnDate ? { returnDate: x.returnDate } : {}), ...(x.adults ? { passengers: x.adults } : {}), ...(x.cabinClass ? { cabin: x.cabinClass } : {}), mode } }
  }
  return null
}

const levelOf = (l: CommerceLink): CapabilityLevel => (l.depth >= 2 && l.paramsPreserved.length > 0 ? 'DYNAMIC_DEEPLINK' : 'PROVIDER_PAGE')

function fallbackLinks(c: SearchCriteria, deps: ResolveDeps, now: Date): FallbackLink[] {
  const req = toCommerceRequest(c)
  if (!req) return []
  const res = (deps.commerce ?? resolveCommerce)({ ...req, context: { allowTracking: true } }, { hints: deps.hints, now, enabled: true })
  if (!('links' in res)) return []
  const links = res.links
    .map((l): FallbackLink => ({ provider: l.providerId, merchantName: l.merchantName, level: levelOf(l), depth: l.depth, url: l.url, directUrl: l.directUrl, paramsPreserved: l.paramsPreserved, paramsPageOnly: l.paramsPageOnly, paramsDropped: l.paramsDropped, limitations: l.limitations }))
  // Deepest first; a provider's shallow link is dropped when a deeper URL for the SAME provider exists (never the homepage if deeper is possible).
  const deepest = new Map<string, number>()
  for (const l of links) deepest.set(l.provider, Math.max(deepest.get(l.provider) ?? 0, l.depth))
  return links.filter(l => l.depth >= (deepest.get(l.provider) ?? 0)).sort((a, b) => b.depth - a.depth)
}

/**
 * Search the realtime adapters that are READY (flag ON + credentials) and, whatever they answer, attach the dynamic-deeplink fallback.
 * Never throws; a provider that is OFF or BLOCKED costs nothing and is reported in `statuses`.
 */
export async function resolveBooking(criteria: SearchCriteria, deps: ResolveDeps = {}): Promise<BookingResolution> {
  const env = deps.env ?? (process.env as AdapterDeps['env'])
  const now = deps.now ?? (() => new Date())
  const adapterDeps: AdapterDeps = { env, http: deps.http ?? defaultHttp, now, timeoutMs: deps.timeoutMs }
  const statuses: ProviderStatus[] = []
  const realtime: SearchResult[] = []

  for (const a of deps.adapters ?? REALTIME_ADAPTERS) {
    if (!a.verticals.includes(criteria.vertical)) continue
    const { state, missing } = adapterState(a, env)
    if (state !== 'READY') { statuses.push({ provider: a.provider, state, missing, reason: state === 'OFF' ? 'off' : 'credentials_missing' }); continue }
    const started = Date.now()
    const withRefs = await locateRefs(a.provider, criteria, deps.locate)
    const r = await a.search(withRefs, adapterDeps)
    logRealtime(a.provider, 'search', { ok: r.ok, ...(r.ok ? { results: r.value.length } : { reason: r.reason }), latencyMs: Date.now() - started })
    if (r.ok) { realtime.push(...r.value); statuses.push({ provider: a.provider, state, missing: [], reason: null }) }
    else statuses.push({ provider: a.provider, state, missing: [], reason: r.reason })
  }

  // The deeplink fallback also benefits from the verified ids (Agoda / Đà Lạt) — still only for the provider each id belongs to.
  const withVerified: SearchCriteria = { ...criteria, context: { ...criteria.context, providerRefs: mergeRefs(criteria.context.providerRefs, verifiedRefsFor(criteria.context.destination)) } }
  const links = deps.fallbackLinks === false ? [] : fallbackLinks(withVerified, deps, now())
  const level: CapabilityLevel = realtime.length ? 'REALTIME_API' : links.some(l => l.level === 'DYNAMIC_DEEPLINK') ? 'DYNAMIC_DEEPLINK' : 'PROVIDER_PAGE'
  return { vertical: criteria.vertical, level, realtime, links, statuses }
}

/** Re-verify the ONE item the user picked, right before the handoff. A provider with no recheck (or a failure) never claims a fresh price. */
export async function recheckBeforeHandoff(item: SearchResult, criteria: SearchCriteria, deps: ResolveDeps = {}): Promise<RecheckResult | { status: 'unchecked'; reason: OutcomeReason }> {
  const env = deps.env ?? (process.env as AdapterDeps['env'])
  const a = (deps.adapters ?? REALTIME_ADAPTERS).find(x => x.provider === item.provider)
  if (!a?.recheck) return { status: 'unchecked', reason: 'unsupported' }
  const { state } = adapterState(a, env)
  if (state !== 'READY') return { status: 'unchecked', reason: state === 'OFF' ? 'off' : 'credentials_missing' }
  const started = Date.now()
  const r = await a.recheck(item, criteria, { env, http: deps.http ?? defaultHttp, now: deps.now ?? (() => new Date()), timeoutMs: deps.timeoutMs })
  logRealtime(a.provider, 'recheck', { ok: r.ok, ...(r.ok ? {} : { reason: r.reason }), latencyMs: Date.now() - started })
  return r.ok ? r.value : { status: 'unchecked', reason: r.reason }
}

// ── user-facing wording: a live claim is made only for a fresh REALTIME_TAPPY result ───────────────────────────────────────────────
const vnd = (n: number, cur: 'VND' | 'USD') => (cur === 'VND' ? `${Math.round(n).toLocaleString('vi-VN')}đ` : `${n} USD`)
/** HH:mm in Vietnam time — the time the user would read on their own clock. */
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
const MERCHANT: Record<RealtimeProviderId, string> = { agoda: 'Agoda', booking: 'Booking.com', traveloka: 'Traveloka', vexere: 'Vexere' }

/**
 * The only sentences about price/availability. A fresh REALTIME_TAPPY result → the number with the time Tappy checked it; anything else →
 * the honest "checked on the provider's page when you open it". Never "giá realtime" without an API answer inside its TTL.
 */
export function liveSentence(r: SearchResult, now: Date): string {
  const price = claimablePrice(r, now)
  const avail = claimableAvailability(r, now)
  if (price !== null && r.currency && r.lastCheckedAt) {
    const left = avail === 'available' && r.availability !== null ? `, còn ${r.availability} phòng` : avail === 'sold_out' ? ', hết phòng' : ''
    return `${vnd(price, r.currency)} (Tappy kiểm tra lúc ${hhmm(r.lastCheckedAt)}${left}) — sẽ kiểm tra lại khi bạn chọn.`
  }
  return pageSentence(r.provider)
}

export const pageSentence = (provider: RealtimeProviderId | string): string => {
  const name = MERCHANT[provider as RealtimeProviderId] ?? provider
  return `Giá và tình trạng phòng được kiểm tra trên ${name} khi bạn mở trang.`
}

/** After a recheck: what the user is told when the number moved or the room is gone. */
export function recheckSentence(r: RecheckResult | { status: 'unchecked'; reason: OutcomeReason }, provider: RealtimeProviderId): string {
  if (r.status === 'unchecked') return pageSentence(provider)
  if (r.status === 'unavailable') return `${MERCHANT[provider]} báo hết chỗ cho lựa chọn này — hãy chọn phương án khác.`
  if (r.status === 'price_changed' && r.currentPrice !== null && r.result?.currency) return `Giá đã đổi còn ${vnd(r.currentPrice, r.result.currency)} khi kiểm tra lại — kiểm tra lần cuối trên trang ${MERCHANT[provider]}.`
  return 'Giá và tình trạng còn nguyên khi kiểm tra lại.'
}
