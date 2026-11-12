// Provider ports for the hotel (Agoda) and transport (Vexere) data (owner 11/11/2026: "fully built against interfaces and fakes, wired to real adapters only when keys exist").
//
// WHAT IS BUILT: the two ports, the normalised offer shapes, the adapter that turns a HotelProvider into the Gateway's `hotels.prices` service (rows → DTO through the same mapper and allowlist as every
// other tool), the key-presence gate, and fakes for tests. WHAT IS NOT: a real HTTP client for either provider. None exists in the repo, the keys do not exist yet, and the providers' request/response contracts
// have not been seen, so writing one now would be inventing it. The place to plug one in is `HOTEL_PROVIDER_FACTORY` / `TRANSPORT_PROVIDER_FACTORY` below, and until it returns a provider the service stays unwired
// (PROVIDER_UNAVAILABLE), whatever the environment holds. Key NAMES are placeholders to be confirmed with the owner; values are never read here (presence only), logged or returned.
//
// Transport (Vexere) has NO published tool: the connector doc defines six tools and none is a transport search. The port exists so a later, approved tool (or the itinerary job) can use it; nothing calls it today.
import type { ServiceAdapter, ServiceCall } from './serviceMap'

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

/** Placeholder names of the settings a provider will need. Confirm with the owner when the keys are handed over. */
export const PROVIDER_KEY_ENV = { agoda: ['AGODA_API_KEY', 'AGODA_SITE_ID'], vexere: ['VEXERE_API_KEY'] } as const

/** Are all the named settings present and non-empty? Presence only: the values are never read into any result. */
export const keysPresent = (names: readonly string[], env: Env = process.env): boolean => names.every(n => typeof env[n] === 'string' && (env[n] as string).trim() !== '')

/** The seam for the real clients. Both are null today: no real client exists. */
export const HOTEL_PROVIDER_FACTORY: ((env: Env) => HotelProvider) | null = null
export const TRANSPORT_PROVIDER_FACTORY: ((env: Env) => TransportProvider) | null = null

export function hotelProviderFromEnv(env: Env = process.env, factory: ((env: Env) => HotelProvider) | null = HOTEL_PROVIDER_FACTORY): HotelProvider | null {
  return factory && keysPresent(PROVIDER_KEY_ENV.agoda, env) ? factory(env) : null
}
export function transportProviderFromEnv(env: Env = process.env, factory: ((env: Env) => TransportProvider) | null = TRANSPORT_PROVIDER_FACTORY): TransportProvider | null {
  return factory && keysPresent(PROVIDER_KEY_ENV.vexere, env) ? factory(env) : null
}

/** What the owner needs to know, without any value: are the keys there, is a client built. */
export function providerStatus(env: Env = process.env): { agoda: { keys: boolean; client: boolean }; vexere: { keys: boolean; client: boolean } } {
  return { agoda: { keys: keysPresent(PROVIDER_KEY_ENV.agoda, env), client: HOTEL_PROVIDER_FACTORY !== null }, vexere: { keys: keysPresent(PROVIDER_KEY_ENV.vexere, env), client: TRANSPORT_PROVIDER_FACTORY !== null } }
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
