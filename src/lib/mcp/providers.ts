// Provider ports for the hotel (Agoda) and transport (Vexere) data (owner 11/11/2026: "fully built against interfaces and fakes, wired to real adapters only when keys exist").
//
// WHAT IS BUILT: the two ports, the normalised offer shapes, the adapter that turns a HotelProvider into the Gateway's `hotels.prices` service (rows → DTO through the same mapper and allowlist as every
// other tool), the key-presence gate, and fakes for tests. WHAT IS NOT: a real HTTP client for either provider. None exists in the repo, the keys do not exist yet, and the providers' request/response contracts
// have not been seen, so writing one now would be inventing it. The place to plug one in is `HOTEL_PROVIDER_SOURCE` / `TRANSPORT_PROVIDER_SOURCE` below (supplied from src/lib/ccp/tracking, the only place allowed to read partner credentials), and until a source is configured the service stays unwired
// (PROVIDER_UNAVAILABLE), whatever the environment holds. No key is named or read in this file (see ProviderSource).
//
// Transport (Vexere) has NO published tool: the connector doc defines six tools and none is a transport search. The port exists so a later, approved tool (or the itinerary job) can use it; nothing calls it today.
import type { ServiceAdapter, ServiceCall } from './serviceMap'
import { MCP_HOTEL_SOURCE } from '@/lib/ccp/tracking/mcpHotelSource'

type Env = Record<string, string | undefined>

export interface HotelQuery { location: string; checkIn?: string; checkOut?: string; limit: number; lang: 'vi' | 'en'; signal?: AbortSignal }
export interface HotelOffer {
  name: string
  address?: string
  rating?: number
  stars?: number
  /** per night, in `currency`; an indicative price, never an availability claim */
  pricePerNight?: number
  currency?: string
  /** the provider's own page for the hotel */
  url?: string
}
export interface HotelProvider { search(q: HotelQuery): Promise<HotelOffer[]> }

export interface TransportQuery { from: string; to: string; date: string; mode: 'bus' | 'train'; limit: number; signal?: AbortSignal }
export interface TransportOption { operator: string; mode: 'bus' | 'train'; departs?: string; arrives?: string; price?: number; currency?: string; url?: string }
export interface TransportProvider { search(q: TransportQuery): Promise<TransportOption[]> }

/**
 * Where a real client will come from. The architecture guard (no-affiliate-keys-outside-ccp-tracking) lets ONLY src/lib/ccp/tracking/* read affiliate/partner credentials, so this file names NO key and reads
 * NO setting: a source supplied from that layer says whether it is configured (presence only) and builds the client. Both sources are null today: no such client exists.
 */
export interface ProviderSource<P> { isConfigured(env: Env): boolean; create(env: Env): P }
/** Agoda Affiliate Lite API through the chat's own realtime adapter (22/11/2026; supplied from ccp/tracking, see mcpHotelSource.ts). Configured only when CCP_REALTIME_AGODA_LITE is on and both Agoda credentials exist. */
export const HOTEL_PROVIDER_SOURCE: ProviderSource<HotelProvider> | null = MCP_HOTEL_SOURCE
export const TRANSPORT_PROVIDER_SOURCE: ProviderSource<TransportProvider> | null = null

export function hotelProviderFromEnv(env: Env = process.env, source: ProviderSource<HotelProvider> | null = HOTEL_PROVIDER_SOURCE): HotelProvider | null {
  return source && source.isConfigured(env) ? source.create(env) : null
}
export function transportProviderFromEnv(env: Env = process.env, source: ProviderSource<TransportProvider> | null = TRANSPORT_PROVIDER_SOURCE): TransportProvider | null {
  return source && source.isConfigured(env) ? source.create(env) : null
}

/** What the owner needs to know, without any value: is a source plugged in, and does it say it is configured. */
export function providerStatus(env: Env = process.env): { hotels: { source: boolean; configured: boolean }; transport: { source: boolean; configured: boolean } } {
  return {
    hotels: { source: HOTEL_PROVIDER_SOURCE !== null, configured: HOTEL_PROVIDER_SOURCE?.isConfigured(env) === true },
    transport: { source: TRANSPORT_PROVIDER_SOURCE !== null, configured: TRANSPORT_PROVIDER_SOURCE?.isConfigured(env) === true },
  }
}

/** A HotelProvider as the Gateway's `hotels.prices` service. Rows use the field names mapHotelRow reads, so the DTO allowlist, text cleaning and URL rules apply unchanged. */
export function hotelAdapter(provider: HotelProvider): ServiceAdapter {
  return async (c: ServiceCall) => {
    const offers = await provider.search({ location: c.location ?? c.query, checkIn: c.checkIn, checkOut: c.checkOut, limit: c.limit, lang: c.lang, signal: c.signal })
    return {
      rows: offers.slice(0, c.limit).map(o => ({
        name: o.name, address: o.address, rating_value: o.rating, stars: o.stars, price_per_night: o.pricePerNight, currency: o.currency, link: o.url,
      })),
    }
  }
}

// ── fakes (tests) ────────────────────────────────────────────────────────────────────────────────────────────────

export function fakeHotelProvider(offers: HotelOffer[], o: { fail?: boolean; hang?: boolean } = {}): HotelProvider & { calls: HotelQuery[] } {
  const calls: HotelQuery[] = []
  return {
    calls,
    async search(q) {
      calls.push(q)
      if (o.fail) throw new Error('provider down')
      if (o.hang) return new Promise<HotelOffer[]>(() => { /* never settles */ })
      return offers
    },
  }
}
export function fakeTransportProvider(options: TransportOption[]): TransportProvider & { calls: TransportQuery[] } {
  const calls: TransportQuery[] = []
  return { calls, async search(q) { calls.push(q); return options.slice(0, q.limit) } }
}
